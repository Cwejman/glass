import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentOf, hashOf, partOf } from "../act.ts";
import type { Act, Head, Holon, Question, Store } from "../store.ts";
import { indexNow, latestCommit } from "./head.ts";
import { rebuild } from "./rebuild.ts";
import { folderStorages } from "./storage/folder.ts";
import { strata } from "./strata.ts";

const made: string[] = [];
afterAll(() => made.forEach((at) => rmSync(at, { recursive: true, force: true })));

function folder() {
  const at = mkdtempSync(join(tmpdir(), "glass-catchup-"));
  made.push(at);
  return at;
}

const id = (n: number) => String(n).padStart(15, "0");
let acts = 0;

async function act(over: Head | null, holons: Holon[], gone: string[] = []): Promise<Act> {
  const part = partOf(holons);
  const said = {
    when: new Date(acts++).toISOString(),
    at: [] as Act["at"],
    says: "a test",
    gone,
    parts: [["here", part && (await hashOf(part))]] as Act["parts"],
  };

  return {
    ...said,
    hash: await hashOf(contentOf(said)),
    own: "here",
    holons,
    born: [],
    over,
    touches: { ids: [...holons.map((holon) => holon.id), ...gone], addresses: [] },
  };
}

// A store's history of a dozen acts: notes written, held, renamed, rewritten and let go,
// and every head it had.
async function written(at: string, from = 0, over: Head | null = null, count = 12) {
  const store = strata(folderStorages(at));
  const heads: Head[] = [];
  let head = over;

  for (let n = from; n < from + count; n++) {
    const note = { id: id(n), instance: [id(100)], name: `n${n}`, body: { text: `word${n} shared` } };
    const holds = {
      id: id(1000),
      instance: [id(101)],
      name: "Home",
      body: { parts: [{ $ref: id(n), $holds: true }] },
    };
    const renamed =
      n > 0 ? [{ ...note, id: id(n - 1), name: `renamed${n}`, body: { text: `again${n}` } }] : [];
    const reply = await store.offer(
      await act(head, [note, holds, ...renamed], n % 5 === 4 ? [id(n - 3)] : []),
    );
    if (!("accepted" in reply)) throw new Error(`not accepted: ${JSON.stringify(reply)}`);
    heads.push((head = reply.accepted));
  }

  return heads;
}

// What a store answers at each head: holons, by id and address, facts, words, versions
// and acts.
async function answers(store: Store, heads: Head[]) {
  const asked: Question[] = [
    ...Array.from({ length: 14 }, (_, n) => ({ holon: id(n) })),
    { holons: [id(1), id(5), id(1000)] },
    { address: [id(1000), "n3"] },
    { address: [id(1000), "renamed4"] },
    { whole: { id: id(1000) } },
    { facts: { a: "instance", v: { $ref: id(100) } } },
    { facts: { v: { $ref: id(6) } } },
    { said: { a: "text", word: "shared" } },
    { said: { a: "text", word: "again7" } },
    { versions: id(3) },
    { acts: {} },
  ];
  const decoded = async (head: Head, question: Question) =>
    new TextDecoder().decode(await store.read(head, question));
  return Promise.all(heads.map((head) => Promise.all(asked.map((question) => decoded(head, question)))));
}

test("an index rebuilt from the history alone reads as the one the acts wrote, at the same commit", async () => {
  const at = folder();
  const heads = await written(at);
  const before = await answers(strata(folderStorages(at)), heads);
  const latest = await latestCommit(folderStorages(at).history);

  const copy = folder();
  cpSync(at, copy, { recursive: true });
  const rebuilt = await rebuild(copy);

  expect(rebuilt!.commit).toBe(latest!);
  expect(await latestCommit(folderStorages(copy).history)).toBe(latest);
  expect(await answers(strata(folderStorages(copy)), heads)).toEqual(before);
});

test("a store with its index deleted opens and reads as it did", async () => {
  const at = folder();
  const heads = await written(at);
  const before = await answers(strata(folderStorages(at)), heads);

  rmSync(join(at, "index"), { recursive: true });
  const store = strata(folderStorages(at));

  expect(await answers(store, heads)).toEqual(before);
  expect((await indexNow(folderStorages(at).index))!.commit).toBe(heads.at(-1)!.commit);
});

test("an index behind by some commits catches up, on reading and on offering", async () => {
  const at = folder();
  const early = await written(at, 0, null, 6);
  const behind = folder();
  cpSync(join(at, "index"), behind, { recursive: true });

  const late = await written(at, 6, early.at(-1)!, 6);
  const heads = [...early, ...late];
  const before = await answers(strata(folderStorages(at)), heads);

  // The index as it stood six commits ago, under the history as it stands.
  const reading = folder();
  cpSync(at, reading, { recursive: true });
  rmSync(join(reading, "index"), { recursive: true });
  cpSync(behind, join(reading, "index"), { recursive: true });
  expect((await indexNow(folderStorages(reading).index))!.commit).toBe(early.at(-1)!.commit);

  expect(await answers(strata(folderStorages(reading)), heads)).toEqual(before);
  expect((await indexNow(folderStorages(reading).index))!.commit).toBe(late.at(-1)!.commit);

  // Behind again, then offered to: the act is judged over the index caught up first.
  rmSync(join(reading, "index"), { recursive: true });
  cpSync(behind, join(reading, "index"), { recursive: true });
  const store = strata(folderStorages(reading));
  const stale = await store.offer(await act(early.at(-1)!, [{ id: id(7), instance: [id(100)], body: {} }]));
  expect(stale).toEqual({ changed: late.at(-1)! });

  const [next] = await written(reading, 20, late.at(-1)!, 1);
  expect(await answers(store, heads)).toEqual(before);
  expect(new TextDecoder().decode(await store.read(next!, { holon: id(20) }))).toContain("word20");
});

test("an index of a history that was replaced is begun again from the history", async () => {
  const [one, other] = [folder(), folder()];
  await written(one, 0, null, 8);
  const heads = await written(other, 0, null, 5);
  const before = await answers(strata(folderStorages(other)), heads);

  rmSync(join(other, "index"), { recursive: true });
  cpSync(join(one, "index"), join(other, "index"), { recursive: true });

  expect(await answers(strata(folderStorages(other)), heads)).toEqual(before);
});
