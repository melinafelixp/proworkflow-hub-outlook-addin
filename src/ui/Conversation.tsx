import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  makeStyles,
  Menu,
  MenuDivider,
  MenuItem,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  mergeClasses,
  Spinner,
  Switch,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  Archive16Regular,
  ArrowLeft16Regular,
  Attach16Regular,
  Checkmark16Regular,
  ChevronDown16Regular,
  MailRead16Regular,
  MailUnread16Regular,
  MoreHorizontal16Regular,
} from "@fluentui/react-icons";
import { CATEGORY_LABELS } from "../core/classifier";
import { formatFull, formatRelative } from "../core/dates";
import { isOpenAction, STATUS_LABELS, STATUS_ORDER } from "../core/grouping";
import type { Campaign, CampaignStatus, Category, HubMessage, Settings } from "../core/types";
import type { OriginalMessage } from "../data/mailProvider";
import { CategoryBadge, plural, StatusDot, useHubState, useStore } from "./common";
import { BRAND } from "./theme";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
  header: {
    padding: "8px 12px 10px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  backRow: { display: "flex", alignItems: "center", marginLeft: "-8px" },
  spacer: { flexGrow: 1 },
  client: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightBold, lineHeight: "22px", display: "block", color: BRAND.primary },
  campaign: { fontSize: tokens.fontSizeBase300, display: "block" },
  ids: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, display: "block", marginTop: "2px" },
  reviewButton: { width: "100%" },
  toolbar: { display: "flex", alignItems: "center", flexWrap: "wrap", marginLeft: "-6px", marginRight: "-4px" },
  toolButton: { minWidth: 0, paddingLeft: "6px", paddingRight: "6px" },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: "12px 2px 8px",
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightBold,
    "::after": { content: '""', flexGrow: 1, height: "1px", backgroundColor: tokens.colorBrandStroke2 },
  },
  reviewed: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  options: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "2px 12px 0 6px" },
  scroll: { flexGrow: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px 20px" },
  message: {
    display: "flex",
    gap: "4px",
    padding: "10px 10px 10px 4px",
    marginBottom: "6px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `3px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  compact: { padding: "6px 8px 6px 2px", marginBottom: "4px" },
  accentAction: { borderLeft: `3px solid ${tokens.colorPaletteRedBorderActive}` },
  accentNew: { borderLeft: `3px solid ${BRAND.secondary}` },
  accentApproval: { borderLeft: `3px solid ${tokens.colorPaletteGreenBorderActive}` },
  body: { flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" },
  top: { display: "flex", alignItems: "baseline", gap: "6px" },
  author: { fontSize: tokens.fontSizeBase300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  authorUnread: { fontWeight: tokens.fontWeightBold },
  unreadDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: BRAND.secondary,
    flexShrink: 0,
    alignSelf: "center",
  },
  time: { marginLeft: "auto", flexShrink: 0, color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  task: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" },
  comment: { fontSize: tokens.fontSizeBase300, lineHeight: "20px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  commentCompact: {
    display: "-webkit-box",
    WebkitLineClamp: "2",
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    whiteSpace: "normal",
  },
  fallback: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, fontStyle: "italic" },
  actions: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px", marginLeft: "-4px" },
  badgeButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    padding: "2px 4px",
    border: "none",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground3,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}` },
  },
  resolved: { color: tokens.colorPaletteGreenForeground1, fontSize: tokens.fontSizeBase200, display: "inline-flex", alignItems: "center", gap: "2px" },
  original: {
    marginTop: "6px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  originalFrame: { width: "100%", height: "320px", border: "none", display: "block" },
  originalNote: { padding: "6px 8px", fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, backgroundColor: tokens.colorNeutralBackground2 },
  empty: { padding: "28px 12px", textAlign: "center", color: tokens.colorNeutralForeground3 },
});

/** The original email, rendered in a locked-down frame: no scripts, no remote images, no navigation. */
function OriginalView({ message }: { message: HubMessage }) {
  const s = useStyles();
  const store = useStore();
  const [data, setData] = useState<OriginalMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    store
      .getOriginal(message.id)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : "The original email could not be loaded."));
    return () => {
      live = false;
    };
  }, [store, message.id]);

  if (error) return <div className={s.originalNote}>{error}</div>;
  if (!data) return <Spinner size="tiny" label="Loading the original email…" />;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><base target="_blank"><style>body{font-family:Segoe UI,Arial,sans-serif;font-size:13px;margin:10px;color:#242424;overflow-wrap:anywhere}img{max-width:100%}table{max-width:100%}</style></head><body>${data.html}</body></html>`;
  return (
    <div className={s.original}>
      <iframe className={s.originalFrame} title="Original email" sandbox="" srcDoc={doc} />
      <div className={s.originalNote}>
        {data.attachments.length > 0 && (
          <div>
            Attachments: {data.attachments.map((a) => a.name).join(", ")}. Open the email in Outlook to download them.
          </div>
        )}
        Remote images are blocked here. Links and attachments work in the original email in Outlook.
      </div>
    </div>
  );
}

function MessageCard({
  message,
  campaign,
  settings,
  selected,
  onSelect,
}: {
  message: HubMessage;
  campaign: Campaign;
  settings: Settings;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
}) {
  const s = useStyles();
  const store = useStore();
  const state = useHubState();
  const [showOriginal, setShowOriginal] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const compact = settings.density === "compact" && !expanded && !showOriginal;

  const cs = state.userState.campaigns[campaign.key];
  const category = message.classification.category;
  const isAction = category === "action" && !message.fromSelf;
  const open = isOpenAction(message, cs);
  const overridden = message.classification.source === "user";

  const accent =
    open && settings.highlightActions
      ? s.accentAction
      : category === "approval" && settings.highlightApprovals
        ? s.accentApproval
        : !message.isRead && settings.highlightNew
          ? s.accentNew
          : undefined;

  return (
    <article className={mergeClasses(s.message, compact && s.compact, accent)} aria-label={`${message.author}, ${formatFull(message.receivedAt)}`}>
      <Checkbox
        checked={selected}
        onChange={(_, d) => onSelect(message.id, d.checked === true)}
        aria-label={`Select message from ${message.author}`}
      />
      <div className={s.body}>
        <div className={s.top}>
          {!message.isRead && <span className={s.unreadDot} role="img" aria-label="Unread" />}
          <span className={mergeClasses(s.author, !message.isRead && s.authorUnread)}>
            {message.author}
            {message.fromSelf ? " (you)" : ""}
          </span>
          <span className={s.time}>{formatFull(message.receivedAt)}</span>
        </div>
        {(message.parse.taskName || message.hasAttachments || message.archived) && !compact && (
          <div className={s.task}>
            {message.parse.taskName && <span>{message.parse.taskName}</span>}
            {message.hasAttachments && (
              <span>
                <Attach16Regular aria-hidden="true" /> Attachment
              </span>
            )}
            {message.archived && <span>· Archived</span>}
          </div>
        )}
        <div
          className={mergeClasses(s.comment, compact && s.commentCompact)}
          onClick={compact ? () => setExpanded(true) : undefined}
        >
          {message.comment || <span className={s.fallback}>No comment text was found. Open the original email.</span>}
        </div>
        {!message.commentExtracted && message.comment && (
          <div className={s.fallback}>Unfamiliar notification layout, so the whole text is shown.</div>
        )}
        <div className={s.actions}>
          <Menu
            checkedValues={{ category: [category] }}
            onCheckedValueChange={(_, d) => store.setCategory(message.id, (d.checkedItems[0] as Category) ?? null)}
          >
            <MenuTrigger disableButtonEnhancement>
              <Tooltip content={message.classification.reason ?? "Change classification"} relationship="description">
                <button type="button" className={s.badgeButton} aria-label={`Classification: ${CATEGORY_LABELS[category]}. Change`}>
                  <CategoryBadge classification={message.classification} />
                  <ChevronDown16Regular />
                </button>
              </Tooltip>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                  <MenuItemRadio key={c} name="category" value={c}>
                    {CATEGORY_LABELS[c]}
                  </MenuItemRadio>
                ))}
                {overridden && (
                  <>
                    <MenuDivider />
                    <MenuItem onClick={() => store.setCategory(message.id, null)}>Reset to automatic</MenuItem>
                  </>
                )}
              </MenuList>
            </MenuPopover>
          </Menu>
          {isAction &&
            (open ? (
              <Button size="small" appearance="outline" icon={<Checkmark16Regular />} onClick={() => store.resolveAction(campaign.key, message.id, true)}>
                Resolve
              </Button>
            ) : (
              <span className={s.resolved}>
                <Checkmark16Regular aria-hidden="true" /> Resolved
                <Button size="small" appearance="transparent" onClick={() => store.resolveAction(campaign.key, message.id, false)}>
                  Undo
                </Button>
              </span>
            ))}
          <span className={s.spacer} />
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button size="small" appearance="subtle" icon={<MoreHorizontal16Regular />} aria-label="More actions" />
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem onClick={() => setShowOriginal(!showOriginal)}>{showOriginal ? "Hide original" : "Show original"}</MenuItem>
                <MenuItem onClick={() => void store.openInOutlook(message)}>Open in Outlook</MenuItem>
                <MenuDivider />
                <MenuItem onClick={() => void store.setRead([message.id], !message.isRead)}>
                  {message.isRead ? "Mark as unread" : "Mark as read"}
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
        {showOriginal && <OriginalView message={message} />}
      </div>
    </article>
  );
}

export function Conversation({ campaign, onBack }: { campaign: Campaign; onBack: () => void }) {
  const s = useStyles();
  const store = useStore();
  const state = useHubState();
  const { settings } = state;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hideAcks, setHideAcks] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const ackCount = useMemo(() => campaign.messages.filter((m) => m.classification.category === "acknowledgment").length, [campaign.messages]);
  const shown = useMemo(() => {
    const list = hideAcks ? campaign.messages.filter((m) => m.classification.category !== "acknowledgment") : campaign.messages;
    return settings.messageOrder === "newest" ? [...list].reverse() : list;
  }, [campaign.messages, hideAcks, settings.messageOrder]);

  // Drop selections for emails that are no longer in view (deleted, or hidden by the filter).
  const shownIds = useMemo(() => new Set(shown.map((m) => m.id)), [shown]);
  const selectedIds = useMemo(() => Array.from(selected).filter((id) => shownIds.has(id)), [selected, shownIds]);

  const allSelected = shown.length > 0 && selectedIds.length === shown.length;
  const busy = Boolean(state.busy);
  const none = selectedIds.length === 0;
  const toArchive = campaign.messages.filter((m) => selectedIds.includes(m.id) && !m.archived).length;

  // In oldest-first order the unread emails sit at the bottom of a long thread. Start there.
  const firstUnreadId = useMemo(
    () => (settings.messageOrder === "oldest" ? shown.find((m) => !m.isRead)?.id : undefined),
    // Decided once per campaign: the marker should not jump around while emails are being marked read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaign.key]
  );
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    firstUnreadRef.current?.scrollIntoView({ block: "start" });
  }, [campaign.key]);

  const onSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  return (
    <div className={s.root}>
      <header className={s.header}>
        <div className={s.backRow}>
          <Button appearance="subtle" size="small" icon={<ArrowLeft16Regular />} onClick={onBack}>
            Back to campaigns
          </Button>
          <span className={s.spacer} />
          <Menu
            checkedValues={{ status: [campaign.statusIsManual ? campaign.status : "auto"] }}
            onCheckedValueChange={(_, d) => {
              const v = d.checkedItems[0];
              store.setManualStatus(campaign.key, v === "auto" ? null : (v as CampaignStatus));
            }}
          >
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="subtle" size="small" icon={<StatusDot status={campaign.status} />} iconPosition="before">
                {STATUS_LABELS[campaign.status]}
                {campaign.statusIsManual ? " (set by you)" : ""}
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItemRadio name="status" value="auto">
                  Automatic
                </MenuItemRadio>
                <MenuDivider />
                {STATUS_ORDER.map((st) => (
                  <MenuItemRadio key={st} name="status" value={st}>
                    {STATUS_LABELS[st]}
                  </MenuItemRadio>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
        <div>
          <Text as="h2" className={s.client}>
            {campaign.clientName}
          </Text>
          <span className={s.campaign}>{campaign.name}</span>
          <span className={s.ids}>
            Client code: {campaign.clientCode} · Project: {campaign.projectId} · {plural(campaign.total, "message")}
            {campaign.openActions > 0 ? ` · ${plural(campaign.openActions, "open action item")}` : ""}
          </span>
        </div>

        <Button
          className={s.reviewButton}
          appearance="primary"
          title="Marks every email in this campaign as read in Outlook and records the review. Nothing is archived, and action items stay open."
          icon={busy ? <Spinner size="tiny" appearance="inverted" /> : <Checkmark16Regular />}
          disabled={busy}
          onClick={() => void store.reviewCampaign(campaign.key, campaign.messages.map((m) => m.id))}
        >
          {state.busy ?? `Review & Clear — ${plural(campaign.total, "message")}`}
        </Button>
        <span className={s.reviewed}>
          {campaign.unread > 0 ? `${campaign.unread} unread` : "All read"} ·{" "}
          {campaign.reviewedAt ? `reviewed ${formatRelative(campaign.reviewedAt)}` : "not reviewed yet"} · action items stay open
        </span>

        <div className={s.toolbar}>
          <Checkbox
            checked={allSelected ? true : none ? false : "mixed"}
            onChange={() => setSelected(allSelected ? new Set() : new Set(shown.map((m) => m.id)))}
            label={none ? "Select all" : `${selectedIds.length} selected`}
          />
          <span className={s.spacer} />
          <Tooltip content="Mark selected as read" relationship="label">
            <Button className={s.toolButton} size="small" appearance="subtle" icon={<MailRead16Regular />} disabled={none || busy} onClick={() => void store.setRead(selectedIds, true)}>
              Read
            </Button>
          </Tooltip>
          <Tooltip content="Mark selected as unread" relationship="label">
            <Button className={s.toolButton} size="small" appearance="subtle" icon={<MailUnread16Regular />} disabled={none || busy} onClick={() => void store.setRead(selectedIds, false)}>
              Unread
            </Button>
          </Tooltip>
          <Tooltip content="Move selected to Archive" relationship="label">
            <Button className={s.toolButton} size="small" appearance="subtle" icon={<Archive16Regular />} disabled={none || busy} onClick={() => setConfirmArchive(true)}>
              Archive
            </Button>
          </Tooltip>
        </div>
      </header>

      <div className={s.options}>
        <Switch
          checked={hideAcks}
          onChange={(_, d) => setHideAcks(d.checked)}
          label={`Hide acknowledgments (${ackCount})`}
          disabled={ackCount === 0}
        />
      </div>

      <div className={s.scroll}>
        {shown.length === 0 && <div className={s.empty}>Every message in this campaign is an acknowledgment.</div>}
        {shown.map((m, i) => (
          <Fragment key={m.id}>
            {m.id === firstUnreadId && i > 0 && (
              <div className={s.divider} ref={firstUnreadRef}>
                Unread when you opened this
              </div>
            )}
            <MessageCard message={m} campaign={campaign} settings={settings} selected={selectedIds.includes(m.id)} onSelect={onSelect} />
          </Fragment>
        ))}
      </div>

      <Dialog open={confirmArchive} onOpenChange={(_, d) => setConfirmArchive(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Archive {plural(toArchive, "email")}?</DialogTitle>
            <DialogContent>
              {toArchive === 0
                ? "The selected emails are already in your Archive folder."
                : `This moves ${plural(toArchive, "email")} from ${campaign.clientName} to your Outlook Archive folder. Nothing is deleted, and the conversation stays available here.`}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirmArchive(false)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                disabled={toArchive === 0}
                onClick={() => {
                  setConfirmArchive(false);
                  void store.archive(selectedIds);
                }}
              >
                Archive
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
