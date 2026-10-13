import { useState } from "react";
import { Button, Caption1, makeStyles, MessageBar, MessageBarBody, ProgressBar, Radio, RadioGroup, Spinner, Text, tokens } from "@fluentui/react-components";
import { plural, useHubState, useStore } from "./common";

export const HISTORY_OPTIONS = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 182, label: "Last 6 months" },
  { days: 365, label: "Last 12 months" },
];

const useStyles = makeStyles({
  root: { padding: "24px 20px", display: "flex", flexDirection: "column", gap: "14px", height: "100%", boxSizing: "border-box", overflowY: "auto" },
  title: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightBold, lineHeight: "26px", display: "block", color: tokens.colorBrandForeground1 },
  muted: { color: tokens.colorNeutralForeground3, display: "block" },
  center: { margin: "auto 0", display: "flex", flexDirection: "column", gap: "12px", alignItems: "stretch" },
  stats: { display: "flex", flexDirection: "column", gap: "2px", fontSize: tokens.fontSizeBase300, fontVariantNumeric: "lining-nums tabular-nums" },
  big: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightBold, color: tokens.colorBrandForeground1 },
  list: { margin: 0, paddingLeft: "18px", color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, lineHeight: "18px" },
});

/** First-run screen: pick how much history to import. */
export function Onboarding() {
  const s = useStyles();
  const store = useStore();
  const state = useHubState();
  const [days, setDays] = useState(String(state.settings.historyDays));
  return (
    <div className={s.root}>
      <div>
        <Text as="h1" className={s.title}>
          ProWorkflow Hub
        </Text>
        <Caption1 className={s.muted}>Your campaign conversations, organized.</Caption1>
      </div>
      {state.errorMessage && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{state.errorMessage}</MessageBarBody>
        </MessageBar>
      )}
      <Text>
        {state.profile?.displayName ? `Hi ${state.profile.displayName.split(" ")[0]}. ` : ""}
        Choose how far back to look for ProWorkflow notifications in <b>{state.profile?.address || "your mailbox"}</b>.
      </Text>
      <RadioGroup value={days} onChange={(_, d) => setDays(d.value)} aria-label="History to import">
        {HISTORY_OPTIONS.map((o) => (
          <Radio key={o.days} value={String(o.days)} label={o.label} />
        ))}
      </RadioGroup>
      <Button appearance="primary" onClick={() => void store.startImport(Number(days))}>
        Organize my notifications
      </Button>
      <ul className={s.list}>
        <li>Emails are only read during the import. Nothing is moved, marked or deleted.</li>
        <li>Only email from approved ProWorkflow senders is looked at.</li>
        <li>You can import a longer range later from Settings.</li>
      </ul>
    </div>
  );
}

export function Importing() {
  const s = useStyles();
  const p = useHubState().importProgress ?? { processed: 0, clients: 0, campaigns: 0 };
  const known = typeof p.total === "number" && p.total > 0;
  return (
    <div className={s.root}>
      <div className={s.center} role="status" aria-live="polite">
        <Text className={s.big}>Organizing your ProWorkflow notifications…</Text>
        <ProgressBar value={known ? p.processed / (p.total as number) : undefined} />
        <div className={s.stats}>
          <span>{known ? `${p.processed} of ${p.total} emails processed` : `${plural(p.processed, "email")} processed`}</span>
          <span>{plural(p.clients, "client")} identified</span>
          <span>{plural(p.campaigns, "campaign")} identified</span>
        </div>
      </div>
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  const s = useStyles();
  return (
    <div className={s.root}>
      <div className={s.center}>
        <Spinner label={label} />
      </div>
    </div>
  );
}

/** Shown when Outlook could not sign the user in silently, or the build is not configured. */
export function SignIn() {
  const s = useStyles();
  const store = useStore();
  const state = useHubState();
  const setup = state.phase === "setup-error";
  return (
    <div className={s.root}>
      <div>
        <Text as="h1" className={s.title}>
          ProWorkflow Hub
        </Text>
        <Caption1 className={s.muted}>Your campaign conversations, organized.</Caption1>
      </div>
      {state.errorMessage && (
        <MessageBar intent={setup ? "warning" : "error"} layout="multiline">
          <MessageBarBody>{state.errorMessage}</MessageBarBody>
        </MessageBar>
      )}
      {!setup && (
        <>
          <Text>Connect ProWorkflow Hub to your Microsoft 365 mailbox to organize your ProWorkflow notifications.</Text>
          <Button appearance="primary" onClick={() => void store.signIn()}>
            Connect to Microsoft 365
          </Button>
          <ul className={s.list}>
            <li>You sign in with Microsoft. ProWorkflow Hub never sees your password.</li>
            <li>It asks to read and update mail in your own mailbox only.</li>
          </ul>
        </>
      )}
    </div>
  );
}
