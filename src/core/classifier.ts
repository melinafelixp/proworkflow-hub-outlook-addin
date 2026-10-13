import type { Category, Classification } from "./types";

/**
 * Message classification.
 *
 * `Classifier` is the seam for a future AI classifier: anything that turns comment text into a
 * Classification can be dropped in. The rule-based version below runs entirely in the browser,
 * so no client email content leaves the mailbox.
 *
 * The rules lean toward "action" and "review" on purpose. Calling a real request an
 * acknowledgment is the expensive mistake; the reverse only costs a glance.
 */
export interface Classifier {
  classify(comment: string): Classification;
}

/** Polite phrases that contain "please" but ask for nothing. Removed before looking for requests. */
const COURTESY =
  /\bplease\s+(let\s+(me|us)\s+know|feel\s+free|reach\s+out|don'?t\s+hesitate|do\s+not\s+hesitate)\b[^.!?\n]*/gi;
/** "We have everything we need" states that nothing is needed. */
const NOTHING_NEEDED = /\b(everything|all|what)\s+(that\s+)?(we|i|you|they)\s+need(ed)?\b/gi;
/** Approval phrasing that contains "please". Removed before looking for requests. */
const APPROVAL_PLEASE = /\bplease\s+(proceed|go\s+ahead|move\s+forward)\b/gi;

const NEGATED_APPROVAL =
  /\b(not|isn'?t|aren'?t|can'?t|cannot|don'?t|do\s+not|never)\s+(yet\s+)?(approved?|approving|good\s+to\s+go|ready|proceed|go\s+ahead)\b|\bhold\s+off\b|\bon\s+hold\b/i;

const REQUEST: RegExp[] = [
  /\b(please|pls|kindly)\b/i,
  /\b(can|could|would|will)\s+(you|we|someone|somebody|the\s+team|y'?all)\b/i,
  /\b(need|needs|needed|want|wants|would\s+like|we'?d\s+like|i'?d\s+like)\s+(to|a|an|the|you|some|new|different|another|this|that|it)\b/i,
  /\b(should|must|has\s+to|have\s+to|needs\s+to)\s+(be|say|read|show|match|include|reflect)\b/i,
  /\binstead\s+of\b/i,
  /\b(is|are|looks)\s+(wrong|incorrect|outdated|missing|off)\b/i,
  /\b(typo|misspell(ed|ing)?|wrong\s+(phone|number|address|date|logo|image|offer|price))\b/i,
];
const CHANGE_VERB =
  /\b(change|update|revise|replace|remove|swap|correct|fix|edit|adjust|rework|redo|add|move|resend|re-send|reschedule|cancel|pause)\b/i;

const APPROVAL: { re: RegExp; strong: boolean }[] = [
  { re: /\bapproved?\b/i, strong: true },
  { re: /\bgood\s+to\s+go\b/i, strong: true },
  { re: /\b(proceed|go\s+ahead|move\s+forward)\b/i, strong: true },
  { re: /\bsign(ed|ing)?\s+off\b/i, strong: true },
  { re: /\bgreen\s?light\b/i, strong: false },
  { re: /\bready\s+to\s+(launch|deploy|send|print|mail|go|run)\b/i, strong: false },
];

const UPDATE: { re: RegExp; strong: boolean }[] = [
  {
    re: /\b(has|have)\s+been\s+(uploaded|sent|scheduled|deployed|launched|updated|submitted|completed|posted|attached|delivered|mailed|shared|added)\b/i,
    strong: true,
  },
  { re: /\bis\s+(now\s+)?(scheduled|available|live|attached|complete|completed|uploaded)\b/i, strong: true },
  { re: /\b(uploaded|attached|scheduled|deployed|launched|submitted)\b/i, strong: false },
  { re: /\b(fyi|heads\s+up|for\s+your\s+records)\b/i, strong: false },
];

const ACK =
  /\b(thank\s+you|thanks|thx|ty|perfect|great|awesome|wonderful|excellent|fantastic|sounds\s+good|got\s+it|noted|will\s+do|ok|okay|looks\s+good|looks\s+great|appreciate|appreciated|love\s+it)\b/i;

function result(category: Category, confidence: Classification["confidence"], reason: string): Classification {
  return { category, confidence, source: "rule", reason };
}

export const ruleClassifier: Classifier = {
  classify(commentRaw: string): Classification {
    const comment = (commentRaw || "").trim();
    if (!comment) return result("review", "low", "No comment text was found in this notification.");

    const words = comment.split(/\s+/).length;
    const stripped = comment.replace(COURTESY, " ").replace(NOTHING_NEEDED, " ").replace(APPROVAL_PLEASE, " $1 ");

    const approval = APPROVAL.filter((a) => a.re.test(comment));
    const hasApproval = approval.length > 0;
    const hasQuestion = /\?/.test(comment);
    const hasRequest = REQUEST.some((re) => re.test(stripped));
    const hasChangeVerb = CHANGE_VERB.test(stripped);

    if (NEGATED_APPROVAL.test(comment)) {
      return result("action", "medium", "The client says this is not approved or should wait.");
    }
    if (hasRequest || hasQuestion || (hasChangeVerb && !hasApproval)) {
      if (hasApproval) {
        return result("action", "medium", "Mentions approval but also asks for something.");
      }
      if (hasRequest && hasChangeVerb) return result("action", "high", "Asks for a change.");
      if (hasRequest) return result("action", "high", "Contains a request.");
      if (hasQuestion) return result("action", "medium", "Contains a question.");
      return result("action", "medium", "Mentions a change.");
    }
    if (hasApproval) {
      const strong = approval.some((a) => a.strong);
      return result("approval", strong ? "high" : "medium", "Approval wording with no request attached.");
    }
    const update = UPDATE.filter((u) => u.re.test(comment));
    if (update.length > 0) {
      return result("update", update.some((u) => u.strong) ? "high" : "medium", "Reports that something was done.");
    }
    if (ACK.test(comment)) {
      if (words <= 12) return result("acknowledgment", "high", "Short thank-you or confirmation.");
      if (words <= 30) return result("acknowledgment", "medium", "Reads like a thank-you with no request.");
    }
    return result("review", "low", "No clear request, approval or acknowledgment wording.");
  },
};

export const CATEGORY_LABELS: Record<Category, string> = {
  action: "Action required",
  approval: "Approval",
  acknowledgment: "Acknowledgment",
  update: "Update",
  review: "Needs review",
};
