/**
 * Build-time configuration. Values come from the .env file (see .env.example) and are baked in
 * by webpack. Nothing here is secret: an Entra application (client) ID is a public identifier.
 */
declare const __PWH_CLIENT_ID__: string;
declare const __PWH_AUTHORITY__: string;
declare const __PWH_VERSION__: string;

function read(value: () => string, fallback: string): string {
  try {
    return value() || fallback;
  } catch {
    return fallback;
  }
}

export const CONFIG = {
  /** Application (client) ID of the Entra app registration. */
  clientId: read(() => __PWH_CLIENT_ID__, ""),
  /**
   * Sign-in authority.
   *   https://login.microsoftonline.com/organizations   any work account (multi-tenant registration)
   *   https://login.microsoftonline.com/<tenant-id>     one tenant only
   */
  authority: read(() => __PWH_AUTHORITY__, "https://login.microsoftonline.com/organizations"),
  version: read(() => __PWH_VERSION__, "dev"),
  /** How often to check the mailbox for changes while the pane is visible. */
  syncIntervalMs: 60_000,
};

/** Preview mode runs the full interface on sample data, with no Outlook and no sign-in. */
export function isPreviewMode(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("preview") === "1") return true;
  } catch {
    /* ignore */
  }
  return typeof Office === "undefined";
}
