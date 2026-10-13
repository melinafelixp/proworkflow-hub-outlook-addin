import { useMemo, useState } from "react";
import { Button, Caption1, Field, Input, makeStyles, Select, Switch, Text, tokens } from "@fluentui/react-components";
import { Add16Regular, ArrowLeft16Regular, Dismiss16Regular } from "@fluentui/react-icons";
import { CONFIG } from "../config";
import { formatFull } from "../core/dates";
import { ISSUE_LABELS, parseMessage } from "../core/parser";
import { DEFAULT_SETTINGS, validatePattern } from "../core/settings";
import type { Settings as SettingsType } from "../core/types";
import { useHubState, useStore } from "./common";
import { HISTORY_OPTIONS } from "./Onboarding";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
  header: {
    padding: "8px 12px 10px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  back: { marginLeft: "-8px" },
  title: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightBold, display: "block", marginTop: "4px", color: tokens.colorBrandForeground1 },
  scroll: { flexGrow: 1, minHeight: 0, overflowY: "auto", padding: "4px 16px 28px" },
  section: { paddingTop: "16px", display: "flex", flexDirection: "column", gap: "10px" },
  sectionTitle: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightBold, display: "block", color: tokens.colorBrandForeground1 },
  help: { color: tokens.colorNeutralForeground3, display: "block" },
  chip: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 2px 2px 10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase200,
    overflowWrap: "anywhere",
  },
  chipText: { flexGrow: 1, minWidth: 0 },
  addRow: { display: "flex", gap: "6px" },
  grow: { flexGrow: 1, minWidth: 0 },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  test: {
    padding: "8px 10px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    fontSize: tokens.fontSizeBase200,
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    columnGap: "10px",
    rowGap: "2px",
    overflowWrap: "anywhere",
  },
  testLabel: { color: tokens.colorNeutralForeground3 },
  bad: { color: tokens.colorPaletteRedForeground1 },
  about: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, lineHeight: "18px" },
});

function ListEditor({
  label,
  hint,
  items,
  placeholder,
  validate,
  onChange,
}: {
  label: string;
  hint: string;
  items: string[];
  placeholder: string;
  validate: (v: string) => string | null;
  onChange: (items: string[]) => void;
}) {
  const s = useStyles();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const value = draft.trim().toLowerCase();
    if (!value) return;
    const problem = items.includes(value) ? "Already in the list." : validate(value);
    if (problem) return setError(problem);
    onChange([...items, value]);
    setDraft("");
    setError(null);
  };
  return (
    <Field label={label} hint={hint} validationMessage={error ?? undefined} validationState={error ? "error" : "none"}>
      <div>
        {items.map((item) => (
          <div key={item} className={s.chip} style={{ marginBottom: 4 }}>
            <span className={s.chipText}>{item}</span>
            <Button appearance="transparent" size="small" icon={<Dismiss16Regular />} aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((i) => i !== item))} />
          </div>
        ))}
        <div className={s.addRow}>
          <Input
            className={s.grow}
            size="small"
            placeholder={placeholder}
            value={draft}
            onChange={(_, d) => {
              setDraft(d.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button size="small" icon={<Add16Regular />} onClick={add}>
            Add
          </Button>
        </div>
      </div>
    </Field>
  );
}

function PatternField({
  label,
  hint,
  value,
  needsGroup,
  onCommit,
}: {
  label: string;
  hint: string;
  value: string;
  needsGroup: boolean;
  onCommit: (v: string) => void;
}) {
  const s = useStyles();
  const [draft, setDraft] = useState(value);
  const error = validatePattern(draft, needsGroup);
  return (
    <Field label={label} hint={hint} validationMessage={error ?? undefined} validationState={error ? "error" : "none"}>
      <Input
        size="small"
        className={s.mono}
        value={draft}
        spellCheck={false}
        onChange={(_, d) => {
          setDraft(d.value);
          // Only a valid pattern is ever saved, so a typo can never break grouping.
          if (!validatePattern(d.value, needsGroup)) onCommit(d.value);
        }}
      />
    </Field>
  );
}

export function Settings({ onBack }: { onBack: () => void }) {
  const s = useStyles();
  const store = useStore();
  const state = useHubState();
  const { settings } = state;
  const set = (patch: Partial<SettingsType>) => store.updateSettings(patch);

  const [sample, setSample] = useState("IC MS-156727 - Google Analytics Access Check - PH- KOS/DANCHAK AUDIOLOGY, 20016174");
  const parsed = useMemo(() => parseMessage(sample, "", settings), [sample, settings]);
  const [days, setDays] = useState(String(settings.historyDays));
  const [confirmClear, setConfirmClear] = useState(false);
  // Sender list as it was when Settings opened, to know when a fresh import is worth suggesting.
  const [sendersAtOpen] = useState(() => JSON.stringify([settings.senderAddresses, settings.senderDomains]));
  const sendersChanged = JSON.stringify([settings.senderAddresses, settings.senderDomains]) !== sendersAtOpen;

  return (
    <div className={s.root}>
      <header className={s.header}>
        <Button className={s.back} appearance="subtle" size="small" icon={<ArrowLeft16Regular />} onClick={onBack}>
          Back to campaigns
        </Button>
        <Text as="h2" className={s.title}>
          Settings
        </Text>
      </header>

      <div className={s.scroll}>
        <section className={s.section}>
          <span className={s.sectionTitle}>ProWorkflow senders</span>
          <Caption1 className={s.help}>Only email from these senders is read. The sender's display name is ignored.</Caption1>
          <ListEditor
            label="Addresses"
            hint="Exact match."
            items={settings.senderAddresses}
            placeholder="reply@notify.proworkflow.com"
            validate={(v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "Enter a full email address.")}
            onChange={(senderAddresses) => set({ senderAddresses })}
          />
          <ListEditor
            label="Domains"
            hint="Matches any address at the domain. Slower than exact addresses."
            items={settings.senderDomains}
            placeholder="notify.proworkflow.com"
            validate={(v) => (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v) ? null : "Enter a domain such as example.com.")}
            onChange={(senderDomains) => set({ senderDomains })}
          />
          {sendersChanged && <Caption1 className={s.help}>Run the import below to pick up existing email from the new senders.</Caption1>}
        </section>

        <section className={s.section}>
          <span className={s.sectionTitle}>Identifier rules</span>
          <Caption1 className={s.help}>Regular expressions used to read the subject line. Changes apply to loaded emails immediately.</Caption1>
          <PatternField
            label="Project ID"
            hint="The whole match is the project ID."
            value={settings.projectIdPattern}
            needsGroup={false}
            onCommit={(projectIdPattern) => set({ projectIdPattern })}
          />
          <PatternField
            label="Client code"
            hint="The part in parentheses is the client code."
            value={settings.clientCodePattern}
            needsGroup
            onCommit={(clientCodePattern) => set({ clientCodePattern })}
          />
          <PatternField
            label="Brand prefix"
            hint="Removed from the front of the client name."
            value={settings.brandPrefixPattern}
            needsGroup
            onCommit={(brandPrefixPattern) => set({ brandPrefixPattern })}
          />
          <Field label="Try a subject line">
            <Input size="small" value={sample} onChange={(_, d) => setSample(d.value)} />
          </Field>
          <div className={s.test} aria-live="polite">
            <span className={s.testLabel}>Client</span>
            <span>{parsed.clientName ?? "—"}</span>
            <span className={s.testLabel}>Client code</span>
            <span>{parsed.clientCode ?? "—"}</span>
            <span className={s.testLabel}>Project ID</span>
            <span>{parsed.projectId ?? "—"}</span>
            <span className={s.testLabel}>Task</span>
            <span>{parsed.taskName ?? "—"}</span>
            <span className={s.testLabel}>Result</span>
            <span className={parsed.confident ? undefined : s.bad}>
              {parsed.confident ? "Grouped automatically" : `Uncategorized: ${parsed.issues.map((i) => ISSUE_LABELS[i]).join(", ")}`}
            </span>
          </div>
          <Button
            size="small"
            appearance="subtle"
            onClick={() =>
              set({
                projectIdPattern: DEFAULT_SETTINGS.projectIdPattern,
                clientCodePattern: DEFAULT_SETTINGS.clientCodePattern,
                brandPrefixPattern: DEFAULT_SETTINGS.brandPrefixPattern,
              })
            }
          >
            Restore default rules
          </Button>
        </section>

        <section className={s.section}>
          <span className={s.sectionTitle}>Display</span>
          <Field label="Message order">
            <Select size="small" value={settings.messageOrder} onChange={(_, d) => set({ messageOrder: d.value as SettingsType["messageOrder"] })}>
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
            </Select>
          </Field>
          <Field label="Campaign list" hint="Applies the next time the pane opens.">
            <Select size="small" value={settings.groupBy} onChange={(_, d) => set({ groupBy: d.value as SettingsType["groupBy"] })}>
              <option value="status">Grouped by status</option>
              <option value="client">Grouped by client</option>
            </Select>
          </Field>
          <Field label="Default filter" hint="Applies the next time the pane opens.">
            <Select size="small" value={settings.defaultFilter} onChange={(_, d) => set({ defaultFilter: d.value as SettingsType["defaultFilter"] })}>
              <option value="all">All campaigns</option>
              <option value="attention">Needs attention</option>
              <option value="new">New activity</option>
              <option value="uptodate">Up to date</option>
              <option value="review">Needs review</option>
            </Select>
          </Field>
          <Field label="Density">
            <Select size="small" value={settings.density} onChange={(_, d) => set({ density: d.value as SettingsType["density"] })}>
              <option value="expanded">Expanded</option>
              <option value="compact">Compact</option>
            </Select>
          </Field>
        </section>

        <section className={s.section}>
          <span className={s.sectionTitle}>Highlights</span>
          <Caption1 className={s.help}>Color accents inside the pane only. ProWorkflow Hub never sends alerts.</Caption1>
          <Switch checked={settings.highlightNew} onChange={(_, d) => set({ highlightNew: d.checked })} label="New messages" />
          <Switch checked={settings.highlightActions} onChange={(_, d) => set({ highlightActions: d.checked })} label="Action-required comments" />
          <Switch checked={settings.highlightApprovals} onChange={(_, d) => set({ highlightApprovals: d.checked })} label="Approvals" />
        </section>

        <section className={s.section}>
          <span className={s.sectionTitle}>Email history</span>
          <Caption1 className={s.help}>Reload ProWorkflow notifications from your mailbox. Your review status and corrections are kept.</Caption1>
          <div className={s.addRow}>
            <Select className={s.grow} size="small" value={days} onChange={(_, d) => setDays(d.value)} aria-label="History range">
              {HISTORY_OPTIONS.map((o) => (
                <option key={o.days} value={String(o.days)}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button size="small" onClick={() => void store.startImport(Number(days))}>
              Import again
            </Button>
          </div>
        </section>

        <section className={s.section}>
          <span className={s.sectionTitle}>Data on this device</span>
          <Caption1 className={s.help}>
            ProWorkflow Hub keeps a small index (message IDs, identifiers, comment text, your review status) in Outlook's local storage on this
            device. Nothing is stored on a server. Clearing it does not change your mailbox.
          </Caption1>
          {confirmClear ? (
            <div className={s.addRow}>
              <Button size="small" appearance="primary" onClick={() => void store.clearLocalData()}>
                Clear and start over
              </Button>
              <Button size="small" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="small" onClick={() => setConfirmClear(true)}>
              Clear local data
            </Button>
          )}
        </section>

        <section className={s.section}>
          <span className={s.sectionTitle}>About</span>
          <div className={s.about}>
            ProWorkflow Hub {CONFIG.version}
            <br />
            {state.mode === "mock" ? "Preview mode: sample data, not connected to a mailbox." : `Connected as ${state.profile?.address ?? "unknown"}`}
            <br />
            {state.sync.lastSyncAt ? `Last sync: ${formatFull(state.sync.lastSyncAt)}` : "Not synced yet"}
            <br />
            Message classification: built-in rules, run on this device.
          </div>
        </section>
      </div>
    </div>
  );
}
