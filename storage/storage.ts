// The contract every storage gives a store: where its bytes rest. A storage knows
// nothing of holons or acts. It keeps blobs, each named by the SHA-256 of its bytes and
// never changed once written, and one head: the name of a blob, which only moves.
//
// The head moves only if it still names what the writer last saw, so of writers racing,
// one wins and the others read the new head and try again. Blobs can be read in part,
// at an offset, so a store reads the page it needs, not the whole blob.
//
// folder.ts keeps a storage in a folder on a machine.

export type Storage = {
  // Writes a blob and returns its name. Writing a blob that exists already does nothing.
  put(bytes: Uint8Array): Promise<string>;
  // Reads a blob, or length bytes of it from offset.
  read(name: string, offset?: number, length?: number): Promise<Uint8Array>;
  // Removes a blob that no head reaches any more, such as one written by a writer that
  // lost the race for the head.
  remove(name: string): Promise<void>;
  // The name the head holds, or null for a storage never written.
  head(): Promise<string | null>;
  // Points the head at a blob, only if it still holds from. Returns whether it moved.
  moveHead(from: string | null, to: string): Promise<boolean>;
  // Calls the listener with each new head, moved by this process or another. Returns
  // the function that stops it.
  watchHead(listener: (head: string | null) => void): () => void;
};

// A blob's name: the hex SHA-256 of its bytes, by Web Crypto, in a browser or on a machine.
export async function nameOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
