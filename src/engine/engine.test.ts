import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryBackend, path } from "../store/backend.ts";
import { FileBackend, writeBundle } from "../store/files.ts";
import { newId } from "../store/id.ts";
import { Store } from "../store/store.ts";
import { Engine, type HolonRead } from "./engine.ts";
import { pull } from "./pull.ts";
import { references } from "./references.ts";

const TYPE = newId();
const NOTE = newId();
const typeType = {
  id: TYPE,
  instance: [TYPE],
  body: {
    title: "Type",
    fields: {
      title: { says: "What the type is called.", shape: "string" },
      fields: { says: "Each field an instance holds: what it means, and its shape.", shape: "json" },
    },
  },
};
const noteType = {
  id: NOTE,
  instance: [TYPE],
  body: {
    title: "Note",
    fields: {
      title: { says: "What the note is called.", shape: "string" },
      prose: { says: "What the note says, in markdown.", shape: "markdown", optional: true },
      about: { says: "What the note is about.", shape: "ref", optional: true },
    },
  },
};

async function glass() {
  const store = new Store(new MemoryBackend());
  await store.write({ at: "t", names: { note: NOTE }, holons: [typeType, noteType] });
  const engine = new Engine(new Store(new MemoryBackend()));
  await engine.start();
  await engine.attach("glass", store);
  return engine;
}

describe("the engine judges every commit", () => {
  test("a holon that fits its type is committed to the home", async () => {
    const engine = await glass();
    const id = newId();
    expect(await engine.commit({ holons: [{ id, instance: [NOTE], body: { title: "A note" } }] })).toBeDefined();
    expect(((await engine.read({ holon: id })) as unknown as HolonRead).store).toBe("home");
  });

  test.each([
    ["a missing field", { prose: "no title" }, "title is missing"],
    ["a key no type declares", { title: "x", colour: "red" }, "colour is not a field"],
    ["a value of the wrong shape", { title: 3 }, "title is not string"],
    ["a reference out of the field", { title: "x", about: { $ref: newId() } }, "not in the field"],
    ["a prose link out of the field", { title: "x", prose: `see [it](ref:${newId()})` }, "not in the field"],
  ])("refuses %s", async (_, body, message) => {
    const engine = await glass();
    await expect(engine.commit({ holons: [{ id: newId(), instance: [NOTE], body }] })).rejects.toThrow(message);
  });

  test("refuses a type whose field says nothing in prose", async () => {
    const engine = await glass();
    await expect(
      engine.commit({ holons: [{ id: newId(), instance: [TYPE], body: { title: "Silent", fields: { x: { says: "", shape: "string" } } } }] }),
    ).rejects.toThrow("says nothing in prose");
  });

  test("refuses to write a holon a pulled store holds", async () => {
    const engine = await glass();
    await expect(engine.commit({ holons: [{ ...noteType, body: { ...noteType.body, title: "Mine" } }] })).rejects.toThrow("only read");
  });

  test("a holon and its type may be born in one commit", async () => {
    const engine = await glass();
    const kind = newId();
    const holon = newId();
    await engine.commit({
      holons: [
        { id: holon, instance: [kind], body: { name: "x" } },
        { id: kind, instance: [TYPE], body: { title: "Kind", fields: { name: { says: "Its name.", shape: "string" } } } },
      ],
    });
    expect(await engine.read({ instances: kind })).toEqual([holon]);
  });
});

describe("the engine reads the field as one", () => {
  test("what points at a holon, by the key that points", async () => {
    const engine = await glass();
    const a = newId();
    const b = newId();
    await engine.commit({
      holons: [
        { id: a, instance: [NOTE], body: { title: "A" } },
        { id: b, instance: [NOTE], body: { title: "B", about: { $ref: a }, prose: `As [A](ref:${a}) says.` } },
      ],
    });
    expect(await engine.read({ holders: a })).toEqual([
      { id: b, key: "about" },
      { id: b, key: "prose" },
    ]);
  });

  test("a name resolves in the home before the stores it pulled", async () => {
    const engine = await glass();
    expect(await engine.read({ name: "note" })).toBe(NOTE);
    expect(await engine.read({ name: "nothing" })).toBeNull();
  });

  test("a holon as it stood at an earlier commit", async () => {
    const engine = await glass();
    const id = newId();
    const first = (await engine.commit({ holons: [{ id, instance: [NOTE], body: { title: "one" } }] }))!;
    await engine.commit({ holons: [{ id, instance: [NOTE], body: { title: "two" } }] });
    expect(((await engine.read({ holon: id })) as unknown as HolonRead).body.title).toBe("two");
    expect(((await engine.read({ holon: id, at: first })) as unknown as HolonRead).body.title).toBe("one");
  });
});

test("references are found without knowing the type", () => {
  const a = newId();
  const pinned = `sha256-${"0".repeat(64)}`;
  expect(references({ deep: { list: [{ $ref: a, "@": pinned }] }, prose: `[x](ref:${a}) and [y](https://example.com)` })).toEqual([
    { id: a, key: "deep", pinned },
    { id: a, key: "prose" },
  ] as never);
  expect(references({ notARef: { $ref: a, more: 1 } })).toEqual([]);
});

describe("a store pulled over HTTP", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glass-served-"));
  const store = new Store(new FileBackend(dir));
  const commit = (await store.write({ at: "t", names: { note: NOTE }, holons: [typeType, noteType] }))!;
  await writeBundle(store, dir, commit);
  let fetched: string[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const file = new URL(request.url).pathname;
      fetched.push(file);
      return new Response(Bun.file(join(dir, file)));
    },
  });
  afterAll(() => server.stop());
  const base = `http://127.0.0.1:${server.port}/`;

  test("a first visit fetches the ref and one bundle", async () => {
    fetched = [];
    const engine = new Engine(new Store(new MemoryBackend()));
    await engine.attach("glass", await pull(base));
    expect(await engine.read({ name: "note" })).toBe(NOTE);
    expect(fetched.filter((file) => file.startsWith("/objects/"))).toEqual([]);
  });

  test("a bundle that does not check is set aside for the loose objects", async () => {
    const file = join(dir, "bundles", `${commit}.json`);
    const honest = await readFile(file, "utf8");
    await writeFile(file, honest.replace('"Note"', '"Forged"'));
    fetched = [];
    const engine = new Engine(new Store(new MemoryBackend()));
    await engine.attach("glass", await pull(base));
    expect(((await engine.read({ holon: NOTE })) as unknown as HolonRead).body.title).toBe("Note");
    expect(fetched.some((file) => file.startsWith("/objects/"))).toBe(true);
    await writeFile(file, honest);
  });

  test("an object that does not hold what its name says is refused", async () => {
    const [name] = (await store.version(NOTE))!;
    const file = join(dir, "objects", path(name));
    const honest = await readFile(file, "utf8");
    await writeFile(file, honest.replace('"Note"', '"Forged"'));
    await writeFile(join(dir, "bundles", `${commit}.json`), "{}");
    const engine = new Engine(new Store(new MemoryBackend()));
    await expect(engine.attach("glass", await pull(base))).rejects.toThrow("does not hold what its name says");
    await writeFile(file, honest);
  });
});

describe("what the engine's fresh reading found", () => {
  test("a holon of two types must fit both where they share a key", async () => {
    const engine = await glass();
    const a = newId();
    const b = newId();
    await engine.commit({
      holons: [
        { id: a, instance: [TYPE], body: { title: "A", fields: { x: { says: "A number.", shape: "number" } } } },
        { id: b, instance: [TYPE], body: { title: "B", fields: { x: { says: "A string.", shape: "string", optional: true } } } },
      ],
    });
    await expect(engine.commit({ holons: [{ id: newId(), instance: [a, b], body: { x: "s" } }] })).rejects.toThrow("x is not number");
    await expect(engine.commit({ holons: [{ id: newId(), instance: [a, b], body: {} }] })).rejects.toThrow("x is missing");
  });

  test("a type is checked as a type when it is committed", async () => {
    const engine = await glass();
    await expect(
      engine.commit({ holons: [{ id: newId(), instance: [TYPE], body: { title: "Bad", fields: { y: { shape: "nope" } } } }] }),
    ).rejects.toThrow("says nothing in prose");
  });

  test("a key named like an object's own property is not a field", async () => {
    const engine = await glass();
    await expect(engine.commit({ holons: [{ id: newId(), instance: [NOTE], body: { title: "x", constructor: 1 } }] })).rejects.toThrow(
      "constructor is not a field",
    );
  });

  test("a name must give a holon in the field", async () => {
    const engine = await glass();
    await expect(engine.commit({ holons: [], names: { ghost: newId() } })).rejects.toThrow("not in the field");
  });

  test("a prose link with a title is a reference too", async () => {
    const engine = await glass();
    await expect(engine.commit({ holons: [{ id: newId(), instance: [NOTE], body: { title: "x", prose: `[it](ref:${newId()} "t")` } }] })).rejects.toThrow(
      "not in the field",
    );
  });

  test("a pinned version must be a version of what it pins", async () => {
    const engine = await glass();
    const pin = { $ref: NOTE, "@": `sha256-${"0".repeat(64)}` };
    await expect(engine.commit({ holons: [{ id: newId(), instance: [NOTE], body: { title: "x", about: pin } }] })).rejects.toThrow("pins");
    const real = ((await engine.read({ holon: NOTE })) as unknown as HolonRead).version;
    expect(await engine.commit({ holons: [{ id: newId(), instance: [NOTE], body: { title: "x", about: { $ref: NOTE, "@": real } } }] })).toBeDefined();
  });

  test("commits made together are taken in turn", async () => {
    const engine = await glass();
    const a = newId();
    const results = await Promise.all([
      engine.commit({ holons: [{ id: a, instance: [NOTE], body: { title: "A" } }] }),
      engine.commit({ holons: [{ id: newId(), instance: [NOTE], body: { title: "B", about: { $ref: a } } }] }),
    ]);
    expect(results.every(Boolean)).toBe(true);
  });

  test("attaching a store tells whoever listens", async () => {
    const engine = new Engine(new Store(new MemoryBackend()));
    await engine.start();
    let told = 0;
    engine.onChange(() => told++);
    const store = new Store(new MemoryBackend());
    await store.write({ at: "t", holons: [typeType] });
    await engine.attach("glass", store);
    expect(told).toBe(1);
  });
});

describe("taking holons out of the field", () => {
  test("a holon the home holds may go, once nothing points at it", async () => {
    const engine = await glass();
    const a = newId();
    const b = newId();
    await engine.commit({
      holons: [
        { id: a, instance: [NOTE], body: { title: "A" } },
        { id: b, instance: [NOTE], body: { title: "B", about: { $ref: a } } },
      ],
    });
    await expect(engine.commit({ holons: [], gone: [a] })).rejects.toThrow(`${b} still references ${a}`);
    expect(await engine.commit({ holons: [], gone: [a, b] })).toBeDefined();
    expect(await engine.read({ holon: a })).toBeNull();
    expect(await engine.read({ holders: a })).toEqual([]);
  });

  test("a holon a pulled store holds may not go", async () => {
    const engine = await glass();
    await expect(engine.commit({ holons: [], gone: [NOTE] })).rejects.toThrow("only read");
  });
});
