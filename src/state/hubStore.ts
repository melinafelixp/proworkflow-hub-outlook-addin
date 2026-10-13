import { CONFIG } from "../config";
import { daysAgoIso } from "../core/dates";
import { campaignKey, EMPTY_STATE } from "../core/grouping";
import { reparse, toHubMessage } from "../core/pipeline";
import { DEFAULT_SETTINGS, mergeSettings } from "../core/settings";
import type { CampaignState, CampaignStatus, Category, HubMessage, RawMessage, Settings, UserState } from "../core/types";
import {
  AuthRequiredError,
  SetupError,
  type MailProvider,
  type OriginalMessage,
  type Profile,
  type SpecialFolders,
} from "../data/mailProvider";
import { createStores, type Stores } from "../data/storage";

export type Phase = "loading" | "signin" | "setup-error" | "onboarding" | "importing" | "ready";
export type BulkKind = "read" | "unread" | "archive";

export interface Notice {
  id: number;
  kind: "success" | "warning" | "error";
  text: string;
  /** Present when some emails failed and the action can be tried again for just those. */
  retry?: { kind: BulkKind; ids: string[] };
}

export interface HubState {
  phase: Phase;
  mode: "mock" | "graph";
  profile?: Profile;
  messages: HubMessage[];
  userState: UserState;
  settings: Settings;
  importProgress?: { processed: number; total?: number; clients: number; campaigns: number };
  sync: { status: "idle" | "syncing" | "error" | "auth"; lastSyncAt?: string; error?: string };
  notice?: Notice;
  /** Label of the bulk action in flight, if any. */
  busy?: string;
  errorMessage?: string;
  /** Subject of the email currently selected in Outlook, when known. */
  selectedSubject?: string;
}

interface Meta {
  importedAt?: string;
  lastSyncAt?: string;
}

const KEY_SETTINGS = "settings";
const KEY_USER = "userState";
const KEY_META = "meta";
const KEY_MESSAGES = "messages";
/** Re-read a little further back than the last sync so nothing slips between two polls. */
const SYNC_OVERLAP_MS = 2 * 60 * 1000;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

/**
 * All application state and every action the UI can take. Framework-free so it can be unit tested;
 * React subscribes through useSyncExternalStore.
 */
export class HubStore {
  private state: HubState;
  private listeners = new Set<() => void>();
  private stores: Stores | null = null;
  private folders: SpecialFolders = {};
  private meta: Meta = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private noticeSeq = 0;
  private syncing: Promise<void> | null = null;

  constructor(
    private provider: MailProvider,
    private options: { persist: boolean; now?: () => Date } = { persist: true }
  ) {
    this.state = {
      phase: "loading",
      mode: provider.mode,
      messages: [],
      userState: EMPTY_STATE,
      settings: DEFAULT_SETTINGS,
      sync: { status: "idle" },
    };
  }

  // ---- subscription -------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = (): HubState => this.state;

  private set(patch: Partial<HubState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }
  private notify(kind: Notice["kind"], text: string, retry?: Notice["retry"]): void {
    this.noticeSeq += 1;
    this.set({ notice: { id: this.noticeSeq, kind, text, retry } });
  }
  dismissNotice = (): void => this.set({ notice: undefined });

  // ---- start-up -----------------------------------------------------------------------------

  async init(): Promise<void> {
    await this.connect(false);
  }

  /** Called by the Connect / Reconnect button, so a sign-in window is allowed to open. */
  signIn = async (): Promise<void> => {
    if (this.state.phase === "ready") {
      try {
        await this.provider.connect(true);
        this.set({ sync: { ...this.state.sync, status: "idle", error: undefined } });
        await this.sync();
      } catch (e) {
        this.notify("error", describe(e));
      }
      return;
    }
    this.set({ phase: "loading", errorMessage: undefined });
    await this.connect(true);
  };

  private async connect(interactive: boolean): Promise<void> {
    let profile: Profile;
    try {
      profile = await this.provider.connect(interactive);
    } catch (e) {
      if (e instanceof SetupError) this.set({ phase: "setup-error", errorMessage: e.message });
      else if (e instanceof AuthRequiredError) this.set({ phase: "signin", errorMessage: interactive ? e.message : undefined });
      else this.set({ phase: "signin", errorMessage: describe(e) });
      return;
    }

    this.stores = createStores(profile.address || "default", this.options.persist);
    const [settings, userState, meta, messages] = await Promise.all([
      this.stores.small.get<Partial<Settings>>(KEY_SETTINGS),
      this.stores.small.get<UserState>(KEY_USER),
      this.stores.small.get<Meta>(KEY_META),
      this.stores.cache.get<HubMessage[]>(KEY_MESSAGES),
    ]);
    this.meta = meta ?? {};
    try {
      this.folders = await this.provider.getSpecialFolders();
    } catch {
      this.folders = {};
    }

    const imported = Boolean(this.meta.importedAt && messages);
    this.set({
      profile,
      settings: mergeSettings(settings),
      userState: { ...EMPTY_STATE, ...(userState ?? {}) },
      messages: imported ? (messages as HubMessage[]) : [],
      phase: imported ? "ready" : "onboarding",
      sync: { status: "idle", lastSyncAt: this.meta.lastSyncAt },
    });
    if (imported) {
      this.startPolling();
      void this.sync();
    }
  }

  private pipelineContext() {
    return { selfName: this.state.profile?.displayName, archiveFolderId: this.folders.archive };
  }

  // ---- persistence --------------------------------------------------------------------------

  private async saveMessages(): Promise<void> {
    await this.stores?.cache.set(KEY_MESSAGES, this.state.messages);
  }
  private async saveUserState(): Promise<void> {
    await this.stores?.small.set(KEY_USER, this.state.userState);
  }
  private async saveMeta(): Promise<void> {
    await this.stores?.small.set(KEY_META, this.meta);
  }

  // ---- historical import --------------------------------------------------------------------

  startImport = async (days: number): Promise<void> => {
    const started = this.now();
    const settings = { ...this.state.settings, historyDays: days };
    this.set({
      phase: "importing",
      settings,
      errorMessage: undefined,
      importProgress: { processed: 0, clients: 0, campaigns: 0 },
    });
    const ctx = this.pipelineContext();
    const collected = new Map<string, HubMessage>();
    const clients = new Set<string>();
    const campaigns = new Set<string>();

    try {
      await this.provider.importHistory(settings, daysAgoIso(days, started), (page, progress) => {
        for (const raw of page) {
          if (this.folders.deleted && raw.parentFolderId === this.folders.deleted) continue;
          const m = toHubMessage(raw, settings, ctx);
          collected.set(m.id, m); // keyed by message ID, so a message is never counted twice
          if (m.parse.confident && m.parse.clientCode && m.parse.projectId) {
            clients.add(m.parse.clientCode);
            campaigns.add(campaignKey(m.parse.clientCode, m.parse.projectId));
          }
        }
        this.set({
          importProgress: {
            processed: progress.processed,
            total: progress.total,
            clients: clients.size,
            campaigns: campaigns.size,
          },
        });
      });
    } catch (e) {
      const auth = e instanceof AuthRequiredError;
      this.set({
        phase: this.meta.importedAt ? "ready" : auth ? "signin" : "onboarding",
        importProgress: undefined,
        errorMessage: auth ? undefined : `The import stopped: ${describe(e)} Nothing was changed in your mailbox.`,
        sync: auth ? { ...this.state.sync, status: "auth" } : this.state.sync,
      });
      return;
    }

    const messages = Array.from(collected.values());
    const firstImport = !this.meta.importedAt;
    let userState = this.state.userState;
    if (firstImport) {
      // Baseline: a request in an email that was already read before the first import is treated as
      // handled. Without this, every old request would show up as open. From here on, only the user
      // resolves action items.
      const campaignsState: Record<string, CampaignState> = { ...userState.campaigns };
      for (const m of messages) {
        if (m.classification.category !== "action" || m.fromSelf || !m.isRead) continue;
        if (!m.parse.confident || !m.parse.clientCode || !m.parse.projectId) continue;
        const key = campaignKey(m.parse.clientCode, m.parse.projectId);
        const cs = campaignsState[key] ?? {};
        campaignsState[key] = { ...cs, resolved: [...(cs.resolved ?? []), m.id] };
      }
      userState = { ...userState, campaigns: campaignsState };
    }

    this.meta = { importedAt: started.toISOString(), lastSyncAt: started.toISOString() };
    this.set({
      messages,
      userState,
      phase: "ready",
      importProgress: undefined,
      sync: { status: "idle", lastSyncAt: this.meta.lastSyncAt },
    });
    await Promise.all([
      this.saveMessages(),
      this.saveUserState(),
      this.saveMeta(),
      this.stores?.small.set(KEY_SETTINGS, settings),
    ]);
    this.startPolling();
  };

  // ---- ongoing sync -------------------------------------------------------------------------

  sync = (): Promise<void> => {
    if (this.state.phase !== "ready") return Promise.resolve();
    if (!this.syncing) {
      this.syncing = this.runSync().finally(() => {
        this.syncing = null;
      });
    }
    return this.syncing;
  };

  private async runSync(): Promise<void> {
    const started = this.now();
    const last = this.meta.lastSyncAt ?? this.meta.importedAt ?? started.toISOString();
    const since = new Date(new Date(last).getTime() - SYNC_OVERLAP_MS).toISOString();
    this.set({ sync: { ...this.state.sync, status: "syncing" } });

    let changes: RawMessage[];
    try {
      changes = await this.provider.syncChanges(this.state.settings, since);
    } catch (e) {
      const auth = e instanceof AuthRequiredError;
      this.set({ sync: { status: auth ? "auth" : "error", lastSyncAt: this.meta.lastSyncAt, error: describe(e) } });
      return;
    }

    const ctx = this.pipelineContext();
    const byId = new Map(this.state.messages.map((m) => [m.id, m]));
    let changed = false;
    for (const raw of changes) {
      const existing = byId.get(raw.id);
      if (this.folders.deleted && raw.parentFolderId === this.folders.deleted) {
        if (existing) {
          byId.delete(raw.id); // deleted in Outlook
          changed = true;
        }
        continue;
      }
      const next = toHubMessage(raw, this.state.settings, ctx);
      if (!existing || existing.isRead !== next.isRead || existing.folderId !== next.folderId || existing.subject !== next.subject) {
        byId.set(raw.id, next);
        changed = true;
      }
    }

    this.meta = { ...this.meta, lastSyncAt: started.toISOString() };
    this.set({
      ...(changed ? { messages: Array.from(byId.values()) } : {}),
      sync: { status: "idle", lastSyncAt: this.meta.lastSyncAt },
    });
    await Promise.all([changed ? this.saveMessages() : Promise.resolve(), this.saveMeta()]);
  }

  private startPolling(): void {
    if (this.timer || typeof window === "undefined") return;
    this.timer = setInterval(() => {
      if (document.visibilityState === "visible") void this.sync();
    }, CONFIG.syncIntervalMs);
    document.addEventListener("visibilitychange", this.onVisible);
  }
  private onVisible = (): void => {
    if (document.visibilityState === "visible") void this.sync();
  };
  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisible);
  }

  /** Outlook tells us the user selected a different email. Cheap signal that state may have changed. */
  private selectionTimer: ReturnType<typeof setTimeout> | null = null;
  onOutlookSelection(subject: string | undefined): void {
    if (subject !== this.state.selectedSubject) this.set({ selectedSubject: subject });
    if (this.selectionTimer) clearTimeout(this.selectionTimer);
    this.selectionTimer = setTimeout(() => void this.sync(), 2500);
  }

  // ---- bulk actions on real emails ----------------------------------------------------------

  private patchMessages(ids: Iterable<string>, patch: (m: HubMessage) => HubMessage | null): void {
    const set = new Set(ids);
    const next: HubMessage[] = [];
    for (const m of this.state.messages) {
      if (!set.has(m.id)) next.push(m);
      else {
        const p = patch(m);
        if (p) next.push(p);
      }
    }
    this.set({ messages: next });
  }

  /** Mark emails read or unread in Outlook. Returns the IDs that could not be updated. */
  setRead = async (ids: string[], isRead: boolean, quiet = false): Promise<string[]> => {
    const targets = this.state.messages.filter((m) => ids.includes(m.id) && m.isRead !== isRead).map((m) => m.id);
    if (targets.length === 0) {
      if (!quiet) this.notify("success", isRead ? "These emails are already read." : "These emails are already unread.");
      return [];
    }
    // Show the change straight away, then put back anything Outlook rejected.
    this.patchMessages(targets, (m) => ({ ...m, isRead }));
    this.set({ busy: isRead ? "Marking as read…" : "Marking as unread…" });
    try {
      const result = await this.provider.setRead(targets, isRead);
      const gone = result.failed.filter((f) => f.gone).map((f) => f.id);
      const failed = result.failed.filter((f) => !f.gone).map((f) => f.id);
      if (failed.length > 0) this.patchMessages(failed, (m) => ({ ...m, isRead: !isRead }));
      if (gone.length > 0) this.patchMessages(gone, () => null);
      this.set({ busy: undefined });
      await this.saveMessages();
      const word = isRead ? "read" : "unread";
      if (failed.length > 0) {
        this.notify(
          "warning",
          `${result.succeeded.length} of ${targets.length} emails marked as ${word}. ${plural(failed.length, "email")} could not be updated: ${result.failed.find((f) => !f.gone)?.error ?? ""}`,
          { kind: isRead ? "read" : "unread", ids: failed }
        );
      } else if (!quiet) {
        const extra = gone.length > 0 ? ` ${plural(gone.length, "email")} had already been deleted.` : "";
        this.notify("success", `${plural(result.succeeded.length, "email")} marked as ${word} in Outlook.${extra}`);
      }
      return failed;
    } catch (e) {
      this.patchMessages(targets, (m) => ({ ...m, isRead: !isRead }));
      this.set({ busy: undefined });
      this.handleActionError(e, { kind: isRead ? "read" : "unread", ids: targets });
      return targets;
    }
  };

  /** Move emails to the Outlook Archive folder. The UI asks for confirmation before calling this. */
  archive = async (ids: string[]): Promise<void> => {
    const targets = this.state.messages.filter((m) => ids.includes(m.id) && !m.archived).map((m) => m.id);
    if (targets.length === 0) {
      this.notify("success", "These emails are already in the Archive folder.");
      return;
    }
    this.set({ busy: "Archiving…" });
    try {
      const result = await this.provider.archive(targets);
      const gone = result.failed.filter((f) => f.gone).map((f) => f.id);
      const failed = result.failed.filter((f) => !f.gone);
      this.patchMessages(result.succeeded, (m) => ({ ...m, archived: true, folderId: this.folders.archive ?? m.folderId }));
      if (gone.length > 0) this.patchMessages(gone, () => null);
      this.set({ busy: undefined });
      await this.saveMessages();
      if (failed.length > 0) {
        this.notify(
          "warning",
          `${result.succeeded.length} of ${targets.length} emails archived. ${plural(failed.length, "email")} could not be moved: ${failed[0].error}`,
          { kind: "archive", ids: failed.map((f) => f.id) }
        );
      } else {
        this.notify("success", `${plural(result.succeeded.length, "email")} moved to Archive. They stay visible here.`);
      }
    } catch (e) {
      this.set({ busy: undefined });
      this.handleActionError(e, { kind: "archive", ids: targets });
    }
  };

  retry = async (retry: NonNullable<Notice["retry"]>): Promise<void> => {
    this.dismissNotice();
    if (retry.kind === "archive") await this.archive(retry.ids);
    else await this.setRead(retry.ids, retry.kind === "read");
  };

  private handleActionError(e: unknown, retry: NonNullable<Notice["retry"]>): void {
    if (e instanceof AuthRequiredError) {
      this.set({ sync: { ...this.state.sync, status: "auth", error: e.message } });
      this.notify("error", "Nothing was changed. Reconnect to Microsoft 365 and try again.", retry);
    } else {
      this.notify("error", `Nothing was changed. ${describe(e)}`, retry);
    }
  }

  // ---- campaign state (stored by the add-in, never written to the mailbox) ------------------

  private updateCampaign(key: string, patch: (cs: CampaignState) => CampaignState): void {
    const current = this.state.userState.campaigns[key] ?? {};
    const userState = {
      ...this.state.userState,
      campaigns: { ...this.state.userState.campaigns, [key]: patch(current) },
    };
    this.set({ userState });
    void this.saveUserState();
  }

  /**
   * Review & Clear: mark every email in the campaign as read and record when it was reviewed.
   * Open action items stay open, and nothing is archived.
   */
  reviewCampaign = async (key: string, messageIds: string[]): Promise<void> => {
    const failed = await this.setRead(messageIds, true, true);
    this.updateCampaign(key, (cs) => ({ ...cs, reviewedAt: this.now().toISOString() }));
    if (failed.length === 0) {
      this.notify("success", `Campaign reviewed. ${plural(messageIds.length, "email")} marked as read in Outlook.`);
    }
  };

  resolveAction = (key: string, messageId: string, resolved: boolean): void => {
    this.updateCampaign(key, (cs) => {
      const set = new Set(cs.resolved ?? []);
      if (resolved) set.add(messageId);
      else set.delete(messageId);
      return { ...cs, resolved: Array.from(set) };
    });
  };

  setManualStatus = (key: string, status: CampaignStatus | null): void => {
    this.updateCampaign(key, (cs) =>
      status
        ? { ...cs, manualStatus: status, manualStatusAt: this.now().toISOString() }
        : { ...cs, manualStatus: undefined, manualStatusAt: undefined }
    );
  };

  setCategory = (messageId: string, category: Category | null): void => {
    const categoryOverrides = { ...this.state.userState.categoryOverrides };
    if (category) categoryOverrides[messageId] = category;
    else delete categoryOverrides[messageId];
    this.set({ userState: { ...this.state.userState, categoryOverrides } });
    void this.saveUserState();
  };

  /** Manually file an uncategorized email under a campaign, or undo that. */
  assign = (messageId: string, key: string | null): void => {
    const assignments = { ...this.state.userState.assignments };
    if (key) assignments[messageId] = key;
    else delete assignments[messageId];
    this.set({ userState: { ...this.state.userState, assignments } });
    void this.saveUserState();
  };

  // ---- settings -----------------------------------------------------------------------------

  updateSettings = (patch: Partial<Settings>): void => {
    const settings = { ...this.state.settings, ...patch };
    const rulesChanged =
      patch.projectIdPattern !== undefined || patch.clientCodePattern !== undefined || patch.brandPrefixPattern !== undefined;
    this.set({
      settings,
      ...(rulesChanged ? { messages: this.state.messages.map((m) => reparse(m, settings)) } : {}),
    });
    void this.stores?.small.set(KEY_SETTINGS, settings);
    if (rulesChanged) void this.saveMessages();
  };

  /** Forget everything stored on this device. The mailbox itself is not touched. */
  clearLocalData = async (): Promise<void> => {
    this.dispose();
    await Promise.all([
      this.stores?.small.remove(KEY_USER),
      this.stores?.small.remove(KEY_META),
      this.stores?.cache.remove(KEY_MESSAGES),
    ]);
    this.meta = {};
    this.set({ messages: [], userState: EMPTY_STATE, phase: "onboarding", sync: { status: "idle" }, notice: undefined });
  };

  // ---- single message helpers ---------------------------------------------------------------

  getOriginal = (id: string): Promise<OriginalMessage> => this.provider.getOriginal(id);

  openInOutlook = async (m: HubMessage): Promise<void> => {
    try {
      await this.provider.openInOutlook(m.id, m.webLink);
    } catch (e) {
      this.notify("error", describe(e));
    }
  };

  /** Preview only. */
  simulateIncoming = async (): Promise<void> => {
    const p = this.provider as MailProvider & { simulateIncoming?: () => RawMessage };
    if (!p.simulateIncoming) return;
    p.simulateIncoming();
    await this.sync();
  };
}
