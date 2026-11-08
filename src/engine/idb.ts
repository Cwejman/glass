// The browser's own storage, as a store's files: the home lives here, so a reload
// loses nothing, and blocks pulled from a host are kept here by their hash.

import { encoded, joined, type Files } from "../store/files.ts";

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
