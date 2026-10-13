import type { BulkResult, ImportProgress, RawMessage, Settings } from "../../core/types";
import { isProWorkflowSender } from "../../core/settings";
import type { MailProvider, OriginalMessage, Profile, SpecialFolders } from "../mailProvider";
import { GraphAuth } from "./auth";
import { GraphClient, GraphError, type BatchRequest, type Page } from "./graphClient";

/**
 * The real mailbox, through Microsoft Graph with delegated permissions.
 *
 * Reading
 *   /me/messages spans every folder, so notifications are found wherever the user (or a rule)
 *   filed them. Each approved sender address gets its own filtered query.
 *
 * Staying in sync
 *   Delta queries work per folder and cannot filter by sender, which is a poor fit for mail that
 *   lives in several folders. Instead each sync asks for ProWorkflow messages whose
 *   lastModifiedDateTime is newer than the previous sync. That returns new mail, read/unread
 *   changes and folder moves in one small request.
 *
 * Identity
 *   `Prefer: IdType="ImmutableId"` makes message IDs survive folder moves (including Archive),
 *   so a message is never duplicated or lost when it is filed.
 */

const SELECT =
  "id,internetMessageId,subject,from,receivedDateTime,lastModifiedDateTime,isRead,parentFolderId,hasAttachments,webLink,body";
const PREFER_TEXT = { Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' };
const PREFER_ID = { Prefer: 'IdType="ImmutableId"' };
const PAGE_SIZE = 50;

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime: string;
  isRead?: boolean;
  parentFolderId?: string;
  hasAttachments?: boolean;
  webLink?: string;
  body?: { contentType?: string; content?: string };
}

function query(params: Record<string, string>): string {
  return (
    "/me/messages?" +
    Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&")
  );
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function messagePath(id: string): string {
  return `/me/messages/${encodeURIComponent(id)}`;
}

export function toRaw(m: GraphMessage): RawMessage {
  return {
    id: m.id,
    internetMessageId: m.internetMessageId,
    subject: m.subject ?? "",
    fromName: m.from?.emailAddress?.name ?? "",
    fromAddress: m.from?.emailAddress?.address ?? "",
    receivedDateTime: m.receivedDateTime,
    isRead: m.isRead ?? false,
    parentFolderId: m.parentFolderId,
    hasAttachments: m.hasAttachments ?? false,
    webLink: m.webLink,
    bodyText: m.body?.content ?? "",
  };
}

/** The parts of Outlook the provider needs. Replaced by a stub in tests. */
export interface OutlookHost {
  openMessage(restId: string): boolean;
  openLink(url: string): void;
}

export const officeHost: OutlookHost = {
  openMessage(restId: string): boolean {
    try {
      const mailbox = Office.context.mailbox;
      const ewsId = mailbox.convertToEwsId(restId, Office.MailboxEnums.RestVersion.v2_0);
      mailbox.displayMessageForm(ewsId);
      return true;
    } catch {
      return false;
    }
  },
  openLink(url: string): void {
    window.open(url, "_blank", "noopener");
  },
};

export class GraphProvider implements MailProvider {
  readonly mode = "graph" as const;
  /** True when the preferred sync query was rejected and sync only picks up new mail. */
  syncDegraded = false;

  constructor(
    private client: GraphClient,
    private signIn: (interactive: boolean) => Promise<void>,
    private host: OutlookHost = officeHost
  ) {}

  async connect(interactive: boolean): Promise<Profile> {
    await this.signIn(interactive);
    const me = await this.client.request<{ displayName?: string; mail?: string; userPrincipalName?: string }>(
      "GET",
      "/me?$select=displayName,mail,userPrincipalName"
    );
    return { displayName: me.displayName ?? "", address: me.mail ?? me.userPrincipalName ?? "" };
  }

  async getSpecialFolders(): Promise<SpecialFolders> {
    const res = await this.client.batch([
      { id: "archive", method: "GET", url: "/me/mailFolders/archive?$select=id" },
      { id: "deleted", method: "GET", url: "/me/mailFolders/deleteditems?$select=id" },
    ]);
    const idOf = (key: string) => {
      const r = res.get(key);
      return r && r.status === 200 ? (r.body?.id as string | undefined) : undefined;
    };
    return { archive: idOf("archive"), deleted: idOf("deleted") };
  }

  async importHistory(
    settings: Settings,
    sinceIso: string,
    onPage: (messages: RawMessage[], progress: ImportProgress) => void
  ): Promise<void> {
    const seen = new Set<string>();
    let processed = 0;
    let total = 0;
    let totalKnown = settings.senderDomains.length === 0;

    const emit = (items: GraphMessage[], counted: number) => {
      const fresh: RawMessage[] = [];
      for (const item of items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        const raw = toRaw(item);
        if (isProWorkflowSender(raw.fromAddress, settings) && raw.receivedDateTime >= sinceIso) fresh.push(raw);
      }
      processed += counted;
      onPage(fresh, { processed, total: totalKnown ? Math.max(total, processed) : undefined });
    };

    for (const address of settings.senderAddresses) {
      const base = {
        $filter: `receivedDateTime ge ${sinceIso} and from/emailAddress/address eq ${quote(address.trim())}`,
        $orderby: "receivedDateTime desc",
        $top: String(PAGE_SIZE),
        $select: SELECT,
      };
      let first = true;
      for await (const page of this.pagesWithCount(base)) {
        if (first) {
          if (typeof page["@odata.count"] === "number") total += page["@odata.count"];
          else totalKnown = false;
          first = false;
        }
        emit(page.value, page.value.length);
      }
    }

    // Domains cannot be expressed as a $filter, so they use mailbox search and are verified here.
    for (const domain of settings.senderDomains) {
      const path = query({ $search: `"from:${domain.trim().replace(/^@/, "")}"`, $top: String(PAGE_SIZE), $select: SELECT });
      for await (const page of this.client.pages<GraphMessage>(path, PREFER_TEXT)) {
        emit(page.value, page.value.length);
        const allOlder = page.value.length > 0 && page.value.every((m) => m.receivedDateTime < sinceIso);
        if (allOlder) break;
      }
    }
  }

  /** Ask for the total once; if the service rejects $count, carry on without it. */
  private async *pagesWithCount(base: Record<string, string>): AsyncGenerator<Page<GraphMessage>> {
    try {
      const first = await this.client.request<Page<GraphMessage>>("GET", query({ ...base, $count: "true" }), {
        headers: PREFER_TEXT,
      });
      yield first;
      if (first["@odata.nextLink"]) yield* this.client.pages<GraphMessage>(first["@odata.nextLink"], PREFER_TEXT);
    } catch (e) {
      if (!(e instanceof GraphError) || e.status !== 400) throw e;
      yield* this.client.pages<GraphMessage>(query(base), PREFER_TEXT);
    }
  }

  async syncChanges(settings: Settings, sinceIso: string): Promise<RawMessage[]> {
    const out = new Map<string, RawMessage>();
    const add = (items: GraphMessage[]) => {
      for (const item of items) {
        const raw = toRaw(item);
        if (isProWorkflowSender(raw.fromAddress, settings)) out.set(raw.id, raw);
      }
    };

    for (const address of settings.senderAddresses) {
      const from = `from/emailAddress/address eq ${quote(address.trim())}`;
      try {
        const path = query({
          $filter: `lastModifiedDateTime ge ${sinceIso} and ${from}`,
          $top: String(PAGE_SIZE),
          $select: SELECT,
        });
        for await (const page of this.client.pages<GraphMessage>(path, PREFER_TEXT)) add(page.value);
      } catch (e) {
        if (!(e instanceof GraphError) || e.status !== 400) throw e;
        // The service refused the change query. Fall back to new mail only and say so.
        this.syncDegraded = true;
        const path = query({
          $filter: `receivedDateTime ge ${sinceIso} and ${from}`,
          $orderby: "receivedDateTime desc",
          $top: String(PAGE_SIZE),
          $select: SELECT,
        });
        for await (const page of this.client.pages<GraphMessage>(path, PREFER_TEXT)) add(page.value);
      }
    }

    for (const domain of settings.senderDomains) {
      const path = query({ $search: `"from:${domain.trim().replace(/^@/, "")}"`, $top: String(PAGE_SIZE), $select: SELECT });
      let pages = 0;
      for await (const page of this.client.pages<GraphMessage>(path, PREFER_TEXT)) {
        add(page.value.filter((m) => m.receivedDateTime >= sinceIso));
        pages += 1;
        if (pages >= 2 || page.value.every((m) => m.receivedDateTime < sinceIso)) break;
      }
    }
    return Array.from(out.values());
  }

  setRead(ids: string[], isRead: boolean): Promise<BulkResult> {
    return this.bulk(ids, (id, n) => ({
      id: String(n),
      method: "PATCH",
      url: messagePath(id),
      body: { isRead },
      headers: PREFER_ID,
    }));
  }

  archive(ids: string[]): Promise<BulkResult> {
    return this.bulk(ids, (id, n) => ({
      id: String(n),
      method: "POST",
      url: `${messagePath(id)}/move`,
      body: { destinationId: "archive" },
      headers: PREFER_ID,
    }));
  }

  /** Runs one request per message and reports exactly which ones worked. */
  private async bulk(ids: string[], build: (id: string, n: number) => BatchRequest): Promise<BulkResult> {
    const unique = Array.from(new Set(ids));
    const responses = await this.client.batch(unique.map((id, n) => build(id, n)));
    const result: BulkResult = { succeeded: [], failed: [] };
    unique.forEach((id, n) => {
      const res = responses.get(String(n));
      if (res && res.status >= 200 && res.status < 300) {
        result.succeeded.push(id);
      } else {
        const gone = res?.status === 404;
        result.failed.push({
          id,
          gone,
          error: gone
            ? "This email no longer exists in the mailbox."
            : (res?.body?.error?.message ?? `Microsoft 365 returned ${res?.status ?? "no response"}.`),
        });
      }
    });
    return result;
  }

  async getOriginal(id: string): Promise<OriginalMessage> {
    const m = await this.client.request<GraphMessage>("GET", `${messagePath(id)}?$select=body,hasAttachments`, {
      headers: PREFER_ID,
    });
    let attachments: OriginalMessage["attachments"] = [];
    if (m.hasAttachments) {
      const list = await this.client.request<Page<{ name?: string; size?: number; isInline?: boolean }>>(
        "GET",
        `${messagePath(id)}/attachments?$select=name,size,isInline`,
        { headers: PREFER_ID }
      );
      attachments = list.value.filter((a) => !a.isInline).map((a) => ({ name: a.name ?? "Attachment", size: a.size ?? 0 }));
    }
    return { html: m.body?.content ?? "", attachments };
  }

  async openInOutlook(id: string, webLink?: string): Promise<void> {
    // Outlook's own API wants the regular (non-immutable) ID, so ask Graph for it.
    try {
      const m = await this.client.request<{ id: string; webLink?: string }>("GET", `${messagePath(id)}?$select=id,webLink`);
      if (this.host.openMessage(m.id)) return;
      webLink = m.webLink ?? webLink;
    } catch {
      /* fall through to the web link */
    }
    if (webLink) this.host.openLink(webLink);
    else throw new Error("This email could not be opened. It may have been deleted.");
  }
}

/** Wire the provider to real sign-in. Used when the add-in runs inside Outlook. */
export function createGraphProvider(): GraphProvider {
  const auth = new GraphAuth();
  const client = new GraphClient((forceRefresh) => auth.getToken({ interactive: false, forceRefresh }));
  return new GraphProvider(client, async (interactive) => {
    await auth.getToken({ interactive });
  });
}
