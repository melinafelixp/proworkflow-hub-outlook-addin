import type { BulkResult, ImportProgress, RawMessage, Settings } from "../core/types";
import { isProWorkflowSender } from "../core/settings";
import type { MailProvider, OriginalMessage, Profile, SpecialFolders } from "./mailProvider";
import { buildIncoming, buildMockMailbox, MOCK_SELF, type MockMessage } from "./mockData";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * An in-memory mailbox that behaves like the Graph provider: paged import, change sync,
 * bulk read/unread and archive. Used by the preview and by tests. It never touches Outlook.
 */
export class MockProvider implements MailProvider {
  readonly mode = "mock" as const;
  private mailbox: MockMessage[];
  private incoming = 0;
  /** IDs that should fail on the next bulk action. Lets tests exercise partial failures. */
  failNext = new Set<string>();

  constructor(
    private delayMs = 140,
    private now: () => Date = () => new Date()
  ) {
    this.mailbox = buildMockMailbox(this.now());
  }

  async connect(): Promise<Profile> {
    await wait(this.delayMs);
    return { ...MOCK_SELF };
  }

  async getSpecialFolders(): Promise<SpecialFolders> {
    return { archive: "archive", deleted: "deleteditems" };
  }

  private strip(m: MockMessage): RawMessage {
    const { html: _html, lastModified: _lm, attachmentNames: _a, ...raw } = m;
    return raw;
  }

  async importHistory(
    settings: Settings,
    sinceIso: string,
    onPage: (messages: RawMessage[], progress: ImportProgress) => void
  ): Promise<void> {
    const matching = this.mailbox.filter(
      (m) => m.receivedDateTime >= sinceIso && isProWorkflowSender(m.fromAddress, settings) && m.parentFolderId !== "deleteditems"
    );
    const pageSize = 25;
    for (let i = 0; i < matching.length; i += pageSize) {
      await wait(this.delayMs * 2);
      const page = matching.slice(i, i + pageSize);
      onPage(page.map((m) => this.strip(m)), { processed: Math.min(i + pageSize, matching.length), total: matching.length });
    }
    if (matching.length === 0) onPage([], { processed: 0, total: 0 });
  }

  async syncChanges(settings: Settings, sinceIso: string): Promise<RawMessage[]> {
    await wait(this.delayMs);
    return this.mailbox
      .filter((m) => m.lastModified >= sinceIso && isProWorkflowSender(m.fromAddress, settings))
      .map((m) => this.strip(m));
  }

  private async bulk(ids: string[], apply: (m: MockMessage) => void): Promise<BulkResult> {
    await wait(this.delayMs + Math.min(ids.length * 6, 500));
    const result: BulkResult = { succeeded: [], failed: [] };
    const stamp = this.now().toISOString();
    for (const id of Array.from(new Set(ids))) {
      const m = this.mailbox.find((x) => x.id === id);
      if (!m) {
        result.failed.push({ id, gone: true, error: "This email no longer exists in the mailbox." });
      } else if (this.failNext.has(id)) {
        result.failed.push({ id, error: "Microsoft 365 is busy. Try again in a moment." });
      } else {
        apply(m);
        m.lastModified = stamp;
        result.succeeded.push(id);
      }
    }
    this.failNext.clear();
    return result;
  }

  setRead(ids: string[], isRead: boolean): Promise<BulkResult> {
    return this.bulk(ids, (m) => {
      m.isRead = isRead;
    });
  }

  archive(ids: string[]): Promise<BulkResult> {
    return this.bulk(ids, (m) => {
      m.parentFolderId = "archive";
    });
  }

  async getOriginal(id: string): Promise<OriginalMessage> {
    await wait(this.delayMs);
    const m = this.mailbox.find((x) => x.id === id);
    if (!m) throw new Error("This email no longer exists in the mailbox.");
    return { html: m.html, attachments: m.attachmentNames.map((name) => ({ name, size: 184_320 })) };
  }

  async openInOutlook(): Promise<void> {
    throw new Error("Opening the original email works once the add-in is running inside Outlook.");
  }

  /** Preview only: drop a new notification into the mailbox, as if ProWorkflow just sent one. */
  simulateIncoming(): RawMessage {
    const m = buildIncoming(this.incoming, this.incoming + 1, this.now());
    this.incoming += 1;
    this.mailbox.unshift(m);
    return this.strip(m);
  }

  /** Test helper: simulate the user deleting an email in Outlook. */
  deleteInOutlook(id: string): void {
    const m = this.mailbox.find((x) => x.id === id);
    if (m) {
      m.parentFolderId = "deleteditems";
      m.lastModified = this.now().toISOString();
    }
  }
}
