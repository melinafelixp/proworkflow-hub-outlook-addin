import { EXAMPLE_PROJECT_LINE, EXAMPLE_SUBJECT, pwfBody } from "./fixtures";

/** A tiny in-memory stand-in for the Microsoft Graph mail endpoints used by GraphProvider. */
export interface FakeMail {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  receivedDateTime: string;
  lastModifiedDateTime: string;
  isRead: boolean;
  parentFolderId: string;
  body: string;
}

export function makeMail(n: number, overrides: Partial<FakeMail> = {}): FakeMail {
  const at = new Date(Date.UTC(2026, 9, 1, 12, 0, 0) + n * 3600_000).toISOString();
  return {
    id: `imm-${String(n).padStart(3, "0")}`,
    subject: EXAMPLE_SUBJECT,
    from: "reply@notify.proworkflow.com",
    fromName: "Dana Whitfield (PWF)",
    receivedDateTime: at,
    lastModifiedDateTime: at,
    isRead: false,
    parentFolderId: "inbox-id",
    body: pwfBody({ author: "Dana Whitfield", projectLine: EXAMPLE_PROJECT_LINE, comment: `Comment ${n}` }),
    ...overrides,
  };
}

export class FakeGraph {
  mail: FakeMail[] = [];
  calls: { method: string; url: string; headers: Record<string, string>; body?: any }[] = [];
  /** Queue of HTTP statuses to return before behaving normally. */
  failWith: { status: number; retryAfter?: string }[] = [];
  /** Sub-request statuses to inject into batches, by message ID. Each is used once. */
  subFailures = new Map<string, number[]>();
  rejectCount = false;
  rejectLastModifiedFilter = false;
  clock = () => new Date(Date.UTC(2026, 9, 9, 18, 0, 0)).toISOString();

  fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    this.calls.push({ method, url, headers, body });

    const injected = this.failWith.shift();
    if (injected) {
      return new Response(JSON.stringify({ error: { code: "x", message: "injected" } }), {
        status: injected.status,
        headers: injected.retryAfter ? { "Retry-After": injected.retryAfter } : {},
      });
    }

    const u = new URL(url);
    const path = u.pathname.replace("/v1.0", "");
    if (path === "/$batch" && method === "POST") {
      const responses = (body.requests as any[]).map((r) => this.sub(r));
      return json(200, { responses });
    }
    const r = this.route(method, path + u.search, body);
    return json(r.status, r.body);
  };

  private sub(r: any): any {
    const idMatch = /\/me\/messages\/([^/?]+)/.exec(r.url);
    const mailId = idMatch ? decodeURIComponent(idMatch[1]) : "";
    const queue = this.subFailures.get(mailId);
    if (queue && queue.length > 0) {
      const status = queue.shift() as number;
      return { id: r.id, status, headers: { "Retry-After": "0" }, body: { error: { code: "x", message: `injected ${status}` } } };
    }
    const out = this.route(r.method, r.url, r.body);
    return { id: r.id, status: out.status, body: out.body };
  }

  private route(method: string, pathAndQuery: string, body: any): { status: number; body: any } {
    const [path, search = ""] = pathAndQuery.split("?");
    const q = new URLSearchParams(search);

    if (method === "GET" && path === "/me") {
      return { status: 200, body: { displayName: "Morgan Reyes", mail: "morgan@example.com" } };
    }
    const folder = /^\/me\/mailFolders\/(\w+)$/.exec(path);
    if (method === "GET" && folder) return { status: 200, body: { id: `${folder[1]}-id` } };

    if (method === "GET" && path === "/me/messages") {
      const filter = q.get("$filter") ?? "";
      if (q.get("$count") === "true" && this.rejectCount) return bad("count not supported");
      if (filter.includes("lastModifiedDateTime") && this.rejectLastModifiedFilter) return bad("InefficientFilter");
      const from = /from\/emailAddress\/address eq '([^']+)'/.exec(filter)?.[1];
      const received = /receivedDateTime ge (\S+)/.exec(filter)?.[1];
      const modified = /lastModifiedDateTime ge (\S+)/.exec(filter)?.[1];
      let items = this.mail.filter(
        (m) =>
          (!from || m.from.toLowerCase() === from.toLowerCase()) &&
          (!received || m.receivedDateTime >= received) &&
          (!modified || m.lastModifiedDateTime >= modified)
      );
      items = items.sort((a, b) => b.receivedDateTime.localeCompare(a.receivedDateTime));
      const top = Number(q.get("$top") ?? "10");
      const skip = Number(q.get("$skiptoken") ?? "0");
      const page = items.slice(skip, skip + top);
      const out: any = { value: page.map((m) => this.shape(m)) };
      if (q.get("$count") === "true") out["@odata.count"] = items.length;
      if (skip + top < items.length) {
        const next = new URLSearchParams(q);
        next.set("$skiptoken", String(skip + top));
        out["@odata.nextLink"] = `https://graph.microsoft.com/v1.0/me/messages?${next.toString()}`;
      }
      return { status: 200, body: out };
    }

    const one = /^\/me\/messages\/([^/]+)(\/move|\/attachments)?$/.exec(path);
    if (one) {
      const m = this.mail.find((x) => x.id === decodeURIComponent(one[1]));
      if (!m) return { status: 404, body: { error: { code: "ErrorItemNotFound", message: "Not found" } } };
      if (method === "PATCH") {
        m.isRead = body.isRead;
        m.lastModifiedDateTime = this.clock();
        return { status: 200, body: this.shape(m) };
      }
      if (method === "POST" && one[2] === "/move") {
        m.parentFolderId = `${body.destinationId}-id`;
        m.lastModifiedDateTime = this.clock();
        return { status: 201, body: this.shape(m) };
      }
      if (method === "GET" && one[2] === "/attachments") return { status: 200, body: { value: [] } };
      if (method === "GET") return { status: 200, body: { ...this.shape(m), id: `regular-${m.id}`, webLink: "https://outlook.office.com/x" } };
    }
    return bad(`Unhandled ${method} ${pathAndQuery}`);
  }

  private shape(m: FakeMail) {
    return {
      id: m.id,
      internetMessageId: `<${m.id}@x>`,
      subject: m.subject,
      from: { emailAddress: { name: m.fromName, address: m.from } },
      receivedDateTime: m.receivedDateTime,
      lastModifiedDateTime: m.lastModifiedDateTime,
      isRead: m.isRead,
      parentFolderId: m.parentFolderId,
      hasAttachments: false,
      body: { contentType: "text", content: m.body },
    };
  }
}

function json(status: number, body: any): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function bad(message: string) {
  return { status: 400, body: { error: { code: "BadRequest", message } } };
}
