import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { Badge, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { CATEGORY_LABELS } from "../core/classifier";
import { buildCampaigns, type Grouped } from "../core/grouping";
import type { CampaignStatus, Category, Classification } from "../core/types";
import type { HubState, HubStore } from "../state/hubStore";
import { BRAND } from "./theme";

export const HubContext = createContext<HubStore | null>(null);

export function useStore(): HubStore {
  const store = useContext(HubContext);
  if (!store) throw new Error("HubContext is missing.");
  return store;
}

export function useHubState(): HubState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}

/** Campaigns and uncategorized emails, rebuilt only when messages or review state change. */
export function useGrouped(state: HubState): Grouped {
  return useMemo(() => buildCampaigns(state.messages, state.userState), [state.messages, state.userState]);
}

const useDotStyles = makeStyles({
  dot: {
    display: "inline-block",
    flexShrink: 0,
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    boxSizing: "border-box",
  },
  attention: { backgroundColor: tokens.colorPaletteRedBackground3 },
  new: { backgroundColor: BRAND.secondary },
  uptodate: { backgroundColor: tokens.colorPaletteGreenBackground3 },
  review: { backgroundColor: "transparent", border: `2px solid ${tokens.colorNeutralStroke1}` },
});

export function StatusDot({ status }: { status: CampaignStatus }) {
  const s = useDotStyles();
  return <span aria-hidden="true" className={mergeClasses(s.dot, s[status])} />;
}

const BADGE_COLOR: Record<Category, "danger" | "success" | "informative" | "brand" | "warning"> = {
  action: "danger",
  approval: "success",
  acknowledgment: "informative",
  update: "brand",
  review: "warning",
};

export function CategoryBadge({ classification }: { classification: Classification }) {
  const uncertain = classification.source === "rule" && classification.confidence !== "high";
  return (
    <Badge
      appearance="tint"
      color={BADGE_COLOR[classification.category]}
      size="medium"
    >
      {CATEGORY_LABELS[classification.category]}
      {uncertain && classification.category !== "review" ? " ?" : ""}
    </Badge>
  );
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
