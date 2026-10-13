import type { BulkResult, ImportProgress, RawMessage, Settings } from "../core/types";

export interface Profile {
  displayName: string;
  address: string;
}

export interface SpecialFolders {
  archive?: string;
  deleted?: string;
}

export interface OriginalMessage {
  /** Full HTML body of the original notification, exactly as stored in the mailbox. */
  html: string;
  attachments: { name: string; size: number }[];
}

/**
 * Everything the app needs from a mailbox. Two implementations exist:
 *   - MockProvider   sample data, used by the UI preview and by tests
 *   - GraphProvider  the real mailbox through Microsoft Graph
 * The UI and the state store only ever talk to this interface.
 */
export interface MailProvider {
  readonly mode: "mock" | "graph";

  /** Sign in (silently when possible) and return who is signed in. */
  connect(interactive: boolean): Promise<Profile>;
  getSpecialFolders(): Promise<SpecialFolders>;

  /**
   * Stream every ProWorkflow notification received since `sinceIso`, newest first.
   * `onPage` is called once per page so the UI can show progress.
   */
  importHistory(
    settings: Settings,
    sinceIso: string,
    onPage: (messages: RawMessage[], progress: ImportProgress) => void
  ): Promise<void>;

  /** Return ProWorkflow notifications that were created or changed since `sinceIso`. */
  syncChanges(settings: Settings, sinceIso: string): Promise<RawMessage[]>;

  setRead(ids: string[], isRead: boolean): Promise<BulkResult>;
  archive(ids: string[]): Promise<BulkResult>;

  getOriginal(id: string): Promise<OriginalMessage>;
  openInOutlook(id: string, webLink?: string): Promise<void>;
}

/** Thrown when the user has to sign in again before anything else can happen. */
export class AuthRequiredError extends Error {
  constructor(message = "Sign-in is required.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/** Thrown for configuration problems the user cannot fix from inside the pane. */
export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}
