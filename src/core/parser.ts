import type { ParseIssue, ParseResult, Settings } from "./types";
import { safeRegex } from "./settings";

/**
 * Identifier extraction for ProWorkflow notifications.
 *
 * Two sources are read, in this order of trust:
 *   1. The "Project" line in the notification body, which is ProWorkflow's own project path:
 *        IC MS-156727 - Phonak \ MS-156727 \ KOS/DANCHAK AUDIOLOGY, 20016174 \ Omnichannel Marketing SEPT 2026
 *   2. The subject line:
 *        IC MS-156727 - Google Analytics Access Check - PH- KOS/DANCHAK AUDIOLOGY, 20016174
 *
 * Every pattern comes from Settings, so the rules can change without touching this file.
 * When the result is ambiguous the message is flagged, never guessed into a campaign.
 */

const SEGMENT_SEPARATOR = /\s+[-–—]\s+/;
const REPLY_PREFIX = /^\s*((re|fw|fwd)\s*:\s*)+/i;
/** Words that stay upper-case when an ALL-CAPS client name is converted for display. */
const KEEP_UPPER = new Set(["LLC", "PLLC", "PC", "PA", "ENT", "MD", "USA", "II", "III", "IV", "HHC"]);

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function allMatches(text: string, pattern: string, group: number): { value: string; index: number }[] {
  const re = safeRegex(pattern, "g");
  if (!re) return [];
  const out: { value: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = (m[group] ?? m[0] ?? "").trim();
    if (value) out.push({ value, index: m.index });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

/** "KOS/DANCHAK AUDIOLOGY" -> "Kos/Danchak Audiology". Mixed-case names are left alone. */
export function displayClientName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name !== name.toUpperCase()) return name;
  return name.replace(/[A-Z][A-Z']*/g, (word) =>
    KEEP_UPPER.has(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()
  );
}

function stripBrand(segment: string, settings: Settings): { name: string; brand?: string } {
  const re = safeRegex(settings.brandPrefixPattern);
  const m = re ? re.exec(segment) : null;
  if (!m) return { name: segment.trim() };
  return { name: segment.slice(m[0].length).trim(), brand: (m[1] ?? "").trim() || undefined };
}

export interface SubjectParts {
  projectIds: string[];
  clientCodes: string[];
  clientName?: string;
  brand?: string;
  taskName?: string;
}

export function parseSubject(subjectRaw: string, settings: Settings): SubjectParts {
  const subject = (subjectRaw || "").replace(REPLY_PREFIX, "").trim();
  const projectIds = unique(allMatches(subject, settings.projectIdPattern, 0).map((m) => m.value));
  const codeMatches = allMatches(subject, settings.clientCodePattern, 1);
  const clientCodes = unique(codeMatches.map((m) => m.value));

  const parts: SubjectParts = { projectIds, clientCodes };

  // Everything before the client code, split into " - " separated segments.
  const head = codeMatches.length > 0 ? subject.slice(0, codeMatches[0].index) : subject;
  const segments = head
    .split(SEGMENT_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);

  // Drop a leading segment that only carries the project ID (plus a short prefix like "IC").
  const idRe = safeRegex(settings.projectIdPattern);
  if (segments.length > 0 && idRe && idRe.test(segments[0])) {
    const rest = segments[0].replace(idRe, "").trim();
    if (rest.length <= 4) segments.shift();
    else segments[0] = rest;
  }

  if (codeMatches.length > 0 && segments.length > 0) {
    const { name, brand } = stripBrand(segments.pop() as string, settings);
    if (name) parts.clientName = name;
    parts.brand = brand;
  }
  if (segments.length > 0) parts.taskName = segments.join(" - ");
  return parts;
}

export interface ProjectLineParts {
  raw: string;
  projectIds: string[];
  clientCodes: string[];
  clientName?: string;
  campaignName?: string;
}

/** Find the value of the "Project" row in the notification body. */
export function findProjectLine(bodyText: string): string | null {
  const lines = (bodyText || "").replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/ /g, " ").trim();
    const m = /^Project\s*:?\s*(.*)$/i.exec(line);
    if (!m) continue;
    let value = m[1].trim();
    if (!value) {
      // Table cells often land on separate lines once the HTML is converted to text.
      const next = lines.slice(i + 1).find((l) => l.trim().length > 0);
      value = (next ?? "").trim();
    }
    // Remove a trailing link such as "<https://...>" or "[https://...]".
    value = value.replace(/\s*[<[(]https?:\/\/[^>\])]*[>\])]\s*$/i, "").trim();
    if (value) return value;
  }
  return null;
}

export function parseProjectLine(bodyText: string, settings: Settings): ProjectLineParts | null {
  const raw = findProjectLine(bodyText);
  if (!raw) return null;
  const segments = raw
    .split("\\")
    .map((s) => s.trim())
    .filter(Boolean);
  const projectIds = unique(allMatches(raw, settings.projectIdPattern, 0).map((m) => m.value));
  const clientCodes = unique(allMatches(raw, settings.clientCodePattern, 1).map((m) => m.value));
  const parts: ProjectLineParts = { raw, projectIds, clientCodes };

  const idRe = safeRegex(settings.projectIdPattern);
  let clientSegment = -1;
  segments.forEach((seg, i) => {
    const codes = allMatches(seg, settings.clientCodePattern, 1);
    if (codes.length > 0 && clientSegment === -1) {
      clientSegment = i;
      const name = stripBrand(seg.slice(0, codes[0].index).trim(), settings).name;
      if (name) parts.clientName = name;
    }
  });

  // The campaign name is the last path segment, as long as it is a name and not an identifier.
  if (segments.length > 1) {
    const last = segments[segments.length - 1];
    const lastIndex = segments.length - 1;
    const onlyAnId = idRe ? last.replace(idRe, "").trim().length === 0 : false;
    if (lastIndex !== clientSegment && !onlyAnId) parts.campaignName = last;
  }
  return parts;
}

/** Combine subject and body into one result, flagging anything that cannot be trusted. */
export function parseMessage(subject: string, bodyText: string, settings: Settings): ParseResult {
  const s = parseSubject(subject, settings);
  const p = parseProjectLine(bodyText, settings);
  const issues: ParseIssue[] = [];

  // Client code. Subject and body must agree.
  let clientCode: string | undefined;
  const bodyCodes = p?.clientCodes ?? [];
  if (s.clientCodes.length > 1 || bodyCodes.length > 1) {
    issues.push("multiple-client-codes");
  } else if (s.clientCodes.length === 1 && bodyCodes.length === 1 && s.clientCodes[0] !== bodyCodes[0]) {
    issues.push("subject-body-client-mismatch");
  } else {
    clientCode = bodyCodes[0] ?? s.clientCodes[0];
    if (!clientCode) issues.push("no-client-code");
  }

  // Project ID. The body's project path wins: the subject may name a task instead of the project.
  let projectId: string | undefined;
  const bodyIds = p?.projectIds ?? [];
  if (bodyIds.length === 1) {
    projectId = bodyIds[0];
  } else if (bodyIds.length > 1) {
    issues.push("multiple-project-ids");
  } else if (s.projectIds.length === 1) {
    projectId = s.projectIds[0];
  } else if (s.projectIds.length > 1) {
    issues.push("multiple-project-ids");
  } else {
    issues.push("no-project-id");
  }

  if (issues.includes("no-client-code") && issues.includes("no-project-id")) {
    issues.push("unrecognized-format");
  }

  const rawClientName = p?.clientName ?? s.clientName;
  let campaignName: string | undefined;
  let campaignNameSource: ParseResult["campaignNameSource"] = "none";
  if (p?.campaignName) {
    campaignName = p.campaignName;
    campaignNameSource = "project-line";
  } else if (s.taskName) {
    campaignName = s.taskName;
    campaignNameSource = "subject";
  }

  return {
    projectId,
    clientCode,
    clientName: rawClientName ? displayClientName(rawClientName) : undefined,
    campaignName,
    taskName: s.taskName,
    brand: s.brand,
    campaignNameSource,
    issues,
    confident: Boolean(projectId && clientCode) && issues.length === 0,
  };
}

export const ISSUE_LABELS: Record<ParseIssue, string> = {
  "no-client-code": "No client code found",
  "no-project-id": "No project ID found",
  "multiple-client-codes": "More than one client code",
  "multiple-project-ids": "More than one project ID",
  "subject-body-client-mismatch": "Subject and body name different clients",
  "unrecognized-format": "Unfamiliar subject format",
};
