import type { HubMessage, RawMessage, Settings } from "./types";
import { ruleClassifier, type Classifier } from "./classifier";
import { cleanSenderName, extractComment } from "./extract";
import { findProjectLine, parseMessage } from "./parser";

export interface PipelineContext {
  /** Display name of the signed-in user, used to recognise their own comments. */
  selfName?: string;
  archiveFolderId?: string;
  classifier?: Classifier;
}

function sameName(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Turn one mailbox message into a hub message: extract the comment, parse identifiers, classify. */
export function toHubMessage(raw: RawMessage, settings: Settings, ctx: PipelineContext = {}): HubMessage {
  const senderName = cleanSenderName(raw.fromName);
  const extraction = extractComment(raw.bodyText, settings, senderName);
  const author = extraction.author || senderName || raw.fromAddress;
  const classifier = ctx.classifier ?? ruleClassifier;
  return {
    id: raw.id,
    internetMessageId: raw.internetMessageId,
    subject: raw.subject,
    author,
    authorCompany: extraction.company,
    fromAddress: raw.fromAddress,
    receivedAt: raw.receivedDateTime,
    isRead: raw.isRead,
    folderId: raw.parentFolderId,
    archived: Boolean(ctx.archiveFolderId && raw.parentFolderId === ctx.archiveFolderId),
    hasAttachments: raw.hasAttachments,
    webLink: raw.webLink,
    comment: extraction.comment,
    commentExtracted: extraction.extracted,
    projectLine: findProjectLine(raw.bodyText) ?? undefined,
    fromSelf: sameName(author, ctx.selfName),
    parse: parseMessage(raw.subject, raw.bodyText, settings),
    classification: classifier.classify(extraction.comment),
  };
}

/** Re-run identifier parsing on a cached message after the extraction rules change. */
export function reparse(m: HubMessage, settings: Settings): HubMessage {
  const body = m.projectLine ? `Project ${m.projectLine}` : "";
  return { ...m, parse: parseMessage(m.subject, body, settings) };
}
