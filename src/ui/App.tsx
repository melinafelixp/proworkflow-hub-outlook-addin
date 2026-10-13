import { useEffect, useState } from "react";
import {
  Button,
  FluentProvider,
  makeStyles,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  tokens,
} from "@fluentui/react-components";
import { Dismiss16Regular } from "@fluentui/react-icons";
import type { HubStore } from "../state/hubStore";
import { HubContext, useGrouped, useHubState, useStore } from "./common";
import { Conversation } from "./Conversation";
import { Dashboard } from "./Dashboard";
import { Importing, Loading, Onboarding, SignIn } from "./Onboarding";
import { Settings } from "./Settings";
import { BRAND, brandStyleHooks, brandTheme } from "./theme";
import { Uncategorized } from "./Uncategorized";

const useStyles = makeStyles({
  shell: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    borderTop: `3px solid ${BRAND.primary}`,
    boxSizing: "border-box",
    fontVariantNumeric: "lining-nums",
  },
  preview: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 12px",
    backgroundColor: BRAND.secondaryTint,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
    borderBottom: `1px solid ${BRAND.secondaryTintStrong}`,
  },
  previewText: { flexGrow: 1, minWidth: 0 },
  main: { flexGrow: 1, minHeight: 0 },
  notice: { padding: "0 8px 8px", backgroundColor: tokens.colorNeutralBackground2 },
});

type Screen = { name: "dashboard" } | { name: "campaign"; key: string } | { name: "uncategorized" } | { name: "settings" };

function Shell() {
  const s = useStyles();
  const store = useStore();
  const state = useHubState();
  const { campaigns, uncategorized } = useGrouped(state);
  const [screen, setScreen] = useState<Screen>({ name: "dashboard" });
  const home = () => setScreen({ name: "dashboard" });

  // Success messages clear themselves. Warnings and errors stay until dismissed.
  const notice = state.notice;
  useEffect(() => {
    if (!notice || notice.kind !== "success") return;
    const t = setTimeout(store.dismissNotice, 5000);
    return () => clearTimeout(t);
  }, [notice, store]);

  let body: React.ReactNode;
  if (state.phase === "loading") body = <Loading label="Connecting to your mailbox…" />;
  else if (state.phase === "signin" || state.phase === "setup-error") body = <SignIn />;
  else if (state.phase === "onboarding") body = <Onboarding />;
  else if (state.phase === "importing") body = <Importing />;
  else if (screen.name === "settings") body = <Settings onBack={home} />;
  else if (screen.name === "uncategorized") body = <Uncategorized messages={uncategorized} campaigns={campaigns} onBack={home} />;
  else {
    const campaign = screen.name === "campaign" ? campaigns.find((c) => c.key === screen.key) : undefined;
    body = campaign ? (
      <Conversation key={campaign.key} campaign={campaign} onBack={home} />
    ) : (
      <Dashboard
        onOpenCampaign={(key) => setScreen({ name: "campaign", key })}
        onOpenUncategorized={() => setScreen({ name: "uncategorized" })}
        onOpenSettings={() => setScreen({ name: "settings" })}
      />
    );
  }

  return (
    <div className={s.shell}>
      {state.mode === "mock" && (
        <div className={s.preview}>
          <span className={s.previewText}>Preview · sample data</span>
          {state.phase === "ready" && (
            <Button size="small" appearance="outline" onClick={() => void store.simulateIncoming()}>
              Simulate new email
            </Button>
          )}
        </div>
      )}
      <div className={s.main}>{body}</div>
      {notice && (
        <div className={s.notice}>
          <MessageBar intent={notice.kind} layout="multiline" key={notice.id}>
            <MessageBarBody>{notice.text}</MessageBarBody>
            <MessageBarActions
              containerAction={<Button appearance="transparent" size="small" icon={<Dismiss16Regular />} aria-label="Dismiss" onClick={store.dismissNotice} />}
            >
              {notice.retry && (
                <Button size="small" onClick={() => void store.retry(notice.retry!)}>
                  Retry {notice.retry.ids.length} failed
                </Button>
              )}
            </MessageBarActions>
          </MessageBar>
        </div>
      )}
    </div>
  );
}

export function App({ store }: { store: HubStore }) {
  return (
    // Height goes on `style`, not a class: Fluent copies the provider's classes onto its portal nodes
    // (menus, tooltips, dialogs), and a full-height portal would sit on top of the pane.
    <FluentProvider theme={brandTheme} customStyleHooks_unstable={brandStyleHooks} style={{ height: "100%" }}>
      <HubContext.Provider value={store}>
        <Shell />
      </HubContext.Provider>
    </FluentProvider>
  );
}
