import type {
  Campaign,
  CampaignState,
  CampaignStatus,
  Category,
  ClientGroup,
  HubMessage,
  Overview,
  UserState,
} from "./types";

/**
 * Grouping rules.
 *
 *   Level 1  Client     = client code
 *   Level 2  Campaign   = client code + ProWorkflow project ID
 *
 * A message joins a campaign only when both identifiers were found without ambiguity, or when
 * the user assigned it by hand. Everything else goes to Uncategorized. Similar wording is never
 * used to group.
 */

export function campaignKey(clientCode: string, projectId: string): string {
  return `${clientCode}::${projectId}`;
}

export function splitKey(key: string): { clientCode: string; projectId: string } {
  const i = key.indexOf("::");
  return { clientCode: key.slice(0, i), projectId: key.slice(i + 2) };
}

export const EMPTY_STATE: UserState = { campaigns: {}, assignments: {}, categoryOverrides: {} };

/** Most urgent first. */
export const STATUS_ORDER: CampaignStatus[] = ["attention", "review", "new", "uptodate"];

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  attention: "Needs attention",
  new: "New activity",
  review: "Needs review",
  uptodate: "Up to date",
};

function mostCommon(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | undefined;
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  });
  return best;
}

function applyOverride(m: HubMessage, override: Category | undefined): HubMessage {
  if (!override || (m.classification.source === "user" && m.classification.category === override)) return m;
  return {
    ...m,
    classification: { category: override, confidence: "high", source: "user", reason: "Set by you." },
  };
}

export function isOpenAction(m: HubMessage, state: CampaignState | undefined): boolean {
  return m.classification.category === "action" && !m.fromSelf && !(state?.resolved ?? []).includes(m.id);
}

/**
 * Status rules, in priority order:
 *   1. A manual status holds until a newer message arrives.
 *   2. Any unresolved action-required comment                  -> Needs attention
 *   3. Any comment the rules could not classify that has not
 *      been looked at yet (unread, or newer than the review)   -> Needs review
 *   4. Any unread message                                      -> New activity
 *   5. Otherwise                                               -> Up to date
 *
 * Read state never clears an action item. Only "Resolve" (or a manual status) does.
 */
export function computeStatus(
  messages: HubMessage[],
  state: CampaignState | undefined
): { status: CampaignStatus; manual: boolean; openActions: number; unread: number; uncertain: number } {
  const openActions = messages.filter((m) => isOpenAction(m, state)).length;
  const unread = messages.filter((m) => !m.isRead).length;
  const uncertain = messages.filter(
    (m) =>
      m.classification.category === "review" &&
      m.classification.source !== "user" &&
      !m.fromSelf &&
      (!m.isRead || (state?.reviewedAt !== undefined && m.receivedAt > state.reviewedAt))
  ).length;

  if (state?.manualStatus && state.manualStatusAt) {
    const newer = messages.some((m) => m.receivedAt > (state.manualStatusAt as string));
    if (!newer) return { status: state.manualStatus, manual: true, openActions, unread, uncertain };
  }
  let status: CampaignStatus = "uptodate";
  if (openActions > 0) status = "attention";
  else if (uncertain > 0) status = "review";
  else if (unread > 0) status = "new";
  return { status, manual: false, openActions, unread, uncertain };
}

export interface Grouped {
  campaigns: Campaign[];
  uncategorized: HubMessage[];
}

export function buildCampaigns(messagesIn: HubMessage[], state: UserState): Grouped {
  const buckets = new Map<string, HubMessage[]>();
  const uncategorized: HubMessage[] = [];
  const seen = new Set<string>();

  for (const raw of messagesIn) {
    if (seen.has(raw.id)) continue; // never show the same Outlook message twice
    seen.add(raw.id);
    const m = applyOverride(raw, state.categoryOverrides[raw.id]);
    const assigned = state.assignments[m.id];
    let key: string | undefined;
    if (assigned) key = assigned;
    else if (m.parse.confident && m.parse.clientCode && m.parse.projectId) {
      key = campaignKey(m.parse.clientCode, m.parse.projectId);
    }
    if (!key) {
      uncategorized.push(m);
      continue;
    }
    const bucket = buckets.get(key);
    if (bucket) bucket.push(m);
    else buckets.set(key, [m]);
  }

  const campaigns: Campaign[] = [];
  buckets.forEach((messages, key) => {
    messages.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    const { clientCode, projectId } = splitKey(key);
    const own = messages.filter((m) => m.parse.confident);
    const fromProjectLine = mostCommon(
      own.filter((m) => m.parse.campaignNameSource === "project-line").map((m) => m.parse.campaignName)
    );
    const subjectNames = Array.from(
      new Set(own.filter((m) => m.parse.campaignNameSource === "subject").map((m) => m.parse.campaignName))
    ).filter(Boolean) as string[];
    // One task name across the whole project is a safe label. Several are not: fall back to the ID.
    const name = fromProjectLine ?? (subjectNames.length === 1 ? subjectNames[0] : `Project ${projectId}`);
    const clientName = mostCommon(own.map((m) => m.parse.clientName)) ?? `Client ${clientCode}`;
    const cs = state.campaigns[key];
    const s = computeStatus(messages, cs);
    campaigns.push({
      key,
      clientCode,
      clientName,
      projectId,
      name,
      messages,
      total: messages.length,
      unread: s.unread,
      openActions: s.openActions,
      uncertain: s.uncertain,
      lastActivity: messages[messages.length - 1].receivedAt,
      status: s.status,
      statusIsManual: s.manual,
      reviewedAt: cs?.reviewedAt,
    });
  });

  // One display name per client code, even if campaigns disagree on spelling.
  const nameByClient = new Map<string, string>();
  const byClient = new Map<string, Campaign[]>();
  for (const c of campaigns) {
    const list = byClient.get(c.clientCode);
    if (list) list.push(c);
    else byClient.set(c.clientCode, [c]);
  }
  byClient.forEach((list, code) => {
    const real = list.map((c) => c.clientName).filter((n) => !n.startsWith("Client "));
    nameByClient.set(code, mostCommon(real) ?? list[0].clientName);
  });
  for (const c of campaigns) c.clientName = nameByClient.get(c.clientCode) ?? c.clientName;

  campaigns.sort(compareCampaigns);
  uncategorized.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return { campaigns, uncategorized };
}

export function compareCampaigns(a: Campaign, b: Campaign): number {
  const rank = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  if (rank !== 0) return rank;
  return b.lastActivity.localeCompare(a.lastActivity);
}

export function groupByClient(campaigns: Campaign[]): ClientGroup[] {
  const map = new Map<string, ClientGroup>();
  for (const c of campaigns) {
    const g = map.get(c.clientCode);
    if (g) g.campaigns.push(c);
    else map.set(c.clientCode, { clientCode: c.clientCode, clientName: c.clientName, campaigns: [c] });
  }
  const groups = Array.from(map.values());
  groups.forEach((g) => g.campaigns.sort(compareCampaigns));
  // Clients whose most urgent campaign is most urgent come first.
  groups.sort((a, b) => compareCampaigns(a.campaigns[0], b.campaigns[0]));
  return groups;
}

export function overview(campaigns: Campaign[]): Overview {
  const o: Overview = { attention: 0, new: 0, review: 0, uptodate: 0, total: campaigns.length };
  for (const c of campaigns) o[c.status] += 1;
  return o;
}

/** Case-insensitive search across client, code, project, campaign, sender and comment text. */
export function searchCampaigns(campaigns: Campaign[], query: string): Campaign[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return campaigns;
  return campaigns.filter((c) => {
    const hay = haystack(c);
    return tokens.every((t) => hay.includes(t));
  });
}

export function searchMessages(messages: HubMessage[], query: string): HubMessage[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return messages;
  return messages.filter((m) => {
    const hay = `${m.subject}\n${m.author}\n${m.comment}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

const haystacks = new WeakMap<Campaign, string>();
function haystack(c: Campaign): string {
  let h = haystacks.get(c);
  if (h === undefined) {
    const parts = [c.clientName, c.clientCode, c.projectId, c.name];
    for (const m of c.messages) parts.push(m.author, m.parse.taskName ?? "", m.comment);
    h = parts.join("\n").toLowerCase();
    haystacks.set(c, h);
  }
  return h;
}
