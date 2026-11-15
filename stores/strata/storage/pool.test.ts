import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { folderStorage } from "./folder.ts";
import { pooled } from "./pool.ts";

const folder = mkdtempSync(join(tmpdir(), "glass-pool-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

test("reads through the pool are the storage's reads, however they fall across pages", async () => {
  const storage = folderStorage(folder);
  const bytes = Uint8Array.from({ length: 4096 * 5 + 1234 }, (_, i) => (i * 31) % 251);
  const name = await storage.put(bytes);
  const pool = pooled(storage, 3 * 4096);

  let seed = 11;
  const next = (below: number) => (seed = (seed * 48271) % 2147483647) % below;
  for (let i = 0; i < 500; i++) {
    const offset = next(bytes.length);
    const length = 1 + next(3 * 4096);
    expect(await pool.read(name, offset, length)).toEqual(await storage.read(name, offset, length));
  }
  expect(await pool.read(name)).toEqual(bytes);
});
