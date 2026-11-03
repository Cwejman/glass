import { canonical } from "./canonical.ts";
import type { Backend } from "./backend.ts";
import { nameOfText, type Name } from "./name.ts";
import { asObject, type StoreObject } from "./objects.ts";

// A store's objects, checked. Everything read is held against its name, its
// shape and its canonical form before it is trusted, and kept, frozen, so it
// is never fetched or checked twice and nothing can change it once trusted.
// Writing an object names it by what it holds.

export interface Objects {
  get<T extends StoreObject>(name: Name): Promise<T>;
  seed(name: Name, value: unknown): Promise<void>;
  put(object: StoreObject): Promise<Name>;
}

export function checked(backend: Backend): Objects {
  const trusted = new Map<Name, StoreObject>();

  return {
    async get<T extends StoreObject>(name: Name) {
      const known = trusted.get(name);
      if (known) return known as T;
      const text = await backend.get(name);
      if (text === undefined) throw new Error(`missing object ${name}`);
      if ((await nameOfText(text)) !== name)
        throw new Error(`object ${name} does not hold what its name says`);
      const object = asObject(JSON.parse(text));
      if (canonical(object) !== text) throw new Error(`object ${name} is not in canonical form`);
      trusted.set(name, freeze(object));
      return object as T;
    },

    // Objects that arrived another way, as in a bundle, are checked the same.
    async seed(name, value) {
      const text = canonical(value);
      if ((await nameOfText(text)) !== name)
        throw new Error(`object ${name} does not hold what its name says`);
      trusted.set(name, freeze(asObject(JSON.parse(text))));
    },

    async put(object) {
      const text = canonical(object);
      const name = await nameOfText(text);
      await backend.put(name, text);
      trusted.set(name, freeze(asObject(JSON.parse(text))));
      return name;
    },
  };
}

function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
