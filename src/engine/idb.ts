import type { Backend } from "../store/backend.ts";
import type { Name } from "../store/name.ts";

// The home kept in the browser's own storage, so a reload loses nothing.

export class IdbBackend implements Backend {
  readonly writable = true;
  private constructor(private readonly db: IDBDatabase) {}

  static async open(name: string) {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("objects");
      request.result.createObjectStore("refs");
    };
    return new IdbBackend(await done(request));
  }

  async get(name: Name) {
    return done<string | undefined>(this.db.transaction("objects").objectStore("objects").get(name));
  }
  // An object is written once its transaction completes, so a ref never
  // names an object that might yet be lost.
  put(name: Name, text: string) {
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction("objects", "readwrite");
      transaction.objectStore("objects").put(text, name);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("the write was aborted"));
    });
  }
  async ref(ref: string) {
    return done<Name | undefined>(this.db.transaction("refs").objectStore("refs").get(ref));
  }
  // The compare and the move happen in one transaction, so nothing moves the
  // ref between them.
  moveRef(ref: string, to: Name, from: Name | undefined) {
    return new Promise<boolean>((resolve, reject) => {
      const transaction = this.db.transaction("refs", "readwrite");
      const refs = transaction.objectStore("refs");
      let moved = false;
      refs.get(ref).onsuccess = (event) => {
        if ((event.target as IDBRequest).result !== from) return;
        refs.put(to, ref);
        moved = true;
      };
      transaction.oncomplete = () => resolve(moved);
      transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("the move was aborted"));
    });
  }
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
