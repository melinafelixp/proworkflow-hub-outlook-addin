import type { RawMessage } from "../src/core/types";

/** Builds a notification body in the same plain-text shape Graph returns for a ProWorkflow email. */
export function pwfBody(opts: {
  author: string;
  company?: string;
  projectLine?: string;
  to?: string;
  comment: string;
  signature?: boolean;
}): string {
  const company = opts.company ?? "Sonova USA Inc.";
  const lines = [
    "----------------------------------------",
    "Write ABOVE THIS LINE to reply",
    "(Messages larger than 10 Mb WILL NOT BE uploaded)",
    "",
    company,
    "",
    "New message\tReceived at 10-08-2026 9:36 am",
    "",
  ];
  if (opts.projectLine) lines.push(`Project\t${opts.projectLine} <https://app.proworkflow.com/x/123>`);
  lines.push(`To\t${opts.to ?? "Alex Tran, Morgan Reyes"}`, "");
  lines.push(`${opts.author} from ${company} has sent you a message`, "", opts.comment, "");
  if (opts.signature !== false) {
    lines.push(`${opts.author} Profile Picture`, opts.author, "Account Marketing Specialist");
  }
  return lines.join("\r\n");
}

let counter = 0;
export function raw(partial: Partial<RawMessage> & { subject: string; bodyText: string }): RawMessage {
  counter += 1;
  return {
    id: `id-${counter}`,
    fromName: "Dana Whitfield (PWF)",
    fromAddress: "reply@notify.proworkflow.com",
    receivedDateTime: new Date(Date.UTC(2026, 9, 8, 14, counter % 60)).toISOString(),
    isRead: false,
    hasAttachments: false,
    ...partial,
  };
}

export const EXAMPLE_SUBJECT = "IC MS-156727 - Google Analytics Access Check - PH- KOS/DANCHAK AUDIOLOGY, 20016174";
export const EXAMPLE_PROJECT_LINE =
  "IC MS-156727 - Phonak \\ MS-156727 \\ KOS/DANCHAK AUDIOLOGY, 20016174 \\ Omnichannel Marketing SEPT 2026";
