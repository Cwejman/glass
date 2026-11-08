// Where a store's files live. A store only asks for three things, so anything
// that can do them can hold one: a folder, a static host, the browser's storage.

export interface Files {
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, content: string | Uint8Array): Promise<void>;
  append(path: string, text: string): Promise<void>;
}

export const encoded = (content: string | Uint8Array) =>
  typeof content === "string" ? new TextEncoder().encode(content) : content;

export async function sha(content: string | Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", encoded(content) as BufferSource);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function joined(first: Uint8Array | null, second: Uint8Array) {
  if (!first) return second;

  const out = new Uint8Array(first.length + second.length);
  out.set(first);
  out.set(second, first.length);

  return out;
}

// A store held in memory, for tests and for what never needs to last.
export function memoryFiles(held = new Map<string, Uint8Array>()): Files & { held: Map<string, Uint8Array> } {
  return {
    held,
    read: async (path) => held.get(path) ?? null,
    write: async (path, content) => void held.set(path, encoded(content)),
    append: async (path, text) => void held.set(path, joined(held.get(path) ?? null, encoded(text))),
  };
}

// What changes on a host is the ref and the open log; everything else is named
// by its hash, or written once. Only what changes is asked to be checked again.
const changes = (path: string) => path.startsWith("refs/") || path.startsWith("log/");

const readOnly = async (): Promise<never> => {
  throw new Error("a served store is read only");
};

// A store served as files over HTTP. A block is fetched whole, so a host can gzip it.
// What is kept is shared by every store served, since a block is only ever its hash.
export function servedFiles(base: string, kept?: Files): Files {
  const root = base.endsWith("/") ? base : `${base}/`;

  async function fetched(path: string) {
    const response = await fetch(`${root}${path}`, changes(path) ? { cache: "no-cache" } : {});

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`fetching ${path}: ${response.status}`);

    return new Uint8Array(await response.arrayBuffer());
  }

  return {
    // A host may give every file a new tag at each publish, so a block is kept
    // by its hash, which never changes.
    async read(path) {
      if (changes(path) || !kept) return fetched(path);

      const held = await kept.read(path);
      if (held) return held;

      const bytes = await fetched(path);

      // Only what is truly that block is kept, so a bad answer does not outlast itself.
      if (bytes && path === `blocks/${await sha(bytes)}.jsonl`) await kept.write(path, bytes);

      return bytes;
    },

    write: readOnly,
    append: readOnly,
  };
}
