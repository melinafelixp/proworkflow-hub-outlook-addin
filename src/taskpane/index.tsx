import { createRoot } from "react-dom/client";
import { isPreviewMode } from "../config";
import { createGraphProvider } from "../data/graph/graphProvider";
import { MockProvider } from "../data/mockProvider";
import { HubStore } from "../state/hubStore";
import { App } from "../ui/App";

/**
 * Entry point for the task pane.
 *
 *   Inside Outlook        real mailbox through Microsoft Graph
 *   ?preview=1, or any    sample data, no sign-in. Nothing is saved, so every load starts fresh.
 *   plain browser tab
 */
function start(preview: boolean): void {
  const store = preview ? new HubStore(new MockProvider(), { persist: false }) : new HubStore(createGraphProvider(), { persist: true });
  const root = document.getElementById("root");
  if (!root) return;
  createRoot(root).render(<App store={store} />);
  void store.init();
  if (!preview) watchOutlookSelection(store);
}

/** A pinned pane stays open while the user moves between emails. Follow the selection. */
function watchOutlookSelection(store: HubStore): void {
  const read = () => {
    try {
      const item = Office.context.mailbox.item as { subject?: unknown } | null | undefined;
      store.onOutlookSelection(item && typeof item.subject === "string" ? item.subject : undefined);
    } catch {
      /* no item selected */
    }
  };
  try {
    Office.context.mailbox.addHandlerAsync(Office.EventType.ItemChanged, read);
    read();
  } catch {
    /* ItemChanged is not available in this host; polling still keeps the pane current */
  }
}

if (isPreviewMode()) {
  start(true);
} else {
  Office.onReady((info) => start(info.host !== Office.HostType.Outlook));
}
