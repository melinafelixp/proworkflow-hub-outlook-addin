import type { Settings } from "./types";

/**
 * Organisation-wide defaults. Change these here and redeploy to change them for everyone.
 * Each user can still adjust their own copy in the Settings screen.
 */
export const DEFAULT_SETTINGS: Settings = {
  senderAddresses: ["reply@notify.proworkflow.com"],
  senderDomains: [],
  // "MS-156727". Letters, a dash, then at least four digits.
  projectIdPattern: "\\b[A-Z]{2,4}-\\d{4,}\\b",
  // The number after the last comma: "KOS/DANCHAK AUDIOLOGY, 20016174". Length is deliberately loose.
  clientCodePattern: ",\\s*(\\d{5,12})\\b",
  // "PH- KOS/DANCHAK AUDIOLOGY" -> brand "PH".
  brandPrefixPattern: "^([A-Z]{2,4})\\s*-\\s+",
  commentMarkerPatterns: ["^(.+?) from (.+?) has sent you a message\\s*$"],
  messageOrder: "oldest",
  groupBy: "status",
  defaultFilter: "all",
  density: "expanded",
  highlightNew: true,
  highlightActions: true,
  highlightApprovals: false,
  historyDays: 90,
};

/** Merge stored settings over the defaults so new settings get a value after an update. */
export function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

/** Compile a user-supplied regex without throwing. Returns null when the pattern is invalid. */
export function safeRegex(pattern: string, flags = ""): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/** Returns an error message for an invalid pattern, or null when it is fine. */
export function validatePattern(pattern: string, needsGroup: boolean): string | null {
  if (!pattern.trim()) return "Pattern is empty.";
  const re = safeRegex(pattern);
  if (!re) return "This is not a valid regular expression.";
  if (needsGroup && new RegExp(pattern + "|").exec("")!.length < 2) {
    return "Wrap the part to extract in parentheses.";
  }
  return null;
}

/** True when the sender is one of the approved ProWorkflow notification senders. */
export function isProWorkflowSender(address: string, settings: Settings): boolean {
  const a = (address || "").trim().toLowerCase();
  if (!a) return false;
  if (settings.senderAddresses.some((s) => s.trim().toLowerCase() === a)) return true;
  const domain = a.slice(a.lastIndexOf("@") + 1);
  return settings.senderDomains.some((d) => {
    const want = d.trim().toLowerCase().replace(/^@/, "");
    return want.length > 0 && (domain === want || domain.endsWith("." + want));
  });
}
