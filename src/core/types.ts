/**
 * Shared types for ProWorkflow Hub.
 *
 * Data flow:  RawMessage (from Graph or mock)  ->  HubMessage (parsed + classified)
 *             HubMessage[]  ->  Campaign[] grouped under Client[]
 */

/** A mail message as the mail provider returns it (a trimmed-down Graph `message`). */
export interface RawMessage {
  /** Microsoft Graph immutable message ID. Stays the same when the message moves folders. */
  id: string;
  internetMessageId?: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  /** ISO 8601 UTC. */
  receivedDateTime: string;
  isRead: boolean;
  parentFolderId?: string;
  hasAttachments: boolean;
  webLink?: string;
  /** Plain-text body of the notification. Used once for extraction, never persisted. */
  bodyText: string;
}

export type ParseIssue =
  | "no-client-code"
  | "no-project-id"
  | "multiple-client-codes"
  | "multiple-project-ids"
  | "subject-body-client-mismatch"
  | "unrecognized-format";

export interface ParseResult {
  projectId?: string;
  clientCode?: string;
  clientName?: string;
  /** Name of the ProWorkflow project, e.g. "Omnichannel Marketing SEPT 2026". */
  campaignName?: string;
  /** Task or topic named in the subject, e.g. "Google Analytics Access Check". */
  taskName?: string;
  /** Brand prefix found in front of the client name, e.g. "PH". */
  brand?: string;
  /** Where the campaign name came from. */
  campaignNameSource: "project-line" | "subject" | "none";
  issues: ParseIssue[];
  /** True only when both a single client code and a single project ID were found. */
  confident: boolean;
}

export type Category = "action" | "approval" | "acknowledgment" | "update" | "review";
export type Confidence = "high" | "medium" | "low";

export interface Classification {
  category: Category;
  confidence: Confidence;
  /** "rule" = built-in rules, "user" = corrected by the user, "ai" reserved for later. */
  source: "rule" | "user" | "ai";
  /** Short human-readable reason, shown as a tooltip. */
  reason?: string;
}

export interface HubMessage {
  id: string;
  internetMessageId?: string;
  subject: string;
  /** Person who wrote the comment, with the "(PWF)" suffix removed. */
  author: string;
  authorCompany?: string;
  fromAddress: string;
  receivedAt: string;
  isRead: boolean;
  folderId?: string;
  archived: boolean;
  hasAttachments: boolean;
  webLink?: string;
  /** The comment text pulled out of the notification template. */
  comment: string;
  /** False when the template markers were not found and `comment` is a best-effort fallback. */
  commentExtracted: boolean;
  /** Raw "Project" row from the notification body. Kept so identifiers can be re-parsed when rules change. */
  projectLine?: string;
  /** True when the comment was written by the signed-in user. */
  fromSelf: boolean;
  parse: ParseResult;
  classification: Classification;
}

export type CampaignStatus = "attention" | "new" | "review" | "uptodate";

/** Per-campaign state the user creates. Small, and the only thing that is not rebuildable from the mailbox. */
export interface CampaignState {
  reviewedAt?: string;
  manualStatus?: CampaignStatus;
  manualStatusAt?: string;
  /** IDs of action-required messages the user has marked as resolved. */
  resolved?: string[];
}

export interface UserState {
  campaigns: Record<string, CampaignState>;
  /** Manual grouping: message ID -> campaign key. */
  assignments: Record<string, string>;
  /** User-corrected classifications: message ID -> category. */
  categoryOverrides: Record<string, Category>;
}

export interface Campaign {
  /** `${clientCode}::${projectId}` */
  key: string;
  clientCode: string;
  clientName: string;
  projectId: string;
  name: string;
  messages: HubMessage[];
  total: number;
  unread: number;
  openActions: number;
  uncertain: number;
  lastActivity: string;
  status: CampaignStatus;
  statusIsManual: boolean;
  reviewedAt?: string;
}

export interface ClientGroup {
  clientCode: string;
  clientName: string;
  campaigns: Campaign[];
}

export interface Overview {
  attention: number;
  new: number;
  review: number;
  uptodate: number;
  total: number;
}

export interface Settings {
  /** Exact sender addresses treated as ProWorkflow notifications. */
  senderAddresses: string[];
  /** Sender domains treated as ProWorkflow notifications. */
  senderDomains: string[];
  /** Regex for the project ID. The whole match is used. */
  projectIdPattern: string;
  /** Regex for the client code. Capture group 1 is the code. */
  clientCodePattern: string;
  /** Regex for a brand prefix in front of the client name. Capture group 1 is the brand. */
  brandPrefixPattern: string;
  /** Regexes for the line that introduces the comment in the notification body. */
  commentMarkerPatterns: string[];
  messageOrder: "oldest" | "newest";
  groupBy: "status" | "client";
  defaultFilter: "all" | CampaignStatus;
  density: "compact" | "expanded";
  highlightNew: boolean;
  highlightActions: boolean;
  highlightApprovals: boolean;
  /** Days of history covered by the last import. */
  historyDays: number;
}

export interface BulkResult {
  succeeded: string[];
  /** `gone` is true when the email no longer exists in the mailbox. */
  failed: { id: string; error: string; gone?: boolean }[];
}

export interface ImportProgress {
  processed: number;
  total?: number;
}
