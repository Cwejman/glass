// The format's vectors, and what must be refused. Each test writes into a
// directory of its own and reads it back through the files alone.

import { expect, test } from "bun:test";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commit, land, nextName, open, sha, type Holon } from "./blocks.ts";

const vectors = JSON.parse(readFileSync(join(import.meta.dir, "vectors/format.json"), "utf8"));
const fresh = () => mkdtempSync(join(tmpdir(), "glass-format-"));
const texts = async (s: any) => Object.fromEntries([...(await s.holons())].map(([id, x]: any) => [id, x.holon.body.text]));
const logOf = (d: string) => readFileSync(join(d, "log/0.jsonl"), "utf8").trim().split("\n");
async function build(upTo = vectors.steps.length) {
  const d = fresh();
  for (const st of vectors.steps.slice(0, upTo)) await commit(await open(d), st.holons, st.says, st.at, st.gone);
  return d;
}

test("each step writes these bytes and reads back as this field", async () => {
  const d = fresh();
  for (const st of vectors.steps) {
    await commit(await open(d), st.holons, st.says, st.at, st.gone);
    for (const [h, t] of Object.entries(st.blocks)) expect(readFileSync(join(d, "blocks", `${h}.jsonl`), "utf8")).toBe(t as string);
    expect(logOf(d)).toEqual(st.log);
    expect(readFileSync(join(d, "refs/main"), "utf8")).toBe(st.ref);
    expect(await texts(await open(d))).toEqual(st.field);
  }
});

test("a name counts up, carrying across its last characters", () => {
  for (const [a, b] of vectors.names.next) expect(nextName(a)).toBe(b);
});

test("the field at any commit, and any holon's versions, stay readable", async () => {
  const s = await open(await build());
  for (const [i, want] of Object.entries(vectors.history)) {
    const got = await s.fieldAt(Number(i));
    expect(Object.fromEntries([...got].map(([id, x]: any) => [id, x.holon.body.text]))).toEqual(want as any);
  }
  expect((await s.versions(vectors.versions.id)).map((l) => l.body.text)).toEqual(vectors.versions.texts);
});

test("a copy written apart lands without changing its blocks", async () => {
  const v = vectors.land;
  const apart = await build(v.from);
  await commit(await open(apart), v.holons, v.says, v.at);
  const here = await build();
  const out = await land(await open(here), apart);
  expect(out.landed).toBe(1);
  expect(logOf(here)).toEqual(v.log);
  expect(readFileSync(join(here, "refs/main"), "utf8")).toBe(v.ref);
  for (const [h, t] of Object.entries(v.block)) expect(readFileSync(join(here, "blocks", `${h}.jsonl`), "utf8")).toBe(t as string);
  expect(await texts(await open(here))).toEqual(v.field);
});

test("two copies that changed one holon stop and ask", async () => {
  const id = vectors.versions.id, T = vectors.steps[0].holons[0].id;
  const apart = await build(1);
  await commit(await open(apart), [{ id, instance: [T], body: { text: "the other edit" } }], "apart");
  await expect(land(await open(await build()), apart)).rejects.toThrow("both copies changed");
});

test("a commit refuses a stale store and new names that are not one run", async () => {
  const d = await build();
  const s = await open(d);
  await commit(await open(d), [{ id: s.mint(), instance: [], body: {} }], "ahead");
  await expect(commit(s, [], "stale")).rejects.toThrow("the store moved");
  const n = await open(d);
  const a = n.mint(); n.mint(); const c = n.mint();
  await expect(commit(n, [{ id: a, instance: [], body: {} }, { id: c, instance: [], body: {} }], "gap")).rejects.toThrow("not one run");
});

test("what is forged or damaged is caught", async () => {
  // A byte of a block.
  let d = await build();
  const hash = Object.keys(vectors.steps[1].blocks)[0]!;
  const p = join(d, "blocks", `${hash}.jsonl`);
  writeFileSync(p, readFileSync(p, "utf8").replace("three", "thrее"));
  await expect((await open(d)).holons()).rejects.toThrow("does not match");
  // A line of the log.
  d = await build();
  writeFileSync(join(d, "log/0.jsonl"), readFileSync(join(d, "log/0.jsonl"), "utf8").replace("first", "forged"));
  await expect(open(d)).rejects.toThrow();
  // A log newer than its ref is fine to read only up to where the chain and ref agree.
  d = await build();
  appendFileSync(join(d, "log/0.jsonl"), logOf(d)[1] + "\n");
  await expect(open(d)).rejects.toThrow();
  // A ref naming nothing.
  d = await build();
  writeFileSync(join(d, "refs/main"), "f".repeat(64) + " 0\n");
  await expect(open(d)).rejects.toThrow("names no line");
});

test("past a block's size the log opens a volume whose checkpoint alone reads the field", async () => {
  const d = fresh();
  let s = await open(d);
  const big = "word ".repeat(3000);
  const T = s.mint();
  await commit(s, [{ id: T, instance: [], body: { text: "type" } }], "first");
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) { s = await open(d); const id = s.mint(); ids.push(id); await commit(s, [{ id, instance: [T], body: { text: `${i}` } }], big + i); await Bun.sleep(2); }
  expect(readdirSync(join(d, "log")).length).toBeGreaterThan(1);
  const copy = fresh();
  cpSync(d, copy, { recursive: true });
  // Nothing older than the open volume is needed for the latest field.
  const openVolume = (await open(copy)).volume;
  for (const f of readdirSync(join(copy, "log"))) if (f !== `${openVolume}.jsonl`) rmSync(join(copy, "log", f));
  const got = await (await open(copy)).holons();
  expect([...got.keys()].sort()).toEqual([T, ...ids].sort());
  expect(existsSync(join(copy, "log/0.jsonl"))).toBe(false);
  // And the whole log still checks, with every commit readable.
  const full = await open(d);
  const log = await full.history();
  expect(log.length).toBe(7);
  expect((await full.fieldAt(3)).size).toBe(4);
  expect(sha(log[log.length - 1]!.text)).toBe(full.head!);
});

test("a commit larger than a block is cut, its new names still found", async () => {
  const d = fresh();
  const s = await open(d);
  const hs: Holon[] = Array.from({ length: 400 }, (_, i) => ({ id: s.mint(), instance: [], body: { text: `${i} ${"x".repeat(500)}` } }));
  const out = await commit(s, hs, "large");
  expect(out.blocks).toBeGreaterThan(1);
  const r = await open(d);
  expect((await r.holons()).size).toBe(400);
  for (const h of [hs[0]!, hs[200]!, hs[399]!]) expect((await r.get(h.id))?.body.text).toBe(h.body.text);
  expect(await r.get("0".repeat(15))).toBe(null);
});
