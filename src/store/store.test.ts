import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import canonicalCases from "../../vectors/canonical.json";
import storeVectors from "../../vectors/store.json";
import { MemoryBackend, path } from "./backend.ts";
import { canonical } from "./canonical.ts";
import { FileBackend, writeBundle } from "./files.ts";
import { isId, newId } from "./id.ts";
import { nameOf, nameOfText, type Name } from "./name.ts";
import { Store, type Change } from "./store.ts";

describe("canonical form", () => {
  for (const vector of canonicalCases)
    test(vector.about, async () => {
      const text = canonical(JSON.parse(vector.json));
      expect(text).toBe(vector.canonical);
      expect(await nameOfText(text)).toBe(vector.name as Name);
    });

  test("refuses what is not JSON", () => {
    expect(() => canonical(NaN)).toThrow();
    expect(() => canonical({ a: () => 1 })).toThrow();
    expect(() => canonical(new Date())).toThrow();
    expect(() => canonical("\ud800")).toThrow();
  });
});

describe("the store vectors", () => {
  test("each commit adds exactly the objects listed and moves the ref", async () => {
    const backend = new MemoryBackend();
    const store = new Store(backend);
    let before = new Set<Name>();
    for (const step of storeVectors.steps) {
      const commit = await store.write(step.change as Change);
      expect(commit).toBe(step.ref as Name);
      expect(await store.head()).toBe(step.ref as Name);
      const added = [...backend.objects.keys()].filter((name) => !before.has(name));
      expect(added.sort()).toEqual(Object.keys(step.objects).sort() as Name[]);
      for (const [name, object] of Object.entries(step.objects)) expect(backend.objects.get(name as Name)).toBe(canonical(object));
      before = new Set(backend.objects.keys());
    }
  });
});

describe("a store", () => {
  const T = newId();
  const note = (id: string, title: string) => ({ id, instance: [T], body: { title } });

  test("reads every holon back, at any commit", async () => {
    const store = new Store(new MemoryBackend());
    const a = newId();
    const first = (await store.write({ at: "t1", holons: [note(T, "Note"), note(a, "one")] }))!;
    const second = (await store.write({ at: "t2", holons: [note(a, "two")] }))!;
    expect((await store.version(a))![1].body.title).toBe("two");
    expect((await store.version(a, first))![1].body.title).toBe("one");
    const [, v2] = (await store.version(a, second))!;
    expect(v2.prev).toBe((await store.version(a, first))![0]);
  });

  test("writes nothing when nothing changed", async () => {
    const store = new Store(new MemoryBackend());
    await store.write({ at: "t1", holons: [note(T, "Note")] });
    expect(await store.write({ at: "t2", holons: [note(T, "Note")] })).toBeUndefined();
  });

  test("holds hundreds of holons in a tree and finds each", async () => {
    const store = new Store(new MemoryBackend());
    const ids = Array.from({ length: 900 }, () => newId());
    await store.write({ at: "t", holons: [note(T, "Note"), ...ids.map((id, i) => note(id, `n${i}`))] });
    for (const [i, id] of ids.entries()) expect((await store.version(id))![1].body.title).toBe(`n${i}`);
    const index = await store.index((await store.head())!);
    let count = 0;
    for await (const _ of store.entries(index)) count++;
    expect(count).toBe(901);
  });

  test("the same field is the same index, however it was written", async () => {
    const ids = Array.from({ length: 300 }, () => newId());
    const once = new Store(new MemoryBackend());
    await once.write({ at: "t", holons: ids.map((id) => note(id, id)) });
    const inSteps = new Store(new MemoryBackend());
    for (let i = 0; i < ids.length; i += 37) await inSteps.write({ at: "t", holons: ids.slice(i, i + 37).map((id) => note(id, id)) });
    const holons = async (store: Store) => (await store.index((await store.head())!)).holons;
    expect(await holons(inSteps)).toBe(await holons(once));
  });

  test("refuses an object that is not what its name says", async () => {
    const backend = new MemoryBackend();
    const store = new Store(backend);
    const commit = (await store.write({ at: "t", holons: [note(T, "Note")] }))!;
    const [name] = (await store.version(T))!;
    backend.objects.set(name, canonical({ kind: "version", id: T, prev: null, instance: [T], body: { title: "forged" } }));
    await expect(new Store(backend).version(T, commit)).rejects.toThrow("does not hold what its name says");
  });

  test("refuses to move a ref someone else moved", async () => {
    const backend = new MemoryBackend();
    const store = new Store(backend);
    await store.write({ at: "t", holons: [note(T, "Note")] });
    const slow = new Store(backend);
    const write = slow.write({ at: "t", holons: [note(newId(), "late")] });
    await store.write({ at: "t", holons: [note(newId(), "first")] });
    await expect(write).rejects.toThrow("moved");
  });
});

describe("a store as files", () => {
  test("lays objects out by hash, and a bundle holds one commit whole", async () => {
    const dir = await mkdtemp(join(tmpdir(), "glass-"));
    const store = new Store(new FileBackend(dir));
    const T = newId();
    const commit = (await store.write({ at: "t", names: { note: T }, holons: [{ id: T, instance: [T], body: { title: "Note" } }] }))!;
    expect((await readFile(join(dir, "refs", "main"), "utf8")).trim()).toBe(commit);
    expect(await readFile(join(dir, "objects", path(commit)), "utf8")).toBe(canonical(await store.object(commit)));

    await writeBundle(store, dir, commit);
    const bundle = JSON.parse(await readFile(join(dir, "bundles", `${commit}.json`), "utf8"));
    expect(Object.keys(bundle.objects)).toHaveLength(4);
    const fresh = new Store(new MemoryBackend());
    for (const [name, object] of Object.entries(bundle.objects)) await fresh.seed(name as Name, object);
    expect((await fresh.object(commit)).kind).toBe("commit");

    await writeFile(join(dir, "refs", "main"), "sha256-nothing\n");
    expect(await new Store(new FileBackend(dir)).head()).toBe("sha256-nothing" as Name);
  });
});

test("ids are ULIDs that sort by birth", () => {
  const early = newId(1000);
  const late = newId(2000);
  expect(isId(early)).toBe(true);
  expect(early < late).toBe(true);
});

test("a name is the hash of the canonical text", async () => {
  expect(await nameOf({ b: 1, a: 2 })).toBe(await nameOfText('{"a":2,"b":1}'));
});
