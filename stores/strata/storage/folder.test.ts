import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { count } from "./fixtures/count.ts";
import { folderStorage } from "./folder.ts";

const made: string[] = [];
const folder = () => {
  const at = mkdtempSync(join(tmpdir(), "glass-storage-"));
  made.push(at);
  return at;
};
afterAll(() => made.forEach((at) => rmSync(at, { recursive: true, force: true })));

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("blobs", () => {
  test("a blob is named by its bytes, and written once", async () => {
    const storage = folderStorage(folder());
    const name = await storage.put(bytes("a page"));

    expect(name).toMatch(/^[0-9a-f]{64}$/);
    expect(await storage.put(bytes("a page"))).toBe(name);
    expect(text(await storage.read(name))).toBe("a page");
  });

  test("part of a blob is read from an offset", async () => {
    const storage = folderStorage(folder());
    const name = await storage.put(bytes("0123456789"));

    expect(text(await storage.read(name, 3, 4))).toBe("3456");
    expect(text(await storage.read(name, 7))).toBe("789");
  });

  test("a blob removed is gone", async () => {
    const storage = folderStorage(folder());
    const name = await storage.put(bytes("lost the race"));

    await storage.remove(name);
    await expect(storage.read(name)).rejects.toThrow();
  });
});

describe("the head", () => {
  test("starts empty, and moves only from what it holds", async () => {
    const storage = folderStorage(folder());
    const [a, b] = [await storage.put(bytes("a")), await storage.put(bytes("b"))];

    expect(await storage.head()).toBeNull();
    expect(await storage.moveHead(null, a)).toBe(true);
    expect(await storage.moveHead(null, b)).toBe(false);
    expect(await storage.moveHead(a, b)).toBe(true);
    expect(await storage.head()).toBe(b);
  });

  test("of writers racing in one process, exactly one moves it", async () => {
    const storage = folderStorage(folder());
    const names = await Promise.all(Array.from({ length: 20 }, (_, i) => storage.put(bytes(`${i}`))));

    const moved = await Promise.all(names.map((name) => storage.moveHead(null, name)));
    expect(moved.filter(Boolean)).toHaveLength(1);
  });

  test("processes counting in one folder lose no step", async () => {
    const at = folder();
    const script = join(import.meta.dir, "fixtures/count.ts");
    const counting = [1, 2, 3].map(() => Bun.spawn(["bun", script, at, "40"]).exited);

    await Promise.all([...counting, count(folderStorage(at), 40)]);

    const storage = folderStorage(at);
    expect(text(await storage.read((await storage.head())!))).toBe("160");
  }, 30000);

  test("a lock left by a process that died is taken over", async () => {
    const at = folder();
    const storage = folderStorage(at);
    writeFileSync(join(at, "head.lock"), "999999");

    expect(await storage.moveHead(null, await storage.put(bytes("after a crash")))).toBe(true);
  });

  test("a move by another process is heard", async () => {
    const at = folder();
    const watching = folderStorage(at);
    const heard: (string | null)[] = [];
    const stop = watching.watchHead((head) => heard.push(head));
    await settle();

    const other = folderStorage(at);
    const name = await other.put(bytes("moved elsewhere"));
    await other.moveHead(null, name);
    await settle();

    expect(heard).toEqual([name]);
    stop();
  });
});
