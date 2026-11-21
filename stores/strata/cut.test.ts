// The cut over a small field of the old format: glass's types and root, a main store whose
// root comes after its wholes, a lexicon to strip, a word moved from one whole to another,
// a commit main and paper share, and one that writes only the lexicon.

import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryFiles } from "../../integrations/glass/files.ts";
import { act, commit, idAt, openStore, type Store as OldStore } from "../../integrations/glass/store.ts";
import type { Holon } from "../store.ts";
import { cut, type Plan } from "./cut.ts";
import { commitAt, headAt, latestCommit } from "./head.ts";
import { parity } from "./parity.ts";
import { folderStorages } from "./storage/folder.ts";
import { strata } from "./strata.ts";

const made: string[] = [];
afterAll(() => made.forEach((at) => rmSync(at, { recursive: true, force: true })));

const folder = () => {
  const at = mkdtempSync(join(tmpdir(), "glass-cut-"));
  made.push(at);
  return at;
};

// Each commit's new ids are one run at a moment of its own, as the old format mints them.
const moment = (n: number) => Date.parse("2026-11-01T00:00:00.000Z") + n * 60_000;
const at = (n: number) => new Date(moment(n)).toISOString();
const id = (n: number, count: number) => idAt(moment(n), count);
const ref = (to: string) => ({ $ref: to });
const held = (to: string) => ({ $ref: to, $holds: true });

const glass = {
  store: id(1, 0),
  dependency: id(1, 1),
  types: id(1, 2),
  root: id(1, 3),
};
const main = {
  word: id(2, 0),
  lexeme: id(2, 1),
  lexicon: id(2, 2),
  page: id(2, 3),
  entry: id(2, 4),
  types: id(2, 5),
  theLexicon: id(2, 6),
  aLexeme: id(2, 7),
  notes: id(2, 8),
  one: id(2, 9),
  moving: id(2, 10),
  document: id(2, 11),
  root: id(3, 0),
  onGlass: id(3, 1),
  journal: id(3, 2),
  three: id(3, 3),
  another: id(5, 0),
  four: id(6, 0),
};
const paper = { root: id(6, 1), onMain: id(6, 2), onGlass: id(6, 3), document: id(6, 4) };

const type = (at: string, name: string, mould: Holon["mould"]): Holon => ({
  id: at,
  instance: [],
  name,
  mould,
  body: {},
});
const word = (at: string, text: string, lexeme?: string): Holon => ({
  id: at,
  instance: [main.word],
  body: { text, ...(lexeme && { lexeme: ref(lexeme) }) },
});
const whole = (at: string, of: string, name: string, words: string[]): Holon => ({
  id: at,
  instance: [of],
  name,
  body: { words: words.map(ref) },
});
const lexicon = (lexemes: string[]): Holon => ({
  id: main.theLexicon,
  instance: [main.lexicon],
  name: "lexicon",
  body: { lexemes: lexemes.map(ref) },
});
const root = (at: string, name: string, contents: string[], dependencies: string[] = []): Holon => ({
  id: at,
  instance: [glass.store],
  name,
  body: { contents: contents.map(ref), ...(dependencies.length && { dependencies: dependencies.map(ref) }) },
});
const dependency = (at: string, name: string): Holon => ({
  id: at,
  instance: [glass.dependency],
  name,
  body: {},
});

async function oldField() {
  let glassStore = await openStore(memoryFiles());
  let mainStore = await openStore(memoryFiles());
  let paperStore = await openStore(memoryFiles());
  const words = { text: { says: "", shape: "string" } };

  glassStore = (
    await commit(glassStore, {
      at: at(1),
      says: "glass begun",
      holons: [
        type(glass.store, "store", {
          contents: { says: "", shape: { set: "ref" }, holds: true },
          dependencies: { says: "", shape: { set: "ref" }, holds: true, optional: true },
        }),
        type(glass.dependency, "dependency", {}),
        {
          id: glass.types,
          instance: [],
          name: "types",
          body: { holds: [held(glass.store), held(glass.dependency)] },
        },
        root(glass.root, "glass", [glass.types]),
      ],
    })
  ).store;

  const wordsOf = { words: { says: "", shape: { list: "ref" }, holds: true } };
  mainStore = (
    await commit(mainStore, {
      at: at(2),
      says: "the notes begun, before there were roots",
      holons: [
        type(main.word, "word", { ...words, lexeme: { says: "", shape: "ref", optional: true } }),
        type(main.lexeme, "lexeme", words),
        type(main.lexicon, "lexicon", { lexemes: { says: "", shape: { set: "ref" }, holds: true } }),
        type(main.page, "page", wordsOf),
        type(main.entry, "entry", wordsOf),
        type(main.document, "document", wordsOf),
        {
          id: main.types,
          instance: [],
          name: "types",
          body: {
            holds: [main.word, main.lexeme, main.lexicon, main.page, main.entry, main.document].map(held),
          },
        },
        lexicon([main.aLexeme]),
        { id: main.aLexeme, instance: [main.lexeme], body: { text: "one" } },
        whole(main.notes, main.page, "notes", [main.one, main.moving]),
        word(main.one, "one", main.aLexeme),
        word(main.moving, "moving"),
      ],
    })
  ).store;

  mainStore = (
    await commit(mainStore, {
      at: at(3),
      says: "a root, and a journal",
      holons: [
        root(main.root, "main", [main.notes, main.theLexicon, main.types, main.journal], [main.onGlass]),
        dependency(main.onGlass, "glass"),
        whole(main.journal, main.entry, "journal", [main.three]),
        word(main.three, "three", main.aLexeme),
      ],
    })
  ).store;

  mainStore = (
    await commit(mainStore, {
      at: at(4),
      says: "a word moved into the journal",
      holons: [
        whole(main.notes, main.page, "notes", [main.one]),
        whole(main.journal, main.entry, "journal", [main.three, main.moving]),
      ],
    })
  ).store;

  mainStore = (
    await commit(mainStore, {
      at: at(5),
      says: "the lexicon grew",
      holons: [
        lexicon([main.aLexeme, main.another]),
        { id: main.another, instance: [main.lexeme], body: { text: "two" } },
      ],
    })
  ).store;

  const shared = await act(
    [
      {
        store: mainStore,
        name: "main",
        holons: [whole(main.notes, main.page, "notes", [main.one, main.four]), word(main.four, "four")],
      },
      {
        store: paperStore,
        name: "paper",
        holons: [
          root(paper.root, "paper", [paper.document], [paper.onMain, paper.onGlass]),
          dependency(paper.onMain, "main"),
          dependency(paper.onGlass, "glass"),
          whole(paper.document, main.document, "the document", [main.one]),
        ],
      },
    ],
    { says: "shared", at: at(6), born: [main.four, ...Object.values(paper)] },
  );
  [mainStore, paperStore] = shared.stores as [OldStore, OldStore];

  mainStore = (
    await commit(mainStore, {
      at: at(7),
      says: "a word let go",
      holons: [whole(main.journal, main.entry, "journal", [main.moving])],
      gone: [main.three],
    })
  ).store;

  return new Map([
    ["main", mainStore],
    ["glass", glassStore],
    ["paper", paperStore],
  ]);
}

const plan: Plan = {
  stores: [
    { name: "glass", root: { from: glass.root, id: glass.root }, types: glass.types, stands: [] },
    {
      name: "wiki",
      root: { from: main.root, id: main.root },
      types: main.types,
      stands: [{ name: "glass", id: main.onGlass }, { name: "author" }],
    },
    { name: "author", root: { from: main.root }, stands: [{ name: "glass" }, { name: "wiki" }] },
    {
      name: "paper",
      root: { from: paper.root, id: paper.root },
      stands: [{ name: "glass", id: paper.onGlass }],
    },
  ],
  wholes: {
    [main.theLexicon]: null,
    [main.notes]: "wiki",
    [main.journal]: "author",
    [main.onGlass]: "wiki",
    [paper.onMain]: null,
  },
  homes: { main: "wiki", glass: "glass", paper: "paper" },
  pooled: [main.types],
  typed: { [main.word]: "glass", [main.lexeme]: null, [main.lexicon]: null },
  common: "glass",
  keys: { [main.word]: ["lexeme"] },
  dependency: glass.dependency,
};

// Every holon a cut store keeps at head, by id, and the acts it took, newest first.
async function kept(into: string, name: string) {
  const { history, index } = folderStorages(join(into, name));
  const store = strata({ history, index });
  const latest = (await latestCommit(history))!;
  const head = await headAt(history, latest);
  const own = (await commitAt(history, latest)).own;
  const lines = async (question: Parameters<typeof store.read>[1]) =>
    new TextDecoder()
      .decode(await store.read(head, question))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

  const holons = new Map<string, Holon>(
    (await lines({ whole: { id: own } })).map((holon) => [holon.id, holon]),
  );
  return { root: own, head, holons, acts: (await lines({ acts: {} })) as { hash: string; says: string }[] };
}

test("the union of the cut stores at head is the old field, but what is stripped", async () => {
  const old = await oldField();
  const into = folder();
  await cut(old, plan, into);

  expect((await parity(old, plan, into)).differs).toEqual([]);
});

test("each holon is placed by the whole it last stood in, each type with its instances", async () => {
  const into = folder();
  await cut(await oldField(), plan, into);
  const [glassCut, wiki, author] = await Promise.all(
    ["glass", "wiki", "author"].map((name) => kept(into, name)),
  );

  expect([...wiki.holons.keys()]).toContain(main.one);
  expect([...author.holons.keys()]).toEqual(expect.arrayContaining([main.journal, main.moving]));
  expect(wiki.holons.has(main.moving)).toBe(false);
  expect(wiki.holons.get(main.types)!.body.holds).toEqual([held(main.page)]);
  expect(glassCut.holons.get(glass.types)!.body.holds).toEqual(
    [glass.store, glass.dependency, main.word].map(held),
  );

  const typesOf = ({ root, holons }: Awaited<ReturnType<typeof kept>>) =>
    (holons.get(root)!.body.contents as { $ref: string }[])
      .map(({ $ref }) => holons.get($ref)!)
      .find(({ name }) => name === "types")!.body.holds;
  expect(typesOf(author)).toEqual([held(main.entry)]);
  expect(typesOf(await kept(into, "paper"))).toEqual([held(main.document)]);
  const authorRoot = author.holons.get(author.root)!;
  expect(authorRoot.name).toBe("author");
  expect(wiki.holons.get(main.root)!.name).toBe("wiki");
});

test("the lexicon is cut out of history, and a commit that wrote only it is dropped", async () => {
  const into = folder();
  const { spent } = await cut(await oldField(), plan, into);
  const stores = await Promise.all(["glass", "wiki", "author", "paper"].map((name) => kept(into, name)));

  expect(spent.dropped).toBe(1);
  expect(stores.flatMap(({ acts }) => acts.map(({ says }) => says))).not.toContain("the lexicon grew");
  for (const { holons } of stores) {
    expect(holons.has(main.theLexicon) || holons.has(main.aLexeme) || holons.has(main.lexeme)).toBe(false);
    for (const holon of holons.values()) expect(holon.body.lexeme).toBeUndefined();
  }
  expect(stores[0]!.holons.get(main.word)!.mould).not.toHaveProperty("lexeme");
});

test("a commit two old stores shared is one act, with one hash, in each store given a share", async () => {
  const into = folder();
  await cut(await oldField(), plan, into);
  const [wiki, paperCut] = await Promise.all(["wiki", "paper"].map((name) => kept(into, name)));

  const shared = [wiki, paperCut].map(({ acts }) => acts.find(({ says }) => says === "shared")!.hash);
  expect(shared[0]).toBe(shared[1]!);
  expect(paperCut.holons.has(paper.onMain)).toBe(false);
});

test("the cut run again makes the same history", async () => {
  const old = await oldField();
  const [first, second] = [folder(), folder()];
  await cut(old, plan, first);
  await cut(old, plan, second);

  for (const name of ["glass", "wiki", "author", "paper"])
    expect((await kept(second, name)).head).toEqual((await kept(first, name)).head);
});
