import { isName, type Name } from "./name.ts";

// Where a store's files live. A backend only moves text; the store checks it.
// Objects are only ever added, and a ref moves only from the commit its writer
// started from, so two writers never silently overwrite each other.

export interface Backend {
  readonly writable: boolean;
  get(name: Name): Promise<string | undefined>;
  put(name: Name, text: string): Promise<void>;
  ref(ref: string): Promise<Name | undefined>;
  moveRef(ref: string, to: Name, from: Name | undefined): Promise<boolean>;
}

// A store held in memory, its objects and refs open to look at.
export interface MemoryBackend extends Backend {
  readonly objects: Map<Name, string>;
  readonly refs: Map<string, Name>;
}

export function memoryBackend(): MemoryBackend {
  const objects = new Map<Name, string>();
  const refs = new Map<string, Name>();
  return {
    writable: true,
    objects,
    refs,
    get: async (name) => objects.get(name),
    put: async (name, text) => void objects.set(name, text),
    ref: async (ref) => refs.get(ref),
    async moveRef(ref, to, from) {
      if (refs.get(ref) !== from) return false;
      refs.set(ref, to);
      return true;
    },
  };
}

// A store served as files, read over HTTP. It is read only: nothing ever
// writes into a pulled store. Where the host offers one, a bundle holds
// everything a commit reaches.
export interface ServedBackend extends Backend {
  bundle(commit: Name): Promise<string | undefined>;
}

export function servedBackend(base: string): ServedBackend {
  const root = base.endsWith("/") ? base : `${base}/`;
  const readOnly = async (): Promise<never> => {
    throw new Error("a pulled store is read only");
  };
  return {
    writable: false,
    async get(name) {
      const response = await fetch(`${root}objects/${path(name)}`);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`fetching ${name}: ${response.status}`);
      return response.text();
    },
    put: readOnly,
    async ref(ref) {
      const response = await fetch(`${root}refs/${ref}`, { cache: "no-cache" });
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`fetching ref ${ref}: ${response.status}`);
      return asRef(await response.text());
    },
    moveRef: readOnly,
    async bundle(commit) {
      const response = await fetch(`${root}bundles/${commit}.json`);
      return response.ok ? response.text() : undefined;
    },
  };
}

export function asRef(text: string): Name {
  const name = text.trim();
  if (!isName(name)) throw new Error("a ref must hold a commit's name");
  return name;
}

// Objects fanned into folders by the first two characters of their hash.
export function path(name: Name) {
  if (!isName(name)) throw new Error(`not a name: ${name}`);
  const hex = name.slice("sha256-".length);
  return `${hex.slice(0, 2)}/${hex.slice(2)}.json`;
}
