import type { Name } from "./name.ts";

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

export class MemoryBackend implements Backend {
  readonly writable = true;
  readonly objects = new Map<Name, string>();
  readonly refs = new Map<string, Name>();

  async get(name: Name) {
    return this.objects.get(name);
  }
  async put(name: Name, text: string) {
    this.objects.set(name, text);
  }
  async ref(ref: string) {
    return this.refs.get(ref);
  }
  async moveRef(ref: string, to: Name, from: Name | undefined) {
    if (this.refs.get(ref) !== from) return false;
    this.refs.set(ref, to);
    return true;
  }
}

// A store served as files, read over HTTP. It is read only: nothing ever
// writes into a pulled store.
export class HttpBackend implements Backend {
  readonly writable = false;
  constructor(readonly base: string) {
    if (!base.endsWith("/")) this.base = base + "/";
  }

  async get(name: Name) {
    const response = await fetch(`${this.base}objects/${path(name)}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`fetching ${name}: ${response.status}`);
    return response.text();
  }
  async put(): Promise<void> {
    throw new Error("a pulled store is read only");
  }
  async ref(ref: string) {
    const response = await fetch(`${this.base}refs/${ref}`, { cache: "no-cache" });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`fetching ref ${ref}: ${response.status}`);
    return (await response.text()).trim() as Name;
  }
  async moveRef(): Promise<boolean> {
    throw new Error("a pulled store is read only");
  }
  async bundle(commit: Name): Promise<string | undefined> {
    const response = await fetch(`${this.base}bundles/${commit}.json`);
    return response.ok ? response.text() : undefined;
  }
}

// Objects fanned into folders by the first two characters of their hash.
export function path(name: Name) {
  const hex = name.slice("sha256-".length);
  return `${hex.slice(0, 2)}/${hex.slice(2)}.json`;
}
