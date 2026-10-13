import { beforeEach, describe, expect, it } from "vitest";
import { buildCampaigns, overview } from "../src/core/grouping";
import { MockProvider } from "../src/data/mockProvider";
import { HubStore } from "../src/state/hubStore";

const KEY = "20014827::MS-161204";

async function ready() {
  const provider = new MockProvider(0);
  const store = new HubStore(provider, { persist: false });
  await store.init();
  await store.startImport(90);
  const view = () => buildCampaigns(store.getState().messages, store.getState().userState);
  const campaign = (key = KEY) => view().campaigns.find((c) => c.key === key)!;
  return { provider, store, view, campaign };
}

describe("HubStore end to end on the sample mailbox", () => {
  let ctx: Awaited<ReturnType<typeof ready>>;
  beforeEach(async () => {
    ctx = await ready();
  });

  it("starts at onboarding and ends the import with organised campaigns", async () => {
    const store = new HubStore(new MockProvider(0), { persist: false });
    await store.init();
    expect(store.getState().phase).toBe("onboarding");
    const seen: number[] = [];
    store.subscribe(() => {
      const p = store.getState().importProgress;
      if (p) seen.push(p.processed);
    });
    await store.startImport(90);
    expect(store.getState().phase).toBe("ready");
    expect(seen.length).toBeGreaterThan(2);
    const { campaigns, uncategorized } = buildCampaigns(store.getState().messages, store.getState().userState);
    expect(campaigns).toHaveLength(10);
    expect(uncategorized).toHaveLength(3);
    expect(overview(campaigns)).toMatchObject({ attention: 2, review: 1, new: 3, uptodate: 4 });
  });

  it("limits the import to the chosen history window", async () => {
    const store = new HubStore(new MockProvider(0), { persist: false });
    await store.init();
    await store.startImport(30);
    const { campaigns } = buildCampaigns(store.getState().messages, store.getState().userState);
    expect(campaigns.some((c) => c.projectId === "MS-160415")).toBe(false);
  });

  it("builds the 42-message campaign with three open action items", () => {
    const c = ctx.campaign();
    expect(c).toMatchObject({
      clientName: "Lakeview/Hartwell Audiology",
      name: "Omnichannel Marketing SEPT 2026",
      total: 42,
      unread: 12,
      openActions: 3,
      status: "attention",
    });
    expect(new Set(c.messages.map((m) => m.author)).size).toBeGreaterThan(2);
    expect(c.messages.every((m) => m.commentExtracted)).toBe(true);
  });

  it("Review & Clear marks every email read in the mailbox but keeps action items open", async () => {
    const c = ctx.campaign();
    await ctx.store.reviewCampaign(KEY, c.messages.map((m) => m.id));
    const after = ctx.campaign();
    expect(after.unread).toBe(0);
    expect(after.reviewedAt).toBeDefined();
    expect(after.openActions).toBe(3);
    expect(after.status).toBe("attention");
    // The mailbox itself changed, not just the pane.
    const fromMailbox = await ctx.provider.syncChanges(ctx.store.getState().settings, "2000-01-01T00:00:00.000Z");
    const ids = new Set(c.messages.map((m) => m.id));
    expect(fromMailbox.filter((m) => ids.has(m.id)).every((m) => m.isRead)).toBe(true);
    expect(ctx.store.getState().notice?.text).toMatch(/42 emails marked as read/);
  });

  it("resolving every action item brings the campaign up to date", async () => {
    const c = ctx.campaign();
    await ctx.store.reviewCampaign(KEY, c.messages.map((m) => m.id));
    for (const m of c.messages.filter((x) => x.classification.category === "action" && !x.fromSelf)) {
      ctx.store.resolveAction(KEY, m.id, true);
    }
    expect(ctx.campaign().status).toBe("uptodate");
  });

  it("mark as unread reverses a read change", async () => {
    const ids = ctx.campaign().messages.map((m) => m.id);
    await ctx.store.setRead(ids, true);
    expect(ctx.campaign().unread).toBe(0);
    await ctx.store.setRead(ids.slice(0, 5), false);
    expect(ctx.campaign().unread).toBe(5);
  });

  it("reports a partial failure, reverts those emails, and can retry them", async () => {
    const unread = ctx.campaign().messages.filter((m) => !m.isRead).map((m) => m.id);
    ctx.provider.failNext = new Set(unread.slice(0, 2));
    await ctx.store.setRead(unread, true);
    expect(ctx.campaign().unread).toBe(2);
    const notice = ctx.store.getState().notice!;
    expect(notice.kind).toBe("warning");
    expect(notice.text).toMatch(/10 of 12 emails marked as read/);
    expect(notice.retry?.ids.sort()).toEqual(unread.slice(0, 2).sort());
    await ctx.store.retry(notice.retry!);
    expect(ctx.campaign().unread).toBe(0);
  });

  it("archives selected emails and keeps them visible", async () => {
    const ids = ctx.campaign().messages.slice(0, 10).map((m) => m.id);
    await ctx.store.archive(ids);
    const c = ctx.campaign();
    expect(c.total).toBe(42);
    expect(c.messages.filter((m) => m.archived)).toHaveLength(10);
  });

  it("picks up new mail and shows it as activity without touching read state", async () => {
    const key = "20016641::MS-162087"; // Premier Audiology, previously up to date
    expect(ctx.campaign(key).status).toBe("uptodate");
    await ctx.store.simulateIncoming();
    const c = ctx.campaign(key);
    expect(c.total).toBe(9);
    expect(c.unread).toBe(1);
    expect(c.status).toBe("attention");
    await ctx.store.sync();
    expect(ctx.campaign(key).total).toBe(9); // no duplicate on the next sync
  });

  it("a new message reopens a reviewed campaign", async () => {
    const key = "20011276::MS-163402";
    const c = ctx.campaign(key);
    await ctx.store.reviewCampaign(key, c.messages.map((m) => m.id));
    expect(ctx.campaign(key).status).toBe("uptodate");
    await ctx.store.simulateIncoming();
    await ctx.store.simulateIncoming();
    expect(ctx.campaign(key).status).toBe("new");
    expect(ctx.campaign(key).unread).toBe(1);
  });

  it("removes emails deleted in Outlook and reflects emails read in Outlook", async () => {
    const c = ctx.campaign();
    const unreadId = c.messages.find((m) => !m.isRead)!.id;
    ctx.provider.deleteInOutlook(c.messages[0].id);
    await ctx.provider.setRead([unreadId], true);
    await ctx.store.sync();
    expect(ctx.campaign().total).toBe(41);
    expect(ctx.campaign().unread).toBe(11);
  });

  it("supports manual grouping, manual status and classification corrections", () => {
    const loose = ctx.view().uncategorized[0];
    ctx.store.assign(loose.id, KEY);
    expect(ctx.campaign().total).toBe(43);
    expect(ctx.view().uncategorized).toHaveLength(2);
    ctx.store.assign(loose.id, null);
    expect(ctx.campaign().total).toBe(42);

    ctx.store.setManualStatus(KEY, "uptodate");
    expect(ctx.campaign()).toMatchObject({ status: "uptodate", statusIsManual: true });
    ctx.store.setManualStatus(KEY, null);
    expect(ctx.campaign().status).toBe("attention");

    const action = ctx.campaign().messages.find((m) => m.classification.category === "action" && !m.isRead)!;
    ctx.store.setCategory(action.id, "acknowledgment");
    expect(ctx.campaign().openActions).toBe(2);
  });

  it("re-parses cached emails when the extraction rules change", () => {
    ctx.store.updateSettings({ clientCodePattern: ",\\s*(\\d{3})\\d*\\b" });
    const codes = new Set(ctx.view().campaigns.map((c) => c.clientCode));
    expect(codes.has("200")).toBe(true);
  });

  it("clearing local data returns to onboarding without touching the mailbox", async () => {
    await ctx.store.clearLocalData();
    expect(ctx.store.getState().phase).toBe("onboarding");
    expect(ctx.store.getState().messages).toHaveLength(0);
    await ctx.store.startImport(90);
    expect(ctx.campaign().total).toBe(42);
  });
});
