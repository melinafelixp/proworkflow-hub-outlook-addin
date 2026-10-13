/**
 * Local persistence.
 *
 * What is stored, and where:
 *   - Settings and review state (small)        -> localStorage
 *   - Message cache (metadata + comment text)  -> IndexedDB
 *
 * Both live inside the add-in's own browser storage on the user's device and are keyed by
 * mailbox address, so two accounts on one machine never see each other's data. Nothing is
 * sent to a server. The message cache can always be rebuilt from the mailbox.
 *
 * Every call is wrapped: if storage is unavailable (private window, blocked site data) the app
 * keeps working from memory for the session.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  async get<T>(key: string): Promise<T | null> {
    const v = this.map.get(key);
    return v === undefined ? null : (JSON.parse(v) as T);
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, JSON.stringify(value));
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export class LocalStore implements KeyValueStore {
  private fallback = new MemoryStore();
  constructor(private prefix: string) {}
  async get<T>(key: string): Promise<T | null> {
    try {
      const v = window.localStorage.getItem(this.prefix + key);
      return v === null ? this.fallback.get<T>(key) : (JSON.parse(v) as T);
    } catch {
      return this.fallback.get<T>(key);
    }
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.fallback.set(key, value);
    try {
      window.localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch {
      /* storage full or blocked: the in-memory copy still serves this session */
    }
  }
  async remove(key: string): Promise<void> {
    await this.fallback.remove(key);
    try {
      window.localStorage.removeItem(this.prefix + key);
    } catch {
      /* ignore */
    }
  }
}

const IDB_STORE = "kv";

export class IndexedDbStore implements KeyValueStore {
  private fallback = new MemoryStore();
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  constructor(private dbName: string) {}

  private open(): Promise<IDBDatabase | null> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const req = window.indexedDB.open(this.dbName, 1);
          req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  }

  private async run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = fn(db.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const v = await this.run<T>("readonly", (s) => s.get(key));
    return v ?? this.fallback.get<T>(key);
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.fallback.set(key, value);
    await this.run("readwrite", (s) => s.put(value, key));
  }
  async remove(key: string): Promise<void> {
    await this.fallback.remove(key);
    await this.run("readwrite", (s) => s.delete(key));
  }
}

export interface Stores {
  small: KeyValueStore;
  cache: KeyValueStore;
}

/** Storage for one mailbox. `persist: false` keeps everything in memory (used by the preview). */
export function createStores(mailbox: string, persist: boolean): Stores {
  if (!persist) return { small: new MemoryStore(), cache: new MemoryStore() };
  const id = mailbox.trim().toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
  return { small: new LocalStore(`pwh:${id}:`), cache: new IndexedDbStore(`pwh-cache:${id}`) };
}
