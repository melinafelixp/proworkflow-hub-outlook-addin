import type { RawMessage } from "../core/types";

/**
 * Sample ProWorkflow notifications for the preview and for tests.
 *
 * Every clinic, person, code and comment here is invented. The subject and body layout copies
 * the real notification format, so the sample data goes through exactly the same parsing,
 * extraction and classification code as real mail.
 */

export const MOCK_SELF = { displayName: "Morgan Reyes", address: "morgan.reyes@example.com" };
export const MOCK_SENDER = "reply@notify.proworkflow.com";
const COMPANY = "Northwind Hearing Group";
const TEAMMATE = "Alex Tran";

interface Line {
  /** Who wrote the comment. "me" is the signed-in user. */
  by: string;
  text: string;
  task?: string;
  attach?: boolean;
}

interface CampaignSeed {
  ms: string;
  name: string;
  /** Hours before "now" of the newest message. */
  newestHoursAgo: number;
  /** Average hours between messages. */
  spacingHours: number;
  /** How many of the newest messages are unread. */
  unread: number;
  lines: Line[];
}

interface ClientSeed {
  code: string;
  name: string;
  brand: "PH" | "UN";
  brandName: string;
  campaigns: CampaignSeed[];
}

const DANA = "Dana Whitfield";
const MARCUS = "Marcus Bell";
const PRIYA = "Priya Nair";

/** A long, realistic thread: requests, updates and plenty of thank-yous. 42 messages. */
const LONG_THREAD: Line[] = [
  { by: DANA, text: "Kicking off the September omnichannel campaign. The intake form is attached.", task: "Campaign Kickoff", attach: true },
  { by: "me", text: "Thanks Dana, we have everything we need to start on creative.", task: "Campaign Kickoff" },
  { by: DANA, text: "Perfect!", task: "Campaign Kickoff" },
  { by: "me", text: "The first email proof has been uploaded for review.", task: "Email Creative Proof", attach: true },
  { by: DANA, text: "Can we update the headline to reflect the fall promotion?", task: "Email Creative Proof" },
  { by: "me", text: "The updated creative has been uploaded for review.", task: "Email Creative Proof", attach: true },
  { by: DANA, text: "Looks good", task: "Email Creative Proof" },
  { by: MARCUS, text: "Thank you!", task: "Email Creative Proof" },
  { by: DANA, text: "Approved.", task: "Email Creative Proof" },
  { by: "me", text: "The email is scheduled for Tuesday at 9:00 AM.", task: "Email Deployment" },
  { by: DANA, text: "Sounds good.", task: "Email Deployment" },
  { by: MARCUS, text: "Could you send over the seed list before it goes out?", task: "Email Deployment" },
  { by: "me", text: "The seed list has been attached.", task: "Email Deployment", attach: true },
  { by: MARCUS, text: "Got it, thanks.", task: "Email Deployment" },
  { by: "me", text: "The direct mail proof has been uploaded.", task: "Direct Mail Proof", attach: true },
  { by: DANA, text: "Please change the phone number on the back panel to the main office line.", task: "Direct Mail Proof" },
  { by: "me", text: "The revised proof has been uploaded with the main office number.", task: "Direct Mail Proof", attach: true },
  { by: DANA, text: "Thanks!", task: "Direct Mail Proof" },
  { by: DANA, text: "This looks great, please proceed.", task: "Direct Mail Proof" },
  { by: MARCUS, text: "Thank you so much.", task: "Direct Mail Proof" },
  { by: "me", text: "The mail file has been submitted to the printer.", task: "Direct Mail Proof" },
  { by: DANA, text: "Wonderful, thank you.", task: "Direct Mail Proof" },
  { by: PRIYA, text: "Checking whether we still have Google Analytics access for this location.", task: "Google Analytics Access Check" },
  { by: "me", text: "Access has been confirmed on our side as of this morning.", task: "Google Analytics Access Check" },
  { by: PRIYA, text: "Wonderful news, thank you so much Morgan!", task: "Google Analytics Access Check" },
  { by: DANA, text: "Thanks.", task: "Google Analytics Access Check" },
  { by: "me", text: "The CTV spot has been uploaded for review.", task: "CTV Creative Proof", attach: true },
  { by: MARCUS, text: "Perfect!", task: "CTV Creative Proof" },
  { by: DANA, text: "Our front office will be closed the week of the 23rd.", task: "CTV Creative Proof" },
  { by: DANA, text: "Thank you!", task: "CTV Creative Proof" },
  // The unread tail starts here.
  { by: DANA, text: "We need a different image for the CTV end card. The current one shows our old storefront.", task: "CTV Creative Proof" },
  { by: MARCUS, text: "Thanks!", task: "CTV Creative Proof" },
  { by: PRIYA, text: "Sounds good.", task: "Google Analytics Access Check" },
  { by: DANA, text: "Please revise the offer to $500 off a pair instead of $400.", task: "Email Creative Proof" },
  { by: MARCUS, text: "Thank you.", task: "Email Creative Proof" },
  { by: DANA, text: "Great, thanks!", task: "Email Creative Proof" },
  { by: PRIYA, text: "Perfect, thanks.", task: "Google Analytics Access Check" },
  { by: MARCUS, text: "Can you confirm the in-home date for the second mail drop?", task: "Direct Mail Proof" },
  { by: DANA, text: "Thanks again.", task: "Direct Mail Proof" },
  { by: MARCUS, text: "Looks good", task: "Direct Mail Proof" },
  { by: DANA, text: "Thank you so much!", task: "CTV Creative Proof" },
  { by: PRIYA, text: "Wonderful news, thank you!", task: "Google Analytics Access Check" },
];

const CLIENTS: ClientSeed[] = [
  {
    code: "20014827",
    name: "LAKEVIEW/HARTWELL AUDIOLOGY",
    brand: "PH",
    brandName: "Phonak",
    campaigns: [
      { ms: "MS-161204", name: "Omnichannel Marketing SEPT 2026", newestHoursAgo: 4, spacingHours: 9, unread: 12, lines: LONG_THREAD },
      {
        ms: "MS-162310",
        name: "Email Campaign OCT 2026",
        newestHoursAgo: 52,
        spacingHours: 20,
        unread: 0,
        lines: [
          { by: "me", text: "The October email proof has been uploaded.", task: "Email Creative Proof", attach: true },
          { by: DANA, text: "Looks good", task: "Email Creative Proof" },
          { by: DANA, text: "Approved.", task: "Email Creative Proof" },
          { by: "me", text: "The email is scheduled for October 14.", task: "Email Deployment" },
          { by: DANA, text: "Thank you!", task: "Email Deployment" },
          { by: MARCUS, text: "Thanks.", task: "Email Deployment" },
        ],
      },
      {
        ms: "MS-163055",
        name: "CTV Campaign NOV 2026",
        newestHoursAgo: 27,
        spacingHours: 6,
        unread: 2,
        lines: [
          { by: DANA, text: "Kicking off November CTV. Same audience as September.", task: "Campaign Kickoff" },
          { by: "me", text: "Thanks Dana. The storyboard has been uploaded.", task: "CTV Creative Proof", attach: true },
          { by: DANA, text: "Perfect!", task: "CTV Creative Proof" },
          { by: MARCUS, text: "Thank you!", task: "CTV Creative Proof" },
        ],
      },
    ],
  },
  {
    code: "20019350",
    name: "ADVANCED HEARING CARE",
    brand: "PH",
    brandName: "Phonak",
    campaigns: [
      {
        ms: "MS-162118",
        name: "Email Campaign OCT 2026",
        newestHoursAgo: 26,
        spacingHours: 7,
        unread: 3,
        lines: [
          { by: PRIYA, text: "Starting the October email for Advanced Hearing Care. Intake is attached.", task: "Campaign Kickoff", attach: true },
          { by: "me", text: "Thanks Priya, we're on it.", task: "Campaign Kickoff" },
          { by: PRIYA, text: "Thank you!", task: "Campaign Kickoff" },
          { by: "me", text: "The first proof has been uploaded.", task: "Email Creative Proof", attach: true },
          { by: PRIYA, text: "Could you swap the hero photo for the one of Dr. Okafor?", task: "Email Creative Proof" },
          { by: "me", text: "The proof has been updated with the new hero photo.", task: "Email Creative Proof", attach: true },
          { by: PRIYA, text: "Perfect!", task: "Email Creative Proof" },
          { by: MARCUS, text: "Thanks.", task: "Email Creative Proof" },
          { by: PRIYA, text: "Looks good", task: "Email Creative Proof" },
          { by: "me", text: "The subject line options have been uploaded.", task: "Email Creative Proof" },
          { by: PRIYA, text: "Sounds good.", task: "Email Creative Proof" },
          { by: MARCUS, text: "Thank you.", task: "Email Creative Proof" },
          { by: "me", text: "The suppression list has been uploaded.", task: "Email Deployment", attach: true },
          { by: PRIYA, text: "Got it, thanks.", task: "Email Deployment" },
          { by: MARCUS, text: "Great, thank you!", task: "Email Deployment" },
          { by: PRIYA, text: "The address in the footer is wrong. Please update it to 418 Marlow Street.", task: "Email Creative Proof" },
          { by: MARCUS, text: "Thanks!", task: "Email Creative Proof" },
          { by: PRIYA, text: "Thank you.", task: "Email Creative Proof" },
        ],
      },
    ],
  },
  {
    code: "20011276",
    name: "HEARING SOLUTIONS OF CEDAR FALLS",
    brand: "UN",
    brandName: "Unitron",
    campaigns: [
      {
        ms: "MS-163402",
        name: "CTV Campaign NOV 2026",
        newestHoursAgo: 29,
        spacingHours: 5,
        unread: 4,
        lines: [
          { by: MARCUS, text: "Kicking off November CTV for Cedar Falls.", task: "Campaign Kickoff" },
          { by: "me", text: "Thanks Marcus. Targeting has been submitted.", task: "Campaign Kickoff" },
          { by: MARCUS, text: "Thank you!", task: "Campaign Kickoff" },
          { by: "me", text: "The 15-second spot has been uploaded.", task: "CTV Creative Proof", attach: true },
          { by: MARCUS, text: "Looks great", task: "CTV Creative Proof" },
          { by: MARCUS, text: "Approved.", task: "CTV Creative Proof" },
          { by: "me", text: "The campaign is scheduled to start November 2.", task: "CTV Launch" },
          { by: MARCUS, text: "Perfect!", task: "CTV Launch" },
          { by: MARCUS, text: "Thanks.", task: "CTV Launch" },
          { by: PRIYA, text: "Sounds good.", task: "CTV Launch" },
          { by: MARCUS, text: "Thank you so much!", task: "CTV Launch" },
          { by: PRIYA, text: "We are good to go.", task: "CTV Launch" },
        ],
      },
    ],
  },
  {
    code: "20013098",
    name: "RIVERBEND ENT & HEARING",
    brand: "UN",
    brandName: "Unitron",
    campaigns: [
      {
        ms: "MS-163240",
        name: "Open House Event NOV 2026",
        newestHoursAgo: 6,
        spacingHours: 8,
        unread: 2,
        lines: [
          { by: PRIYA, text: "Starting the open house mailer. Details are attached.", task: "Campaign Kickoff", attach: true },
          { by: "me", text: "Thanks Priya. The draft invitation has been uploaded.", task: "Invitation Proof", attach: true },
          { by: PRIYA, text: "Thank you!", task: "Invitation Proof" },
          { by: PRIYA, text: "Dr. Ellison is out through the 12th and the event room holds 40.", task: "Invitation Proof" },
          { by: MARCUS, text: "Thanks.", task: "Invitation Proof" },
        ],
      },
      {
        ms: "MS-161877",
        name: "Direct Mail OCT 2026",
        newestHoursAgo: 120,
        spacingHours: 14,
        unread: 0,
        lines: [
          { by: "me", text: "The October mailer proof has been uploaded.", task: "Direct Mail Proof", attach: true },
          { by: PRIYA, text: "Looks good", task: "Direct Mail Proof" },
          { by: PRIYA, text: "This looks great, please proceed.", task: "Direct Mail Proof" },
          { by: "me", text: "The mail file has been submitted to the printer.", task: "Direct Mail Proof" },
          { by: PRIYA, text: "Thank you!", task: "Direct Mail Proof" },
          { by: MARCUS, text: "Perfect!", task: "Direct Mail Proof" },
          { by: "me", text: "The mailer is scheduled to land October 6.", task: "Direct Mail Proof" },
          { by: PRIYA, text: "Sounds good.", task: "Direct Mail Proof" },
          { by: PRIYA, text: "Thanks.", task: "Direct Mail Proof" },
        ],
      },
    ],
  },
  {
    code: "20018823",
    name: "SOUND CHOICE HEARING CENTER",
    brand: "PH",
    brandName: "Phonak",
    campaigns: [
      {
        ms: "MS-162950",
        name: "Digital Ads OCT 2026",
        newestHoursAgo: 30,
        spacingHours: 3,
        unread: 7,
        lines: [
          { by: DANA, text: "Thank you!", task: "Ad Creative Proof" },
          { by: MARCUS, text: "Thanks.", task: "Ad Creative Proof" },
          { by: DANA, text: "Perfect!", task: "Ad Creative Proof" },
          { by: DANA, text: "Sounds good.", task: "Ad Creative Proof" },
          { by: MARCUS, text: "Great, thanks!", task: "Landing Page Review" },
          { by: DANA, text: "Looks good", task: "Landing Page Review" },
          { by: MARCUS, text: "Thank you so much.", task: "Landing Page Review" },
        ],
      },
    ],
  },
  {
    code: "20016641",
    name: "PREMIER AUDIOLOGY",
    brand: "PH",
    brandName: "Phonak",
    campaigns: [
      {
        ms: "MS-162087",
        name: "Email Campaign OCT 2026",
        newestHoursAgo: 75,
        spacingHours: 16,
        unread: 0,
        lines: [
          { by: "me", text: "The October email proof has been uploaded.", task: "Email Creative Proof", attach: true },
          { by: MARCUS, text: "Can you change the offer end date to October 31?", task: "Email Creative Proof" },
          { by: "me", text: "The proof has been updated with the new end date.", task: "Email Creative Proof", attach: true },
          { by: MARCUS, text: "Perfect!", task: "Email Creative Proof" },
          { by: MARCUS, text: "Approved.", task: "Email Creative Proof" },
          { by: "me", text: "The email is scheduled for October 12.", task: "Email Deployment" },
          { by: MARCUS, text: "Thank you!", task: "Email Deployment" },
          { by: DANA, text: "Thanks.", task: "Email Deployment" },
        ],
      },
    ],
  },
  {
    code: "20012204",
    name: "NORTHGATE HEARING ASSOCIATES, PC",
    brand: "UN",
    brandName: "Unitron",
    campaigns: [
      {
        ms: "MS-160415",
        name: "Omnichannel Marketing AUG 2026",
        newestHoursAgo: 24 * 31,
        spacingHours: 30,
        unread: 0,
        lines: [
          { by: PRIYA, text: "Kicking off August omnichannel for Northgate.", task: "Campaign Kickoff" },
          { by: "me", text: "Thanks Priya. The email proof has been uploaded.", task: "Email Creative Proof", attach: true },
          { by: PRIYA, text: "Please update the logo to the new version.", task: "Email Creative Proof" },
          { by: "me", text: "The proof has been updated with the new logo.", task: "Email Creative Proof", attach: true },
          { by: PRIYA, text: "Approved.", task: "Email Creative Proof" },
          { by: "me", text: "The email has been deployed.", task: "Email Deployment" },
          { by: PRIYA, text: "Thank you!", task: "Email Deployment" },
          { by: "me", text: "The August results report has been uploaded.", task: "Reporting", attach: true },
          { by: PRIYA, text: "Wonderful, thank you.", task: "Reporting" },
          { by: MARCUS, text: "Thanks.", task: "Reporting" },
        ],
      },
    ],
  },
];

const HOUR = 60 * 60 * 1000;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function notificationText(author: string, projectLine: string | undefined, comment: string): string {
  const lines = [
    "----------------------------------------",
    "Write ABOVE THIS LINE to reply",
    "(Messages larger than 10 Mb WILL NOT BE uploaded)",
    "",
    COMPANY,
    "",
    "New message",
    "",
  ];
  if (projectLine) lines.push(`Project\t${projectLine}`);
  lines.push(`To\t${TEAMMATE}, ${MOCK_SELF.displayName}`, "");
  lines.push(`${author} from ${COMPANY} has sent you a message`, "", comment, "");
  lines.push(`${author} Profile Picture`, author, "Account Marketing Specialist");
  return lines.join("\r\n");
}

/** The full notification as HTML, shown when the user expands "Show original". */
export function notificationHtml(author: string, projectLine: string | undefined, comment: string): string {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#333">
<p style="color:#999;text-align:center;border-top:1px dashed #bbb;padding-top:8px">Write ABOVE THIS LINE to reply<br>(Messages larger than 10 Mb WILL NOT BE uploaded)</p>
<div style="background:#5b77b5;color:#fff;padding:18px;border-radius:4px">${escapeHtml(COMPANY)}</div>
<h3 style="margin:18px 0 8px">New message</h3>
<table style="font-size:13px"><tr><td style="padding-right:12px;color:#666">Project</td><td><b>${escapeHtml(projectLine ?? "")}</b></td></tr>
<tr><td style="padding-right:12px;color:#666">To</td><td><b>${escapeHtml(TEAMMATE)}, ${escapeHtml(MOCK_SELF.displayName)}</b></td></tr></table>
<p>${escapeHtml(author)} from ${escapeHtml(COMPANY)} has sent you a message</p>
<p>${escapeHtml(comment)}</p>
<p style="border-top:1px solid #ddd;padding-top:8px"><b>${escapeHtml(author)}</b><br><span style="color:#888">Account Marketing Specialist</span></p>
</div>`;
}

export interface MockMessage extends RawMessage {
  html: string;
  lastModified: string;
  attachmentNames: string[];
}

function projectLine(client: ClientSeed, c: { ms: string; name: string }): string {
  return `IC ${c.ms} - ${client.brandName} \\ ${c.ms} \\ ${client.name}, ${client.code} \\ ${c.name}`;
}

function subjectFor(client: ClientSeed, ms: string, task: string): string {
  return `IC ${ms} - ${task} - ${client.brand}- ${client.name}, ${client.code}`;
}

function build(
  id: string,
  subject: string,
  author: string,
  line: string | undefined,
  comment: string,
  at: number,
  isRead: boolean,
  attach: boolean
): MockMessage {
  const iso = new Date(at).toISOString();
  return {
    id,
    internetMessageId: `<${id}@notify.proworkflow.com>`,
    subject,
    fromName: `${author} (PWF)`,
    fromAddress: MOCK_SENDER,
    receivedDateTime: iso,
    lastModified: iso,
    isRead,
    parentFolderId: "inbox",
    hasAttachments: attach,
    webLink: undefined,
    bodyText: notificationText(author, line, comment),
    html: notificationHtml(author, line, comment),
    attachmentNames: attach ? ["proof.pdf"] : [],
  };
}

/** Build the full sample mailbox, with timestamps relative to `now`. */
export function buildMockMailbox(now: Date = new Date()): MockMessage[] {
  const out: MockMessage[] = [];
  // Anchor "today" messages to mid-morning so the dashboard reads naturally at any time of day.
  const base = now.getTime();
  let n = 0;

  for (const client of CLIENTS) {
    for (const c of client.campaigns) {
      const line = projectLine(client, c);
      const count = c.lines.length;
      c.lines.forEach((l, i) => {
        const fromEnd = count - 1 - i;
        // Slightly uneven spacing so the timeline does not look generated.
        const jitter = ((i * 37) % 11) / 11;
        const at = base - (c.newestHoursAgo + fromEnd * c.spacingHours + jitter * c.spacingHours * 0.4) * HOUR;
        const author = l.by === "me" ? MOCK_SELF.displayName : l.by;
        n += 1;
        out.push(
          build(
            `mock-${String(n).padStart(4, "0")}`,
            subjectFor(client, c.ms, l.task ?? "General"),
            author,
            line,
            l.text,
            at,
            fromEnd >= c.unread,
            Boolean(l.attach)
          )
        );
      });
    }
  }

  // Messages that must NOT be grouped automatically.
  const loose: { subject: string; author: string; line?: string; text: string; hoursAgo: number }[] = [
    {
      subject: "MS-163511 - Billing question",
      author: MARCUS,
      text: "Who should invoices for the November work go to?",
      hoursAgo: 8,
    },
    {
      subject: "IC MS-161204 / MS-162310 - Combined proof review - PH- LAKEVIEW/HARTWELL AUDIOLOGY, 20014827",
      author: DANA,
      text: "Sending one note for both projects: the logo lockup needs to match on each piece.",
      hoursAgo: 31,
    },
    {
      subject: "ProWorkflow: You have been added to a project",
      author: PRIYA,
      text: "You now have access to the Q4 planning workspace.",
      hoursAgo: 50,
    },
  ];
  for (const l of loose) {
    n += 1;
    out.push(build(`mock-${String(n).padStart(4, "0")}`, l.subject, l.author, l.line, l.text, base - l.hoursAgo * HOUR, false, false));
  }

  return out.sort((a, b) => b.receivedDateTime.localeCompare(a.receivedDateTime));
}

/** New notifications the preview can drop in, to show what happens when mail arrives. */
export const INCOMING_SAMPLES: { clientIndex: number; campaignIndex: number; author: string; task: string; text: string }[] = [
  { clientIndex: 5, campaignIndex: 0, author: MARCUS, task: "Email Deployment", text: "Could you resend the final proof? I can't find the attachment." },
  { clientIndex: 2, campaignIndex: 0, author: PRIYA, task: "CTV Launch", text: "Thank you!" },
  { clientIndex: 3, campaignIndex: 1, author: PRIYA, task: "Direct Mail Proof", text: "Approved." },
  { clientIndex: 0, campaignIndex: 1, author: DANA, task: "Email Deployment", text: "Please add our Saturday hours to the footer." },
];

export function buildIncoming(sampleIndex: number, seq: number, now: Date = new Date()): MockMessage {
  const s = INCOMING_SAMPLES[sampleIndex % INCOMING_SAMPLES.length];
  const client = CLIENTS[s.clientIndex];
  const c = client.campaigns[s.campaignIndex];
  return build(
    `mock-new-${seq}`,
    subjectFor(client, c.ms, s.task),
    s.author,
    projectLine(client, c),
    s.text,
    now.getTime(),
    false,
    false
  );
}
