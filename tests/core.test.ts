import { describe, expect, it } from "vitest";
import { ruleClassifier } from "../src/core/classifier";
import { cleanSenderName, extractComment } from "../src/core/extract";
import { buildCampaigns, campaignKey, EMPTY_STATE, groupByClient, overview, searchCampaigns } from "../src/core/grouping";
import { displayClientName, parseMessage, parseSubject } from "../src/core/parser";
import { toHubMessage } from "../src/core/pipeline";
import { DEFAULT_SETTINGS, isProWorkflowSender, validatePattern } from "../src/core/settings";
import type { UserState } from "../src/core/types";
import { EXAMPLE_PROJECT_LINE, EXAMPLE_SUBJECT, pwfBody, raw } from "./fixtures";

const S = DEFAULT_SETTINGS;

describe("sender identification", () => {
  it("accepts the approved address regardless of case or display name", () => {
    expect(isProWorkflowSender("Reply@Notify.ProWorkflow.com", S)).toBe(true);
  });
  it("rejects look-alike senders", () => {
    expect(isProWorkflowSender("reply@notify.proworkflow.com.evil.io", S)).toBe(false);
    expect(isProWorkflowSender("kristin.sherman@sonova.com", S)).toBe(false);
    expect(isProWorkflowSender("", S)).toBe(false);
  });
  it("supports configured domains including subdomains", () => {
    const s = { ...S, senderDomains: ["proworkflow.com"] };
    expect(isProWorkflowSender("alerts@mail.proworkflow.com", s)).toBe(true);
    expect(isProWorkflowSender("alerts@notproworkflow.com", s)).toBe(false);
  });
});

describe("subject parsing", () => {
  it("parses the real example subject", () => {
    const p = parseSubject(EXAMPLE_SUBJECT, S);
    expect(p.projectIds).toEqual(["MS-156727"]);
    expect(p.clientCodes).toEqual(["20016174"]);
    expect(p.clientName).toBe("KOS/DANCHAK AUDIOLOGY");
    expect(p.brand).toBe("PH");
    expect(p.taskName).toBe("Google Analytics Access Check");
  });
  it("handles subjects without the IC prefix and with reply prefixes", () => {
    const p = parseSubject("RE: MS-156789 - Patient Mailer Proof - UN- RIVERBEND ENT & HEARING, 2001309", S);
    expect(p.projectIds).toEqual(["MS-156789"]);
    expect(p.clientCodes).toEqual(["2001309"]);
    expect(p.clientName).toBe("RIVERBEND ENT & HEARING");
    expect(p.taskName).toBe("Patient Mailer Proof");
  });
  it("does not assume an eight digit client code", () => {
    expect(parseSubject("IC MS-100001 - Proof - PH- A CLINIC, 123456", S).clientCodes).toEqual(["123456"]);
    expect(parseSubject("IC MS-100001 - Proof - PH- A CLINIC, 1234567890", S).clientCodes).toEqual(["1234567890"]);
  });
  it("honours custom patterns from settings", () => {
    const s = { ...S, projectIdPattern: "\\bJOB\\d{3}\\b", clientCodePattern: "#(C\\d+)" };
    const p = parseSubject("JOB481 - Fall Flyer - Maple Hearing #C77", s);
    expect(p.projectIds).toEqual(["JOB481"]);
    expect(p.clientCodes).toEqual(["C77"]);
  });
  it("survives an invalid pattern", () => {
    const p = parseSubject(EXAMPLE_SUBJECT, { ...S, projectIdPattern: "([" });
    expect(p.projectIds).toEqual([]);
  });
  it("title-cases all-caps names but keeps known acronyms", () => {
    expect(displayClientName("KOS/DANCHAK AUDIOLOGY")).toBe("Kos/Danchak Audiology");
    expect(displayClientName("RIVERBEND ENT & HEARING, PC")).toBe("Riverbend ENT & Hearing, PC");
    expect(displayClientName("McAllister Hearing")).toBe("McAllister Hearing");
  });
});

describe("message parsing", () => {
  it("uses the body project line for the campaign name", () => {
    const body = pwfBody({ author: "Dana Whitfield", projectLine: EXAMPLE_PROJECT_LINE, comment: "Thanks!" });
    const r = parseMessage(EXAMPLE_SUBJECT, body, S);
    expect(r).toMatchObject({
      projectId: "MS-156727",
      clientCode: "20016174",
      clientName: "Kos/Danchak Audiology",
      campaignName: "Omnichannel Marketing SEPT 2026",
      campaignNameSource: "project-line",
      taskName: "Google Analytics Access Check",
      confident: true,
      issues: [],
    });
  });
  it("reads a project value that sits on the line after the label", () => {
    const body = `Project\r\n\r\n${EXAMPLE_PROJECT_LINE}\r\nTo\r\nA, B\r\n`;
    expect(parseMessage(EXAMPLE_SUBJECT, body, S).campaignName).toBe("Omnichannel Marketing SEPT 2026");
  });
  it("falls back to the subject when the body has no project line", () => {
    const r = parseMessage(EXAMPLE_SUBJECT, "just a comment", S);
    expect(r.confident).toBe(true);
    expect(r.campaignNameSource).toBe("subject");
    expect(r.campaignName).toBe("Google Analytics Access Check");
  });
  it("prefers the body project ID when the subject names a different (task) ID", () => {
    const r = parseMessage("IC MS-999001 - Proof - PH- KOS/DANCHAK AUDIOLOGY, 20016174", `Project ${EXAMPLE_PROJECT_LINE}`, S);
    expect(r.projectId).toBe("MS-156727");
    expect(r.confident).toBe(true);
  });
  it("flags a missing client code", () => {
    const r = parseMessage("MS-163511 - Billing question", "", S);
    expect(r.confident).toBe(false);
    expect(r.issues).toContain("no-client-code");
    expect(r.projectId).toBe("MS-163511");
  });
  it("flags a missing project ID", () => {
    const r = parseMessage("Proof ready - PH- KOS/DANCHAK AUDIOLOGY, 20016174", "", S);
    expect(r.confident).toBe(false);
    expect(r.issues).toEqual(["no-project-id"]);
    expect(r.clientCode).toBe("20016174");
  });
  it("flags multiple project IDs instead of picking one", () => {
    const r = parseMessage("IC MS-161204 / MS-162310 - Combined proof - PH- A CLINIC, 20014827", "", S);
    expect(r.confident).toBe(false);
    expect(r.issues).toContain("multiple-project-ids");
    expect(r.projectId).toBeUndefined();
  });
  it("flags a client mismatch between subject and body", () => {
    const body = "Project IC MS-156727 - Phonak \\ MS-156727 \\ OTHER CLINIC, 20099999 \\ Email OCT 2026";
    const r = parseMessage(EXAMPLE_SUBJECT, body, S);
    expect(r.confident).toBe(false);
    expect(r.issues).toContain("subject-body-client-mismatch");
  });
  it("flags unfamiliar formats", () => {
    const r = parseMessage("ProWorkflow: You have been added to a project", "Welcome", S);
    expect(r.issues).toContain("unrecognized-format");
    expect(r.confident).toBe(false);
  });
});

describe("comment extraction", () => {
  it("returns only the comment from the notification template", () => {
    const body = pwfBody({
      author: "Dana Whitfield",
      projectLine: EXAMPLE_PROJECT_LINE,
      comment: "Wonderful news, thank you so much Chloe!",
    });
    const e = extractComment(body, S);
    expect(e.extracted).toBe(true);
    expect(e.comment).toBe("Wonderful news, thank you so much Chloe!");
    expect(e.author).toBe("Dana Whitfield");
    expect(e.company).toBe("Sonova USA Inc.");
  });
  it("keeps multi-paragraph comments and stops at the signature", () => {
    const body = pwfBody({ author: "Marcus Bell", comment: "First point.\r\n\r\nSecond point.\r\nThird line." });
    expect(extractComment(body, S).comment).toBe("First point.\n\nSecond point.\nThird line.");
  });
  it("does not treat quoted reply text as part of the comment", () => {
    const comment = "Approved.\r\n\r\nOn Tue, Oct 6, 2026 at 3:02 PM Morgan Reyes wrote:\r\n> Please confirm the proof.";
    expect(extractComment(pwfBody({ author: "Priya Nair", comment }), S).comment).toBe("Approved.");
  });
  it("stops at the signature when there is no profile picture line", () => {
    const body = "Dana Lee from Acme has sent you a message\n\nLooks good\n\nDana Lee\nMarketing Lead";
    expect(extractComment(body, S).comment).toBe("Looks good");
  });
  it("falls back without losing text when the template is unfamiliar", () => {
    const e = extractComment("You have been added to the project.\nTo get started, open ProWorkflow.", S);
    expect(e.extracted).toBe(false);
    expect(e.comment).toContain("You have been added to the project.");
    expect(e.comment).toContain("To get started, open ProWorkflow.");
  });
  it("strips the (PWF) suffix from sender names", () => {
    expect(cleanSenderName("Dana Whitfield (PWF)")).toBe("Dana Whitfield");
    expect(cleanSenderName("Marcus Bell")).toBe("Marcus Bell");
  });
});

describe("rule-based classification", () => {
  const c = (t: string) => ruleClassifier.classify(t).category;
  it.each([
    "Please update the headline.",
    "Can you change the phone number?",
    "We need a different image.",
    "Please revise the offer.",
    "Can we update the headline to reflect the October promotion?",
    "The phone number is wrong on the back panel.",
  ])("action: %s", (t) => expect(c(t)).toBe("action"));
  it.each(["Approved.", "This looks great, please proceed.", "We are good to go."])("approval: %s", (t) =>
    expect(c(t)).toBe("approval")
  );
  it.each(["Thank you!", "Thanks.", "Perfect!", "Sounds good.", "Looks good", "Wonderful news, thank you so much Chloe!"])(
    "acknowledgment: %s",
    (t) => expect(c(t)).toBe("acknowledgment")
  );
  it.each(["The creative has been uploaded.", "The campaign is scheduled.", "The revised proof is available."])(
    "update: %s",
    (t) => expect(c(t)).toBe("update")
  );
  it("does not read an approval with a request attached as an approval", () => {
    expect(c("Approved, but please change the phone number first.")).toBe("action");
    expect(c("This is not approved yet.")).toBe("action");
  });
  it("does not read courtesy phrases as requests", () => {
    expect(c("Thanks! Please let me know if you need anything else.")).toBe("acknowledgment");
    expect(c("Thanks Dana, we have everything we need to start on creative.")).toBe("acknowledgment");
  });
  it("sends unclear text to needs review with low confidence", () => {
    const r = ruleClassifier.classify("Our office will be closed the week of the 23rd.");
    expect(r.category).toBe("review");
    expect(r.confidence).toBe("low");
    expect(ruleClassifier.classify("").category).toBe("review");
  });
});

describe("grouping and status", () => {
  const make = (subject: string, projectLine: string | undefined, comment: string, extra = {}) =>
    toHubMessage(
      raw({ subject, bodyText: pwfBody({ author: "Dana Whitfield", projectLine, comment }), ...extra }),
      S,
      { selfName: "Morgan Reyes" }
    );
  const lineFor = (ms: string, client: string, name: string) => `IC ${ms} - Phonak \\ ${ms} \\ ${client} \\ ${name}`;
  const KD = "KOS/DANCHAK AUDIOLOGY, 20016174";

  const sept = [
    make(EXAMPLE_SUBJECT, lineFor("MS-156727", KD, "Omnichannel Marketing SEPT 2026"), "Please update the headline."),
    make(
      "IC MS-156727 - Creative Proof - PH- KOS/DANCHAK AUDIOLOGY, 20016174",
      lineFor("MS-156727", KD, "Omnichannel Marketing SEPT 2026"),
      "Thank you!"
    ),
  ];
  const oct = [
    make(
      "IC MS-157001 - Email Proof - PH- KOS/DANCHAK AUDIOLOGY, 20016174",
      lineFor("MS-157001", KD, "Email Campaign OCT 2026"),
      "Approved.",
      { isRead: true }
    ),
  ];
  const other = [
    make(
      "IC MS-157349 - Email Proof - PH- ADVANCED HEARING CARE, 20019350",
      lineFor("MS-157349", "ADVANCED HEARING CARE, 20019350", "Email Campaign OCT 2026"),
      "Thanks."
    ),
  ];
  const loose = [make("MS-163511 - Billing question", undefined, "Who do I send this to?")];
  const all = [...sept, ...oct, ...other, ...loose];

  it("groups by client code then project ID", () => {
    const { campaigns, uncategorized } = buildCampaigns(all, EMPTY_STATE);
    expect(campaigns.map((c) => c.key).sort()).toEqual(
      ["20016174::MS-156727", "20016174::MS-157001", "20019350::MS-157349"].sort()
    );
    expect(uncategorized.map((m) => m.subject)).toEqual(["MS-163511 - Billing question"]);
    const groups = groupByClient(campaigns);
    const kd = groups.find((g) => g.clientCode === "20016174");
    expect(kd?.clientName).toBe("Kos/Danchak Audiology");
    expect(kd?.campaigns.map((c) => c.name).sort()).toEqual(["Email Campaign OCT 2026", "Omnichannel Marketing SEPT 2026"]);
  });

  it("keeps same-named campaigns of different clients apart", () => {
    const { campaigns } = buildCampaigns(all, EMPTY_STATE);
    const octs = campaigns.filter((c) => c.name === "Email Campaign OCT 2026");
    expect(octs).toHaveLength(2);
    expect(new Set(octs.map((c) => c.clientCode)).size).toBe(2);
  });

  it("never shows the same Outlook message twice", () => {
    const { campaigns } = buildCampaigns([...all, sept[0]], EMPTY_STATE);
    expect(campaigns.find((c) => c.projectId === "MS-156727")?.total).toBe(2);
  });

  it("derives status from actions, unread and review state", () => {
    const { campaigns } = buildCampaigns(all, EMPTY_STATE);
    const byId = Object.fromEntries(campaigns.map((c) => [c.projectId, c]));
    expect(byId["MS-156727"].status).toBe("attention");
    expect(byId["MS-156727"].openActions).toBe(1);
    expect(byId["MS-157349"].status).toBe("new");
    expect(byId["MS-157001"].status).toBe("uptodate");
    expect(overview(campaigns)).toMatchObject({ attention: 1, new: 1, uptodate: 1, review: 0, total: 3 });
  });

  it("keeps an action item open after the emails are read, until it is resolved", () => {
    const read = sept.map((m) => ({ ...m, isRead: true }));
    const key = campaignKey("20016174", "MS-156727");
    expect(buildCampaigns(read, EMPTY_STATE).campaigns[0].status).toBe("attention");
    const resolved: UserState = { ...EMPTY_STATE, campaigns: { [key]: { resolved: [sept[0].id] } } };
    expect(buildCampaigns(read, resolved).campaigns[0].status).toBe("uptodate");
  });

  it("drops a manual status when a newer message arrives", () => {
    const key = campaignKey("20016174", "MS-156727");
    const at = "2026-10-08T23:00:00.000Z";
    const state: UserState = { ...EMPTY_STATE, campaigns: { [key]: { manualStatus: "uptodate", manualStatusAt: at } } };
    expect(buildCampaigns(sept, state).campaigns[0].status).toBe("uptodate");
    const later = { ...sept[1], id: "later", receivedAt: "2026-10-09T10:00:00.000Z" };
    expect(buildCampaigns([...sept, later], state).campaigns[0].status).toBe("attention");
  });

  it("honours manual grouping and classification corrections", () => {
    const key = campaignKey("20016174", "MS-156727");
    const state: UserState = {
      campaigns: {},
      assignments: { [loose[0].id]: key },
      categoryOverrides: { [sept[0].id]: "acknowledgment" },
    };
    const { campaigns, uncategorized } = buildCampaigns(all, state);
    const c = campaigns.find((x) => x.key === key)!;
    expect(uncategorized).toHaveLength(0);
    expect(c.total).toBe(3);
    expect(c.messages.find((m) => m.id === sept[0].id)?.classification.source).toBe("user");
  });

  it("ignores the user's own comments when counting action items", () => {
    const mine = toHubMessage(
      raw({
        subject: EXAMPLE_SUBJECT,
        fromName: "Morgan Reyes (PWF)",
        bodyText: pwfBody({ author: "Morgan Reyes", comment: "Can you confirm the offer dates?" }),
      }),
      S,
      { selfName: "Morgan Reyes" }
    );
    expect(mine.fromSelf).toBe(true);
    expect(buildCampaigns([mine], EMPTY_STATE).campaigns[0].openActions).toBe(0);
  });

  it("searches by code, project, client, campaign, sender and comment text", () => {
    const { campaigns } = buildCampaigns(all, EMPTY_STATE);
    expect(searchCampaigns(campaigns, "20016174")).toHaveLength(2);
    expect(searchCampaigns(campaigns, "ms-156727").map((c) => c.projectId)).toEqual(["MS-156727"]);
    expect(searchCampaigns(campaigns, "advanced hearing")).toHaveLength(1);
    expect(searchCampaigns(campaigns, "dana")).toHaveLength(3);
    expect(searchCampaigns(campaigns, "headline")).toHaveLength(1);
    expect(searchCampaigns(campaigns, "google analytics")).toHaveLength(1);
    expect(searchCampaigns(campaigns, "zzz")).toHaveLength(0);
  });

  it("handles a 40+ message campaign", () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      make(EXAMPLE_SUBJECT, lineFor("MS-156727", KD, "Omnichannel Marketing SEPT 2026"), i % 3 ? "Thanks!" : "Sounds good.")
    );
    const { campaigns } = buildCampaigns(many, EMPTY_STATE);
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].total).toBe(45);
    expect(campaigns[0].unread).toBe(45);
    expect(campaigns[0].status).toBe("new");
  });
});

describe("settings validation", () => {
  it("rejects invalid or group-less patterns", () => {
    expect(validatePattern("([", false)).toMatch(/not a valid/);
    expect(validatePattern(",\\s*\\d+", true)).toMatch(/parentheses/);
    expect(validatePattern(",\\s*(\\d+)", true)).toBeNull();
  });
});
