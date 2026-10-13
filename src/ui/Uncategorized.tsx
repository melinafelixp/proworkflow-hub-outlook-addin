import { useMemo } from "react";
import { Button, Caption1, makeStyles, Select, Text, tokens } from "@fluentui/react-components";
import { ArrowLeft16Regular } from "@fluentui/react-icons";
import { formatFull } from "../core/dates";
import { ISSUE_LABELS } from "../core/parser";
import type { Campaign, HubMessage } from "../core/types";
import { CategoryBadge, plural, useStore } from "./common";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
  header: { padding: "8px 12px 10px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  back: { marginLeft: "-8px" },
  title: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightBold, display: "block", marginTop: "4px", color: tokens.colorBrandForeground1 },
  muted: { color: tokens.colorNeutralForeground3, display: "block" },
  scroll: { flexGrow: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px 20px" },
  item: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "10px 12px",
    marginBottom: "6px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  top: { display: "flex", alignItems: "baseline", gap: "6px" },
  author: { fontWeight: tokens.fontWeightBold, fontSize: tokens.fontSizeBase300, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  time: { marginLeft: "auto", flexShrink: 0, color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  subject: { fontSize: tokens.fontSizeBase300, overflowWrap: "anywhere" },
  why: { color: tokens.colorPaletteDarkOrangeForeground1, fontSize: tokens.fontSizeBase200 },
  comment: { fontSize: tokens.fontSizeBase300, lineHeight: "20px", whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: tokens.colorNeutralForeground2 },
  row: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" },
  grow: { flexGrow: 1, minWidth: "140px" },
  empty: { padding: "28px 12px", textAlign: "center", color: tokens.colorNeutralForeground3 },
});

function Item({ message, campaigns }: { message: HubMessage; campaigns: Campaign[] }) {
  const s = useStyles();
  const store = useStore();
  // Campaigns of the same client first: that is almost always where the email belongs.
  const options = useMemo(() => {
    const code = message.parse.clientCode;
    return [...campaigns].sort((a, b) => {
      const am = a.clientCode === code ? 0 : 1;
      const bm = b.clientCode === code ? 0 : 1;
      return am - bm || a.clientName.localeCompare(b.clientName) || a.name.localeCompare(b.name);
    });
  }, [campaigns, message.parse.clientCode]);

  return (
    <article className={s.item}>
      <div className={s.top}>
        <span className={s.author}>{message.author}</span>
        <span className={s.time}>{formatFull(message.receivedAt)}</span>
      </div>
      <span className={s.subject}>{message.subject || "(no subject)"}</span>
      <span className={s.why}>{message.parse.issues.map((i) => ISSUE_LABELS[i]).join(" · ") || "Could not be grouped"}</span>
      <div className={s.comment}>{message.comment}</div>
      <div className={s.row}>
        <CategoryBadge classification={message.classification} />
        {!message.isRead && <Caption1>Unread</Caption1>}
      </div>
      <div className={s.row}>
        <Select
          className={s.grow}
          size="small"
          aria-label="File under a campaign"
          value=""
          onChange={(_, d) => d.value && store.assign(message.id, d.value)}
        >
          <option value="">File under a campaign…</option>
          {options.map((c) => (
            <option key={c.key} value={c.key}>
              {c.clientName} — {c.name} ({c.projectId})
            </option>
          ))}
        </Select>
        <Button size="small" onClick={() => void store.openInOutlook(message)}>
          Open in Outlook
        </Button>
        {!message.isRead && (
          <Button size="small" appearance="subtle" onClick={() => void store.setRead([message.id], true)}>
            Mark read
          </Button>
        )}
      </div>
    </article>
  );
}

export function Uncategorized({ messages, campaigns, onBack }: { messages: HubMessage[]; campaigns: Campaign[]; onBack: () => void }) {
  const s = useStyles();
  return (
    <div className={s.root}>
      <header className={s.header}>
        <Button className={s.back} appearance="subtle" size="small" icon={<ArrowLeft16Regular />} onClick={onBack}>
          Back to campaigns
        </Button>
        <Text as="h2" className={s.title}>
          Uncategorized
        </Text>
        <Caption1 className={s.muted}>
          {plural(messages.length, "email")} could not be matched to a client and project with confidence, so nothing was guessed.
        </Caption1>
      </header>
      <div className={s.scroll}>
        {messages.length === 0 && <div className={s.empty}>Everything is filed.</div>}
        {messages.map((m) => (
          <Item key={m.id} message={m} campaigns={campaigns} />
        ))}
      </div>
    </div>
  );
}
