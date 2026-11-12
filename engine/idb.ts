// The browser's own storage, as a store's files: the home lives here, so a reload
// loses nothing, and blocks pulled from a host are kept here by their hash. A put is a
// transaction of its own, so a file is replaced whole. Every tab's engine writes the same
// home, so an act locks it with the browser's own locks, across tabs.

import { encoded, joined, type Files } from "../integrations/glass/files.ts";

const request = <T>(asked: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    asked.onsuccess = () => resolve(asked.result);
    asked.onerror = () => reject(asked.error);
  });

export async function idbFiles(name: string): Promise<Files> {
  const opening = indexedDB.open(name, 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore("files");

  const db = await request(opening);
  const files = () => db.transaction("files", "readwrite").objectStore("files");

  return {
    read: async (path) =>
      (await request<Uint8Array | undefined>(db.transaction("files").objectStore("files").get(path))) ?? null,

    write: async (path, content) => void (await request(files().put(encoded(content), path))),
    replace: async (path, text) => void (await request(files().put(encoded(text), path))),
    lock: () => locked(`glass:${name}`),

    // The read and the write stand in one transaction, so nothing comes between them.
    append: (path, text) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction("files", "readwrite");
        const held = transaction.objectStore("files");

        held.get(path).onsuccess = (event) => {
          const before = (event.target as IDBRequest<Uint8Array | undefined>).result ?? null;
          held.put(joined(before, encoded(text)), path);
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      }),
  };
}

// Holds a lock of the browser's until let go, or refuses if another tab holds it. Where
// the browser has no locks, only this engine writes, and its turns already keep its acts
// apart.
function locked(name: string) {
  if (!navigator.locks) return Promise.resolve(async () => {});

  return new Promise<() => Promise<void>>((resolve, reject) =>
    navigator.locks
      .request(name, { ifAvailable: true }, (lock) => {
        if (!lock) return reject(new Error(`${name} is locked by another tab`));
        return new Promise<void>((letGo) => resolve(async () => letGo()));
      })
      .catch(reject),
  );
}
