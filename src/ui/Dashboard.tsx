import { useMemo, useState } from "react";
import {
  Button,
  Caption1,
  Input,
  Link,
  makeStyles,
  mergeClasses,
  Select,
  Spinner,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowSync20Regular,
  ChevronDown16Regular,
  ChevronRight16Regular,
  Dismiss16Regular,
  MailInbox20Regular,
  Search20Regular,
  Settings20Regular,
} from "@fluentui/react-icons";
import { formatRelative } from "../core/dates";
import { campaignKey, groupByClient, overview, searchCampaigns, searchMessages, STATUS_LABELS, STATUS_ORDER } from "../core/grouping";
import { parseSubject } from "../core/parser";
import type { Campaign, CampaignStatus, Settings } from "../core/types";
import { plural, StatusDot, useGrouped, useHubState, useStore } from "./common";
import { BRAND } from "./theme";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
  header: {
    padding: "14px 16px 10px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  titleRow: { display: "flex", alignItems: "flex-start", gap: "4px" },
  titleBlock: { flexGrow: 1, minWidth: 0 },
  title: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightBold, lineHeight: "24px", display: "block", color: BRAND.primary },
  subtitle: { color: tokens.colorNeutralForeground3, display: "block" },
  search: { width: "100%" },
  scroll: { flexGrow: 1, minHeight: 0, overflowY: "auto", padding: "12px 12px 20px" },
  overview: {
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
    marginBottom: "12px",
  },
  overviewTitle: {
    padding: "8px 12px 4px",
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightBold,
    color: BRAND.primary,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    display: "block",
  },
  overviewRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    padding: "7px 12px",
    border: "none",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground1,
    fontFamily: "inherit",
    fontSize: tokens.fontSizeBase300,
    textAlign: "left",
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: "-2px" },
  },
  overviewRowActive: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    fontWeight: tokens.fontWeightBold,
    boxShadow: `inset 3px 0 0 ${BRAND.secondary}`,
  },
  overviewLabel: { flexGrow: 1 },
  overviewCount: { fontVariantNumeric: "lining-nums tabular-nums", fontWeight: tokens.fontWeightBold, color: BRAND.primary },
  controls: { display: "flex", gap: "8px", marginBottom: "10px" },
  control: { flexGrow: 1, flexBasis: 0, minWidth: 0 },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    margin: "14px 4px 6px",
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightBold,
    color: BRAND.primary,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  clientHeader: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    margin: "10px 0 4px",
    padding: "6px 4px",
    border: "none",
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground1,
    fontFamily: "inherit",
    fontSize: tokens.fontSizeBase300,
    textAlign: "left",
    cursor: "pointer",
    borderRadius: tokens.borderRadiusMedium,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}` },
  },
  clientName: { fontWeight: tokens.fontWeightBold, flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  clientCode: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, flexShrink: 0 },
  card: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    width: "100%",
    padding: "10px 12px",
    marginBottom: "6px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontFamily: "inherit",
    textAlign: "left",
    cursor: "pointer",
    boxSizing: "border-box",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover, border: `1px solid ${BRAND.secondary}` },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}` },
  },
  cardCompact: { padding: "7px 10px", marginBottom: "4px" },
  cardDot: { marginTop: "5px" },
  cardBody: { flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" },
  cardTop: { display: "flex", alignItems: "baseline", gap: "6px" },
  cardClient: { fontWeight: tokens.fontWeightBold, fontSize: tokens.fontSizeBase300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  cardTime: { marginLeft: "auto", flexShrink: 0, color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  cardCampaign: { fontSize: tokens.fontSizeBase300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cardMeta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  metaAttention: { color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightBold },
  metaNew: { color: BRAND.secondaryText, fontWeight: tokens.fontWeightBold },
  nowrap: { whiteSpace: "nowrap" },
  hint: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 10px",
    marginBottom: "12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorBrandBackground2,
    fontSize: tokens.fontSizeBase200,
  },
  hintText: { flexGrow: 1, minWidth: 0 },
  empty: { padding: "28px 12px", textAlign: "center", color: tokens.colorNeutralForeground3 },
  uncategorized: { marginTop: "16px" },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  footerText: { flexGrow: 1, minWidth: 0 },
  footerError: { color: tokens.colorPaletteRedForeground1 },
});

type Filter = "all" | CampaignStatus;

function metaLine(c: Campaign, settings: Settings, s: ReturnType<typeof useStyles>) {
  const parts: React.ReactNode[] = [plural(c.total, "message")];
  if (c.openActions > 0) {
    parts.push(
      <span key="a" className={settings.highlightActions ? s.metaAttention : undefined}>
        {plural(c.openActions, "action item")}
      </span>
    );
  }
  if (c.unread > 0) {
    parts.push(
      <span key="u" className={settings.highlightNew ? s.metaNew : undefined}>
        {c.unread} unread
      </span>
    );
  }
  if (c.openActions === 0 && c.unread === 0) parts.push(c.uncertain > 0 ? "Needs a look" : "No pending items");
  // Each part stays on one line, so "3 action items" never breaks in the middle.
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 ? " · " : ""}
      <span className={s.nowrap}>{p}</span>
    </span>
  ));
}

function CampaignCard({
  campaign,
  settings,
  showClient,
  onOpen,
}: {
  campaign: Campaign;
  settings: Settings;
  showClient: boolean;
  onOpen: (key: string) => void;
}) {
  const s = useStyles();
  const compact = settings.density === "compact";
  return (
    <button
      type="button"
      className={mergeClasses(s.card, compact && s.cardCompact)}
      onClick={() => onOpen(campaign.key)}
      aria-label={`${campaign.clientName}, ${campaign.name}, ${STATUS_LABELS[campaign.status]}`}
    >
      <span className={s.cardDot}>
        <StatusDot status={campaign.status} />
      </span>
      <span className={s.cardBody}>
        <span className={s.cardTop}>
          <span className={s.cardClient}>{showClient ? campaign.clientName : campaign.name}</span>
          <span className={s.cardTime}>{formatRelative(campaign.lastActivity)}</span>
        </span>
        {showClient && <span className={s.cardCampaign}>{campaign.name}</span>}
        {!compact && (
          <span className={s.cardMeta}>{showClient ? `${campaign.clientCode} · ${campaign.projectId}` : campaign.projectId}</span>
        )}
        <span className={s.cardMeta}>{metaLine(campaign, settings, s)}</span>
      </span>
    </button>
  );
}

export function Dashboard({
  onOpenCampaign,
  onOpenUncategorized,
  onOpenSettings,
}: {
  onOpenCampaign: (key: string) => void;
  onOpenUncategorized: () => void;
  onOpenSettings: () => void;
}) {
  const s = useStyles();
  const store = useStore();
  const state = useHubState();
  const { campaigns, uncategorized } = useGrouped(state);
  const { settings } = state;

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(settings.defaultFilter);
  const [groupBy, setGroupBy] = useState(settings.groupBy);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hintDismissed, setHintDismissed] = useState<string | undefined>();

  const counts = useMemo(() => overview(campaigns), [campaigns]);
  const searched = useMemo(() => searchCampaigns(campaigns, query), [campaigns, query]);
  const visible = useMemo(() => (filter === "all" ? searched : searched.filter((c) => c.status === filter)), [searched, filter]);
  const looseMatches = useMemo(() => searchMessages(uncategorized, query), [uncategorized, query]);

  // "The email you have open in Outlook belongs to this campaign."
  const selected = useMemo(() => {
    if (!state.selectedSubject) return undefined;
    const p = parseSubject(state.selectedSubject, settings);
    if (p.clientCodes.length !== 1 || p.projectIds.length !== 1) return undefined;
    return campaigns.find((c) => c.key === campaignKey(p.clientCodes[0], p.projectIds[0]));
  }, [state.selectedSubject, settings, campaigns]);

  const syncing = state.sync.status === "syncing";
  const lastSync = state.sync.lastSyncAt ? `Updated ${formatRelative(state.sync.lastSyncAt)}` : "Not synced yet";

  return (
    <div className={s.root}>
      <header className={s.header}>
        <div className={s.titleRow}>
          <div className={s.titleBlock}>
            <Text as="h1" className={s.title}>
              ProWorkflow Hub
            </Text>
            <Caption1 className={s.subtitle}>Your campaign conversations, organized.</Caption1>
          </div>
          <Tooltip content="Check for new emails" relationship="label">
            <Button
              appearance="subtle"
              icon={syncing ? <Spinner size="tiny" /> : <ArrowSync20Regular />}
              onClick={() => void store.sync()}
              disabled={syncing}
            />
          </Tooltip>
          <Tooltip content="Settings" relationship="label">
            <Button appearance="subtle" icon={<Settings20Regular />} onClick={onOpenSettings} />
          </Tooltip>
        </div>
        <Input
          className={s.search}
          contentBefore={<Search20Regular />}
          contentAfter={
            query ? (
              <Button appearance="transparent" size="small" icon={<Dismiss16Regular />} aria-label="Clear search" onClick={() => setQuery("")} />
            ) : undefined
          }
          placeholder="Search clients, campaigns, or codes..."
          aria-label="Search clients, campaigns, or codes"
          value={query}
          onChange={(_, d) => setQuery(d.value)}
        />
      </header>

      <div className={s.scroll}>
        {selected && hintDismissed !== selected.key && (
          <div className={s.hint} role="status">
            <span className={s.hintText}>
              The email you have open belongs to <b>{selected.clientName}</b>, {selected.name}.{" "}
              <Link onClick={() => onOpenCampaign(selected.key)}>Open conversation</Link>
            </span>
            <Button appearance="transparent" size="small" icon={<Dismiss16Regular />} aria-label="Dismiss" onClick={() => setHintDismissed(selected.key)} />
          </div>
        )}

        {!query && (
          <section className={s.overview} aria-label="Campaign overview">
            <span className={s.overviewTitle}>Campaign overview</span>
            {STATUS_ORDER.filter((st) => st !== "review" || counts.review > 0).map((st) => (
              <button
                key={st}
                type="button"
                className={mergeClasses(s.overviewRow, filter === st && s.overviewRowActive)}
                aria-pressed={filter === st}
                onClick={() => setFilter(filter === st ? "all" : st)}
              >
                <StatusDot status={st} />
                <span className={s.overviewLabel}>{STATUS_LABELS[st]}</span>
                <span className={s.overviewCount}>{counts[st]}</span>
              </button>
            ))}
          </section>
        )}

        <div className={s.controls}>
          <Select className={s.control} size="small" aria-label="Filter campaigns" value={filter} onChange={(_, d) => setFilter(d.value as Filter)}>
            <option value="all">All campaigns ({counts.total})</option>
            <option value="attention">Needs attention</option>
            <option value="new">New activity</option>
            <option value="uptodate">Up to date</option>
            <option value="review">Needs review</option>
          </Select>
          <Select className={s.control} size="small" aria-label="Group campaigns" value={groupBy} onChange={(_, d) => setGroupBy(d.value as Settings["groupBy"])}>
            <option value="status">Group by status</option>
            <option value="client">Group by client</option>
          </Select>
        </div>

        {visible.length === 0 && (
          <div className={s.empty}>
            {campaigns.length === 0
              ? "No ProWorkflow notifications were found in this time range."
              : query
                ? `Nothing matches "${query}".`
                : `No campaigns are ${STATUS_LABELS[filter as CampaignStatus]?.toLowerCase() ?? "in this view"} right now.`}
          </div>
        )}

        {groupBy === "status" &&
          STATUS_ORDER.map((st) => {
            const list = visible.filter((c) => c.status === st);
            if (list.length === 0) return null;
            return (
              <section key={st} aria-label={STATUS_LABELS[st]}>
                <div className={s.sectionTitle}>
                  <StatusDot status={st} />
                  {STATUS_LABELS[st]} · {list.length}
                </div>
                {list.map((c) => (
                  <CampaignCard key={c.key} campaign={c} settings={settings} showClient onOpen={onOpenCampaign} />
                ))}
              </section>
            );
          })}

        {groupBy === "client" &&
          groupByClient(visible).map((g) => {
            const isCollapsed = collapsed[g.clientCode] ?? false;
            return (
              <section key={g.clientCode} aria-label={g.clientName}>
                <button
                  type="button"
                  className={s.clientHeader}
                  aria-expanded={!isCollapsed}
                  onClick={() => setCollapsed({ ...collapsed, [g.clientCode]: !isCollapsed })}
                >
                  {isCollapsed ? <ChevronRight16Regular /> : <ChevronDown16Regular />}
                  <StatusDot status={g.campaigns[0].status} />
                  <span className={s.clientName}>{g.clientName}</span>
                  <span className={s.clientCode}>
                    {g.clientCode} · {g.campaigns.length}
                  </span>
                </button>
                {!isCollapsed &&
                  g.campaigns.map((c) => <CampaignCard key={c.key} campaign={c} settings={settings} showClient={false} onOpen={onOpenCampaign} />)}
              </section>
            );
          })}

        {(query ? looseMatches.length > 0 : uncategorized.length > 0) && (
          <section className={s.uncategorized} aria-label="Uncategorized">
            <div className={s.sectionTitle}>Uncategorized · needs review</div>
            <button type="button" className={s.card} onClick={onOpenUncategorized}>
              <span className={s.cardDot}>
                <MailInbox20Regular />
              </span>
              <span className={s.cardBody}>
                <span className={s.cardClient}>{plural(query ? looseMatches.length : uncategorized.length, "email")} could not be grouped</span>
                <span className={s.cardMeta}>Review them and file each one under a campaign.</span>
              </span>
            </button>
          </section>
        )}
      </div>

      <footer className={s.footer}>
        {state.sync.status === "auth" ? (
          <>
            <span className={mergeClasses(s.footerText, s.footerError)}>Sign-in expired. Showing what was loaded {lastSync.toLowerCase()}.</span>
            <Button size="small" appearance="primary" onClick={() => void store.signIn()}>
              Reconnect
            </Button>
          </>
        ) : state.sync.status === "error" ? (
          <>
            <span className={mergeClasses(s.footerText, s.footerError)}>
              Sync failed. {state.sync.lastSyncAt ? `Last successful sync: ${formatRelative(state.sync.lastSyncAt)}.` : ""}
            </span>
            <Button size="small" onClick={() => void store.sync()}>
              Retry
            </Button>
          </>
        ) : (
          <span className={s.footerText}>
            {syncing ? "Checking for new emails…" : lastSync} · {plural(state.messages.length, "email")}
          </span>
        )}
      </footer>
    </div>
  );
}
