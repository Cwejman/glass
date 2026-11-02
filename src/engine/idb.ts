import type { Backend } from "../store/backend.ts";
import type { Name } from "../store/name.ts";

// The home kept in the browser's own storage, so a reload loses nothing.

export async function idbBackend(name: string): Promise<Backend> {
  const opening = indexedDB.open(name, 1);
  opening.onupgradeneeded = () => {
    opening.result.createObjectStore("objects");
    opening.result.createObjectStore("refs");
  };
  const db = await done(opening);

  return {
    writable: true,
    get: (object) => done<string | undefined>(db.transaction("objects").objectStore("objects").get(object)),
    // An object is written once its transaction completes, so a ref never
    // names an object that might yet be lost.
    put: (object, text) =>
      settled(db.transaction("objects", "readwrite"), (transaction) => void transaction.objectStore("objects").put(text, object)),
    ref: (ref) => done<Name | undefined>(db.transaction("refs").objectStore("refs").get(ref)),
    // The compare and the move happen in one transaction, so nothing moves the
    // ref between them.
    moveRef: async (ref, to, from) => {
      let moved = false;
      await settled(db.transaction("refs", "readwrite"), (transaction) => {
        const refs = transaction.objectStore("refs");
        refs.get(ref).onsuccess = (event) => {
          if ((event.target as IDBRequest).result !== from) return;
          refs.put(to, ref);
          moved = true;
        };
      });
      return moved;
    },
  };
}

function settled(transaction: IDBTransaction, work: (transaction: IDBTransaction) => void) {
  return new Promise<void>((resolve, reject) => {
    work(transaction);
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("the transaction was aborted"));
  });
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
