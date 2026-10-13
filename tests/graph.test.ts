import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import type { RawMessage } from "../src/core/types";
import { GraphClient } from "../src/data/graph/graphClient";
import { GraphProvider } from "../src/data/graph/graphProvider";
import { AuthRequiredError } from "../src/data/mailProvider";
import { FakeGraph, makeMail } from "./fakeGraph";

const S = DEFAULT_SETTINGS;
const SINCE = "2026-09-01T00:00:00.000Z";

function setup() {
  const graph = new FakeGraph();
  const tokens: boolean[] = [];
  const client = new GraphClient(
    async (force) => {
      tokens.push(force);
      return force ? "fresh-token" : "token";
    },
    graph.fetch,
    async () => undefined
  );
  const opened: string[] = [];
  const provider = new GraphProvider(client, async () => undefined, {
    openMessage: (id) => {
      opened.push(id);
      return true;
    },
    openLink: (url) => void opened.push(url),
  });
  return { graph, client, provider, tokens, opened };
}

describe("GraphProvider against a fake Graph", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("imports history across pages, only from approved senders, with progress", async () => {
    for (let i = 0; i < 120; i++) ctx.graph.mail.push(makeMail(i));
    ctx.graph.mail.push(makeMail(500, { from: "newsletter@example.com" }));
    ctx.graph.mail.push(makeMail(-2000)); // older than the import window
    const got: RawMessage[] = [];
    const progress: number[] = [];
    let total: number | undefined;
    await ctx.provider.importHistory(S, SINCE, (page, p) => {
      got.push(...page);
      progress.push(p.processed);
      total = p.total;
    });
    expect(got).toHaveLength(120);
    expect(new Set(got.map((m) => m.id)).size).toBe(120);
    expect(progress).toEqual([50, 100, 120]);
    expect(total).toBe(120);
    expect(got[0].bodyText).toContain("has sent you a message");
    const first = ctx.graph.calls[0];
    expect(first.headers.Prefer).toContain('IdType="ImmutableId"');
    expect(first.headers.Prefer).toContain('outlook.body-content-type="text"');
    expect(decodeURIComponent(first.url)).toContain("from/emailAddress/address eq 'reply@notify.proworkflow.com'");
  });

  it("still imports when the service rejects $count", async () => {
    for (let i = 0; i < 60; i++) ctx.graph.mail.push(makeMail(i));
    ctx.graph.rejectCount = true;
    const got: RawMessage[] = [];
    let total: number | undefined = 1;
    await ctx.provider.importHistory(S, SINCE, (page, p) => {
      got.push(...page);
      total = p.total;
    });
    expect(got).toHaveLength(60);
    expect(total).toBeUndefined();
  });

  it("retries when throttled and honours Retry-After", async () => {
    ctx.graph.mail.push(makeMail(1));
    ctx.graph.failWith.push({ status: 429, retryAfter: "0" }, { status: 503 });
    const got: RawMessage[] = [];
    await ctx.provider.importHistory(S, SINCE, (page) => void got.push(...page));
    expect(got).toHaveLength(1);
    expect(ctx.graph.calls).toHaveLength(3);
  });

  it("refreshes the token once on 401, then asks the user to sign in", async () => {
    ctx.graph.failWith.push({ status: 401 });
    await ctx.provider.connect(false);
    expect(ctx.tokens).toEqual([false, true]);
    ctx.graph.failWith.push({ status: 401 }, { status: 401 });
    await expect(ctx.provider.connect(false)).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("never puts the access token anywhere but the Authorization header", async () => {
    ctx.graph.mail.push(makeMail(1));
    await ctx.provider.setRead(["imm-001"], true);
    for (const call of ctx.graph.calls) {
      expect(call.url).not.toContain("token");
      expect(JSON.stringify(call.body ?? {})).not.toContain("token");
    }
  });

  it("marks 45 emails as read in batches of 20", async () => {
    for (let i = 0; i < 45; i++) ctx.graph.mail.push(makeMail(i));
    const ids = ctx.graph.mail.map((m) => m.id);
    const result = await ctx.provider.setRead(ids, true);
    expect(result.succeeded).toHaveLength(45);
    expect(result.failed).toHaveLength(0);
    expect(ctx.graph.mail.every((m) => m.isRead)).toBe(true);
    const batches = ctx.graph.calls.filter((c) => c.url.endsWith("/$batch"));
    expect(batches.map((b) => b.body.requests.length)).toEqual([20, 20, 5]);
    expect(batches[0].body.requests[0]).toMatchObject({ method: "PATCH", body: { isRead: true } });
  });

  it("can mark emails unread again", async () => {
    ctx.graph.mail.push(makeMail(1, { isRead: true }));
    await ctx.provider.setRead(["imm-001"], false);
    expect(ctx.graph.mail[0].isRead).toBe(false);
  });

  it("reports exactly which emails failed in a partial failure", async () => {
    for (let i = 0; i < 5; i++) ctx.graph.mail.push(makeMail(i));
    ctx.graph.subFailures.set("imm-002", [500]);
    const result = await ctx.provider.setRead([...ctx.graph.mail.map((m) => m.id), "imm-missing"], true);
    expect(result.succeeded.sort()).toEqual(["imm-000", "imm-001", "imm-003", "imm-004"]);
    expect(result.failed.map((f) => f.id).sort()).toEqual(["imm-002", "imm-missing"]);
    expect(result.failed.find((f) => f.id === "imm-missing")?.gone).toBe(true);
    expect(ctx.graph.mail.find((m) => m.id === "imm-002")?.isRead).toBe(false);
  });

  it("retries individually throttled emails inside a batch", async () => {
    for (let i = 0; i < 3; i++) ctx.graph.mail.push(makeMail(i));
    ctx.graph.subFailures.set("imm-001", [429, 429]);
    const result = await ctx.provider.setRead(["imm-000", "imm-001", "imm-002"], true);
    expect(result.succeeded).toHaveLength(3);
    const batches = ctx.graph.calls.filter((c) => c.url.endsWith("/$batch"));
    expect(batches.map((b) => b.body.requests.length)).toEqual([3, 1, 1]);
  });

  it("archives by moving to the well-known archive folder", async () => {
    for (let i = 0; i < 3; i++) ctx.graph.mail.push(makeMail(i));
    const result = await ctx.provider.archive(["imm-000", "imm-002"]);
    expect(result.succeeded).toEqual(["imm-000", "imm-002"]);
    expect(ctx.graph.mail.map((m) => m.parentFolderId)).toEqual(["archive-id", "inbox-id", "archive-id"]);
    const req = ctx.graph.calls.find((c) => c.url.endsWith("/$batch"))!.body.requests[0];
    expect(req).toMatchObject({ method: "POST", body: { destinationId: "archive" } });
    expect(req.url).toMatch(/\/move$/);
  });

  it("syncs only what changed since the last sync", async () => {
    for (let i = 0; i < 10; i++) ctx.graph.mail.push(makeMail(i));
    const since = "2026-10-09T17:00:00.000Z";
    expect(await ctx.provider.syncChanges(S, since)).toHaveLength(0);
    await ctx.provider.setRead(["imm-003"], true); // read in Outlook
    await ctx.provider.archive(["imm-004"]); // filed in Outlook
    ctx.graph.mail.push(makeMail(900, { receivedDateTime: "2026-10-09T17:30:00.000Z", lastModifiedDateTime: "2026-10-09T17:30:00.000Z" }));
    const changes = await ctx.provider.syncChanges(S, since);
    expect(changes.map((m) => m.id).sort()).toEqual(["imm-003", "imm-004", "imm-900"]);
    expect(changes.find((m) => m.id === "imm-003")?.isRead).toBe(true);
    expect(changes.find((m) => m.id === "imm-004")?.parentFolderId).toBe("archive-id");
    expect(ctx.provider.syncDegraded).toBe(false);
  });

  it("falls back to new mail only, and says so, if the change query is refused", async () => {
    ctx.graph.rejectLastModifiedFilter = true;
    ctx.graph.mail.push(makeMail(900, { receivedDateTime: "2026-10-09T17:30:00.000Z" }));
    const changes = await ctx.provider.syncChanges(S, "2026-10-09T17:00:00.000Z");
    expect(changes.map((m) => m.id)).toEqual(["imm-900"]);
    expect(ctx.provider.syncDegraded).toBe(true);
  });

  it("reads the special folder IDs and opens the original through Outlook", async () => {
    ctx.graph.mail.push(makeMail(1));
    expect(await ctx.provider.getSpecialFolders()).toEqual({ archive: "archive-id", deleted: "deleteditems-id" });
    await ctx.provider.openInOutlook("imm-001");
    expect(ctx.opened).toEqual(["regular-imm-001"]);
    const original = await ctx.provider.getOriginal("imm-001");
    expect(original.html).toContain("has sent you a message");
  });
});
