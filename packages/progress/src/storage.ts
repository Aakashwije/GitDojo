/**
 * Where progress records live. `update` is a read-modify-write that must be atomic with respect
 * to other updates of the same key, including from other tabs: IndexedDB gives this through
 * readwrite transactions, which never overlap on the same object store.
 */
export interface ProgressStorage {
  readonly kind: "indexeddb" | "memory";
  read(key: string): Promise<unknown>;
  /**
   * Reads the stored value, passes it to `change` (synchronously, inside the transaction) and
   * stores what it returns. Returning `undefined` leaves the record as it was.
   */
  update(key: string, change: (current: unknown) => unknown): Promise<void>;
  write(key: string, value: unknown): Promise<void>;
}

/** Keeps progress for the life of the page only: used when IndexedDB is unavailable. */
export function createMemoryStorage(): ProgressStorage {
  const records = new Map<string, unknown>();
  // structuredClone keeps callers from mutating stored values, as IndexedDB would.
  return {
    kind: "memory",
    read: (key) => Promise.resolve(structuredClone(records.get(key))),
    update: (key, change) => {
      try {
        const next = change(structuredClone(records.get(key)));
        if (next !== undefined) records.set(key, structuredClone(next));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
    write: (key, value) => {
      records.set(key, structuredClone(value));
      return Promise.resolve();
    },
  };
}

export const PROGRESS_DATABASE = "gitdojo-progress";
const STORE = "records";

function requestError(request: IDBRequest | IDBTransaction, fallback: string): Error {
  return request.error ?? new Error(fallback);
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, 1);
    } catch (error) {
      // Some browsers throw synchronously when storage is disabled.
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Let a future schema upgrade in another tab proceed instead of blocking it.
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };
    request.onerror = () => {
      reject(requestError(request, "Could not open the progress database"));
    };
    request.onblocked = () => {
      reject(new Error("The progress database is blocked by another tab"));
    };
  });
}

/**
 * Progress in its own IndexedDB database, separate from the LightningFS database that holds
 * lesson and playground repositories. Rejects (on first use) when IndexedDB is unavailable.
 */
export function createIndexedDbStorage(
  factory: IDBFactory,
  name: string = PROGRESS_DATABASE,
): ProgressStorage {
  let database: Promise<IDBDatabase> | null = null;
  const db = () => {
    database ??= openDatabase(factory, name).catch((error: unknown) => {
      database = null;
      throw error;
    });
    return database;
  };

  const transaction = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore, done: (value: T) => void, fail: (error: Error) => void) => void,
  ): Promise<T> => {
    const connection = await db();
    return new Promise<T>((resolve, reject) => {
      let result: T;
      let failure: Error | null = null;
      const tx = connection.transaction(STORE, mode);
      tx.oncomplete = () => {
        resolve(result);
      };
      tx.onabort = () => {
        reject(failure ?? requestError(tx, "The progress transaction was aborted"));
      };
      tx.onerror = () => {
        failure ??= requestError(tx, "The progress transaction failed");
      };
      run(
        tx.objectStore(STORE),
        (value) => {
          result = value;
        },
        (error) => {
          failure = error;
          tx.abort();
        },
      );
    });
  };

  return {
    kind: "indexeddb",
    read: (key) =>
      transaction<unknown>("readonly", (store, done) => {
        const request = store.get(key);
        request.onsuccess = () => {
          done(request.result);
        };
      }),
    update: (key, change) =>
      transaction<undefined>("readwrite", (store, done, fail) => {
        const request = store.get(key);
        request.onsuccess = () => {
          try {
            const next = change(request.result);
            if (next !== undefined) store.put(next, key);
            done(undefined);
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
          }
        };
      }),
    write: (key, value) =>
      transaction<undefined>("readwrite", (store, done) => {
        store.put(value, key);
        done(undefined);
      }),
  };
}
