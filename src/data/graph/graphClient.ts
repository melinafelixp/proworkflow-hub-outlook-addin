import { AuthRequiredError } from "../mailProvider";

/**
 * Minimal Microsoft Graph client: token handling, paging, retries and JSON batching.
 *
 * Limits this client is written around (Microsoft Graph documentation, Outlook service):
 *   - 10,000 requests per 10 minutes per app per mailbox
 *   - 4 concurrent requests per mailbox
 *   - 20 requests per JSON batch; Graph feeds Outlook four of them at a time
 * Requests are therefore sent one at a time, and bulk work goes through $batch.
 *
 * Access tokens are never logged or stored by this class.
 */

export const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
export const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 4;

export type TokenProvider = (forceRefresh: boolean) => Promise<string>;
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class GraphError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "GraphError";
  }
}

export interface BatchRequest {
  id: string;
  method: "GET" | "PATCH" | "POST" | "DELETE";
  /** Path relative to the Graph root, starting with "/". */
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface BatchResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: any;
}

export interface Page<T> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryDelayMs(retryAfter: string | null | undefined, attempt: number): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (!isNaN(seconds) && seconds >= 0) return Math.min(seconds, 60) * 1000;
  return Math.min(1000 * 2 ** attempt, 15000);
}

function errorFromBody(status: number, body: any): GraphError {
  const code = body?.error?.code ?? `HTTP${status}`;
  const message = body?.error?.message ?? `Microsoft Graph returned ${status}.`;
  return new GraphError(status, code, message);
}

export class GraphClient {
  constructor(
    private getToken: TokenProvider,
    private fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private sleep: (ms: number) => Promise<void> = defaultSleep
  ) {}

  async request<T>(
    method: string,
    pathOrUrl: string,
    options: { body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : GRAPH_ROOT + pathOrUrl;
    let refreshed = false;
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const token = await this.getToken(refreshed);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(options.headers ?? {}),
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
      } catch (e) {
        // Network failure. Back off and try again.
        lastError = e;
        await this.sleep(retryDelayMs(null, attempt));
        continue;
      }

      if (response.status === 401) {
        if (refreshed) throw new AuthRequiredError("Your Microsoft 365 sign-in has expired.");
        refreshed = true; // one retry with a fresh token
        continue;
      }
      if (response.status === 429 || response.status === 503 || response.status === 504) {
        lastError = new GraphError(response.status, "Throttled", "Microsoft 365 is busy. Try again in a moment.");
        await this.sleep(retryDelayMs(response.headers.get("Retry-After"), attempt));
        continue;
      }
      if (response.status === 204) return undefined as T;

      let body: any = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) throw errorFromBody(response.status, body);
      return body as T;
    }
    if (lastError instanceof GraphError) throw lastError;
    throw new GraphError(0, "NetworkError", "Could not reach Microsoft 365. Check your connection.");
  }

  /** Follow @odata.nextLink until the collection is exhausted. */
  async *pages<T>(path: string, headers?: Record<string, string>): AsyncGenerator<Page<T>> {
    let next: string | undefined = path;
    while (next) {
      const page: Page<T> = await this.request<Page<T>>("GET", next, { headers });
      yield page;
      next = page["@odata.nextLink"];
    }
  }

  /**
   * Run requests through $batch, 20 at a time. Individually throttled requests (429) are retried.
   * Always returns one response per request; a transport failure becomes status 0 for that chunk.
   */
  async batch(requests: BatchRequest[]): Promise<Map<string, BatchResponse>> {
    const results = new Map<string, BatchResponse>();
    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      let pending = requests.slice(i, i + BATCH_SIZE);
      for (let attempt = 0; attempt < MAX_ATTEMPTS && pending.length > 0; attempt++) {
        let responses: BatchResponse[];
        try {
          const payload = {
            requests: pending.map((r) => ({
              id: r.id,
              method: r.method,
              url: r.url,
              ...(r.body !== undefined
                ? { body: r.body, headers: { "Content-Type": "application/json", ...(r.headers ?? {}) } }
                : r.headers
                  ? { headers: r.headers }
                  : {}),
            })),
          };
          const out = await this.request<{ responses: BatchResponse[] }>("POST", "/$batch", { body: payload });
          responses = out.responses ?? [];
        } catch (e) {
          if (e instanceof AuthRequiredError) throw e;
          const message = e instanceof Error ? e.message : "Request failed.";
          for (const r of pending) results.set(r.id, { id: r.id, status: 0, body: { error: { message } } });
          pending = [];
          break;
        }

        const throttled: BatchRequest[] = [];
        let wait = 0;
        const byId = new Map(responses.map((r) => [r.id, r]));
        for (const r of pending) {
          const res = byId.get(r.id);
          if (!res) {
            results.set(r.id, { id: r.id, status: 0, body: { error: { message: "No response for this message." } } });
          } else if (res.status === 429 && attempt < MAX_ATTEMPTS - 1) {
            throttled.push(r);
            wait = Math.max(wait, retryDelayMs(res.headers?.["Retry-After"] ?? res.headers?.["retry-after"], attempt));
          } else {
            results.set(r.id, res);
          }
        }
        pending = throttled;
        if (pending.length > 0) await this.sleep(wait);
      }
    }
    return results;
  }
}
