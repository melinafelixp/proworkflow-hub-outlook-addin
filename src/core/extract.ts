import type { Settings } from "./types";
import { safeRegex } from "./settings";

/**
 * Pulls the actual comment out of a ProWorkflow notification.
 *
 * A notification body (as plain text) looks like this:
 *
 *   ----------------------------------------
 *   Write ABOVE THIS LINE to reply
 *   (Messages larger than 10 Mb WILL NOT BE uploaded)
 *   Sonova USA Inc.
 *   New message                         Received at 10-08-2026 9:36 am
 *   Project   IC MS-156727 - Phonak \ MS-156727 \ KOS/DANCHAK AUDIOLOGY, 20016174 \ ...
 *   To        Alex Tran, Morgan Reyes
 *   Dana Whitfield from Sonova USA Inc. has sent you a message
 *   Wonderful news, thank you so much Chloe!
 *   Dana Whitfield Profile Picture
 *   Dana Whitfield
 *   Account Marketing ...
 *
 * The comment is the text between the "has sent you a message" line and the signature block.
 * Nothing is removed from the mailbox: the original email is always one click away.
 */

export interface Extraction {
  comment: string;
  /** True when the template marker was found. False means `comment` is a best-effort fallback. */
  extracted: boolean;
  author?: string;
  company?: string;
}

const BOILERPLATE: RegExp[] = [
  /^[-_=\s]{5,}$/,
  /write above this line/i,
  /messages larger than .* will not be uploaded/i,
  /^new message\b/i,
  /^received at\b/i,
  /^project\s*:?\s/i,
];

/** Lines that end the comment: signature blocks, quoted replies and template footers. */
const STOP: RegExp[] = [
  /profile picture\s*$/i,
  /^[-_=]{5,}\s*$/,
  /write above this line/i,
  /^on .{4,80} wrote:\s*$/i,
  /^from:\s.+/i,
  /^-{2,}\s*original message\s*-{2,}/i,
  /^(view|open|reply to) (this |the )?(message|project|task)\b/i,
  /^powered by proworkflow/i,
  /^(you are receiving|to stop receiving|unsubscribe)\b/i,
];

export function normalizeText(text: string): string {
  return (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ ​‌‍﻿]/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n");
}

function tidy(lines: string[]): string {
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractComment(bodyText: string, settings: Settings, fallbackAuthor?: string): Extraction {
  const lines = normalizeText(bodyText).split("\n");
  const markers = settings.commentMarkerPatterns
    .map((p) => safeRegex(p, "i"))
    .filter((r): r is RegExp => r !== null);

  let markerIndex = -1;
  let author: string | undefined;
  let company: string | undefined;
  for (let i = 0; i < lines.length && markerIndex === -1; i++) {
    for (const re of markers) {
      const m = re.exec(lines[i]);
      if (m) {
        markerIndex = i;
        author = m[1]?.trim() || undefined;
        company = m[2]?.trim() || undefined;
        break;
      }
    }
  }

  if (markerIndex >= 0) {
    const who = (author ?? fallbackAuthor ?? "").toLowerCase();
    const out: string[] = [];
    for (let i = markerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const hasContent = out.some((l) => l.length > 0);
      if (STOP.some((re) => re.test(line))) break;
      // A line that is exactly the author's name, after some content, starts the signature block.
      if (hasContent && who && line.toLowerCase() === who) break;
      out.push(line);
    }
    const comment = tidy(out);
    if (comment) return { comment, extracted: true, author, company };
  }

  // Fallback: the template was not recognised. Show the text with known boilerplate lines dropped.
  const kept: string[] = [];
  let afterProject = false;
  for (const line of lines) {
    // The recipients row sits directly under the project row. Only drop "To ..." in that position,
    // so a comment that happens to start with "To" is never lost.
    const isRecipients = afterProject && /^to\s*:?\s/i.test(line);
    if (line) afterProject = /^project\s*:?\s/i.test(line);
    if (isRecipients || BOILERPLATE.some((re) => re.test(line))) continue;
    if (/profile picture\s*$/i.test(line)) break;
    kept.push(line);
  }
  const text = tidy(kept);
  return {
    comment: text.length > 1200 ? text.slice(0, 1200).trimEnd() + "…" : text,
    extracted: false,
    author,
    company,
  };
}

/** "Dana Whitfield (PWF)" -> "Dana Whitfield" */
export function cleanSenderName(displayName: string): string {
  return (displayName || "")
    .replace(/\s*\((pwf|proworkflow)\)\s*$/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}
