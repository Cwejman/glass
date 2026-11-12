// The kernel grounded in real cases over the real stores. Each case is a question one
// would ask of the field, written in the language as code writes it, asked of one engine
// over the stores, and answered a second time apart from it, in plain code over the
// holons, so the engine has to earn every answer.

import { describe, expect, test } from "bun:test";
import { namesAsked } from "../../language/names.ts";
import { parse } from "../../language/text.ts";
import type { Holon, Store } from "../../integrations/glass/store.ts";
import { holonsOf, openStores } from "../../stores.ts";
import { startEngine } from "../compat.ts";
import type { Looking as Expression } from "../compat.ts";
import { wordsOf as cut } from "./patterns/words.ts";

const opened: Record<string, Store> = await openStores();
const engine = startEngine(Object.entries(opened).map(([key, store]) => ({ key, store })));

// Asking, in the language, as engine/ask.ts does: the text read by the names the engine
// gives for it. What is put into the text is put in as a value: a holon given as { $ref }
// is that holon, anything else as JSON says it.
type Ref = { $ref: string };
const isRef = (value: unknown): value is Ref =>
  typeof value === "object" && value !== null && typeof (value as Ref).$ref === "string";
const put = (value: unknown) => (isRef(value) ? `(@${value.$ref})` : JSON.stringify(value));

async function written(parts: TemplateStringsArray, ...given: unknown[]) {
  const text = parts.reduce((text, part, i) => text + put(given[i - 1]) + part);
  return parse(text, await namesAsked(engine.read, text));
}

const ask = async (parts: TemplateStringsArray, ...given: unknown[]) =>
  engine.read({ value: await written(parts, ...given) });
const at = (id: string) => ({ $ref: id });
const ids = (value: unknown) => (value as Ref[]).map(({ $ref }) => $ref);

// Answering apart: the holons as the stores keep them, each once, from the first store
// that keeps it, and what holds each, read through the moulds of its types.
type Kept = Holon & { store: string };
const holons: Kept[] = [];
const known = new Map<string, Kept>();

for (const [store, kept] of Object.entries(opened))
  for (const holon of await holonsOf(kept))
    if (!known.has(holon.id)) {
      known.set(holon.id, { ...holon, store });
      holons.push(known.get(holon.id)!);
    }

const typeNamed = (name: string) => holons.find((h) => h.mould && h.name === name && h.store === "main")!.id;
const named = (name: string, type?: string) =>
  holons.find((h) => h.name === name && (!type || h.instance.includes(typeNamed(type))))!;
const mouldOf = (h: Holon): Record<string, { holds?: boolean }> =>
  Object.assign({}, ...h.instance.map((t) => (known.get(t)?.mould ?? {}) as object));

// Every reference in a holon's body, under its top key, holding as it says or as its
// mould says.
function referencesOf(h: Holon) {
  const mould = mouldOf(h);
  const found: { id: string; key: string; holds: boolean }[] = [];
  const walk = (value: unknown, key: string): void => {
    if (Array.isArray(value)) value.forEach((item) => walk(item, key));
    else if (isRef(value))
      found.push({
        id: value.$ref,
        key,
        holds: (value as { $holds?: boolean }).$holds ?? mould[key]?.holds === true,
      });
    else if (typeof value === "object" && value !== null)
      Object.values(value).forEach((inner) => walk(inner, key));
  };
  for (const [key, value] of Object.entries(h.body)) walk(value, key);
  return found;
}

const holders = new Map<string, { from: string; key: string; holds: boolean }[]>();
for (const h of holons)
  for (const { id, key, holds } of referencesOf(h))
    holders.set(id, [...(holders.get(id) ?? []), { from: h.id, key, holds }]);

const partsOfHolon = (id: string) =>
  referencesOf(known.get(id)!)
    .filter(({ holds }) => holds)
    .map(({ id }) => id);
const instancesOf = (type: string) => holons.filter((h) => h.instance.includes(type)).map((h) => h.id);
const sameSet = (a: string[], b: string[]) => expect([...new Set(a)].sort()).toEqual([...new Set(b)].sort());

describe("cases from OpenLight, in glass's field", () => {
  test("a thread: the line a fork came from, followed by its link", async () => {
    const fork = named("A fork on the paper's licence, ended by the author");
    const line = (await ask`follow(${at(fork.id)}, x => out(x) | filter(e => eq(e.key, "forkedFrom")))`) as {
      to: { $ref: string };
      key: string;
    }[];

    const truth: string[] = [];
    for (let at = fork.body.forkedFrom; at; at = known.get(at.$ref)?.body.forkedFrom) truth.push(at.$ref);

    expect(line.map(({ to }) => to.$ref)).toEqual(truth);
    expect(line.every(({ key }) => key === "forkedFrom")).toBe(true);
  });

  test("a capped walk: the work tree one level down only", async () => {
    const walked = (await ask`follow(@Sessions, x => out(x) | filter(e => e.holds), {depth: 1})`) as {
      depth: number;
    }[];

    expect(walked.length).toBe(partsOfHolon(named("Sessions").id).length);
    expect(walked.every(({ depth }) => depth === 1)).toBe(true);
  });

  test("a review queue: what is measured and not yet resolved", async () => {
    const measured = named("measured");
    const open = await ask`@measured.measures | filter(m => not(eq(m.as, "resolved")))`;

    const truth = (measured.body.measures as { $ref: string }[]).filter(
      ({ $ref }) => known.get($ref)!.body.as !== "resolved",
    );
    expect(ids(open)).toEqual(truth.map(({ $ref }) => $ref));
  });

  test("the prompts only: a session's utterances in the author's voice", async () => {
    const sixth = holons.find((h) => h.name?.startsWith("A sixth session"))!;
    const author = named("The author", "voice");
    const theirs = await ask`${at(sixth.id)}.said | filter(u => eq(u.voice, @"The author"))`;

    const truth = (sixth.body.said as { $ref: string }[])
      .map(({ $ref }) => known.get($ref)!)
      .filter((u) => u.body.voice?.$ref === author.id);
    expect(ids(theirs)).toEqual(truth.map(({ id }) => id));
  });

  test("intersection: what is both a brief and a step", async () => {
    const both = await ask`and(type(@types/brief), type(@types/step))`;
    sameSet(
      ids(both),
      instancesOf(typeNamed("brief")).filter((id) => instancesOf(typeNamed("step")).includes(id)),
    );
  });

  test("search: what says a word, the index's case", async () => {
    const found = ids(await ask`search("holarchy")`);
    expect(found.length).toBeGreaterThan(0);
    for (const id of found.slice(0, 20)) expect((await ask`says(${at(id)})`) as string).toContain("holarchy");
  });

  test("search never finds a lexicon, which holds lexemes, not words", async () => {
    const lexicons: string[] = [];
    for (const id of ids(await ask`search("holarchy")`))
      if ((await ask`${at(id)}.lexemes`) !== null) lexicons.push(id);
    expect(lexicons).toEqual([]);
  });

  test("a word said is found whatever its case, where the exact string is not", async () => {
    const said = ((await ask`find(?w, said(?w, "text", "Glass"))`) as unknown[]).length;
    const exact = ((await ask`find(?w, [?w, "text", "glass"])`) as unknown[]).length;
    expect(said).toBeGreaterThan(exact);
  });

  test("a word said is one word, and is said only within a pattern", async () => {
    await expect(ask`find(?w, said(?w, "text", "glass engine"))`).rejects.toThrow(/one word/);
    await expect(ask`said(@"The wiki", "name", "wiki")`).rejects.toThrow(/clause of a pattern/);
  });

  test("the lexicon: every word the field says, each once", async () => {
    const lexicon = (await ask`lexicon()`) as string[];
    expect(lexicon).toContain("holarchy");
    expect(new Set(lexicon).size).toBe(lexicon.length);
  });

  test("order and a window: the two latest sessions", async () => {
    const sessions = named("Sessions");
    const latest = await ask`@Sessions.sessions | sort(s => s.on) | reverse | take(2)`;

    const truth = [...(sessions.body.sessions as { $ref: string }[])]
      .map(({ $ref }) => known.get($ref)!)
      .sort((a, b) => (a.body.on < b.body.on ? -1 : a.body.on > b.body.on ? 1 : 0))
      .reverse()
      .slice(0, 2);
    expect(ids(latest)).toEqual(truth.map(({ id }) => id));
  });

  test("history as values: what the store's last commit says", async () => {
    const log = (await engine.read({ log: "main" }))!;
    expect(await ask`log("main") | last | get("says")`).toBe(log.at(-1)!.says);
    expect(await ask`route(@main:"The wiki") | map(h => h.name)`).toEqual(["The wiki"]);
    expect(await ask`route(@glass:types/function) | map(h => h.name)`).toEqual(["types", "function"]);
  });
});

describe("cases from glass", () => {
  test("a store at its level: what nothing in it holds, its root", async () => {
    const level = await ask`
      store("main")
        | filter(h => eq(size(filter(in(h), e => and(e.holds, eq(e.from.store, "main")))), 0))
    `;

    const truth = holons
      .filter((h) => h.store === "main")
      .filter(
        (h) =>
          !(holders.get(h.id) ?? []).some(({ holds, from }) => holds && known.get(from)?.store === "main"),
      )
      .map(({ id }) => id);
    sameSet(ids(level), truth);
    expect(ids(level).length).toBe(1);
  });

  test("count: the words beneath a brief", async () => {
    const grounds = named("The grounds", "brief");
    const count = await ask`
      follow(${at(grounds.id)}, x => out(x) | filter(e => e.holds) | map(e => e.to))
        | map(e => e.to)
        | distinct
        | filter(x => has(x.instance, ${at(typeNamed("word"))}))
        | size
    `;

    const seen = new Set<string>();
    const walk = (id: string) => partsOfHolon(id).forEach((p) => !seen.has(p) && (seen.add(p), walk(p)));
    walk(grounds.id);
    const truth = [...seen].filter((id) => known.get(id)!.instance.includes(typeNamed("word")));
    expect(count).toBe(truth.length);
  });

  test("measure: a token estimate, words beneath and words kept as strings, at 1.85", async () => {
    const wiki = named("The wiki", "brief").id;
    const seen = new Set([wiki]);
    const walk = (id: string) => partsOfHolon(id).forEach((p) => !seen.has(p) && (seen.add(p), walk(p)));
    walk(wiki);

    const wordsOf = (id: string) => {
      const holon = known.get(id)!;
      if (holon.instance.includes(typeNamed("word"))) return 1;

      return Object.values(holon.body)
        .filter((value) => typeof value === "string")
        .reduce((n, text) => n + cut(text).length, 0);
    };

    const truth = Math.round([...seen].reduce((n, id) => n + wordsOf(id), 0) * 1.85);
    expect(await ask`measure(@"The wiki")`).toBe(truth);
  });

  test("group: every utterance by how it came, as a fold into a record", async () => {
    const sessions = named("Sessions");
    const grouped = (await ask`
      @Sessions.sessions
        | map(s => else(s.said, []))
        | fold([], (all, said) => concat(all, said))
        | fold({}, (by, u) => put(by, u.as, concat(else(get(by, u.as), []), [u])))
    `) as Record<string, unknown[]>;

    const truth: Record<string, number> = {};
    for (const s of sessions.body.sessions as { $ref: string }[])
      for (const u of (known.get(s.$ref)!.body.said ?? []) as { $ref: string }[]) {
        const as = known.get(u.$ref)!.body.as;
        truth[as] = (truth[as] ?? 0) + 1;
      }
    expect(Object.fromEntries(Object.entries(grouped).map(([as, members]) => [as, members.length]))).toEqual(
      truth,
    );
  });

  test("where one is: the routes up from a paragraph to the roots", async () => {
    const glass = partsOfHolon(named("The wiki", "brief").id)[0]!;
    const paragraph = partsOfHolon(glass)[0]!;
    const walked = (await ask`
      follow(${at(paragraph)}, x => in(x) | filter(e => e.holds) | map(e => {to: e.from, key: e.key}))
    `) as { to: { $ref: string } }[];

    const up: string[] = [];
    const climb = (id: string) =>
      (holders.get(id) ?? [])
        .filter(({ holds }) => holds)
        .forEach(({ from }) => !up.includes(from) && (up.push(from), climb(from)));
    climb(paragraph);
    sameSet(
      walked.map(({ to }) => to.$ref),
      up,
    );
    expect(up).toContain(named("The wiki", "brief").id);
  });

  test("what points at a place, by the key it points from", async () => {
    const primitives = named("The primitives", "brief");
    const pointing = await ask`
      in(${at(primitives.id)}) | filter(e => not(e.holds)) | fold({}, (by, e) => put(by, e.key, true))
    `;

    const truth = new Set(
      (holders.get(primitives.id) ?? []).filter(({ holds }) => !holds).map(({ key }) => key),
    );
    expect(Object.keys(pointing as object).sort()).toEqual([...truth].sort());
  });

  test("any value a holon carries is for deriving: measures graded three, and steps waiting", async () => {
    const three = await ask`type(@types/measure) | filter(m => eq(m.value, 3)) | size`;
    const waiting = await ask`type(@types/step) | filter(s => eq(s.status, "waiting")) | size`;

    expect(three).toBe(
      holons.filter((h) => h.instance.includes(typeNamed("measure")) && h.body.value === 3).length,
    );
    expect(waiting).toBe(
      holons.filter((h) => h.instance.includes(typeNamed("step")) && h.body.status === "waiting").length,
    );
  });

  test("prose as text: a word as written, a sentence its words, a whole its heading", async () => {
    const text = (await ask`text(@Glass/"The grounds")`) as string;

    expect(text.startsWith("# The grounds\n\nGlass rests on what matters most to it")).toBe(true);
    expect(text).toContain("\n\n## Each layer stands apart\n\n");
    expect(text).toContain("*The author's, 2026-11-02.*");
  });
});

describe("the natives that gather, said again by what the kernel works with", () => {
  const wiki = named("The wiki", "brief").id;
  const set = async (parts: TemplateStringsArray, ...given: unknown[]) =>
    engine.read({ gather: (await written(parts, ...given)) as Expression });

  test("children and parents are holding walked one step down or up", async () => {
    sameSet(
      ids(await ask`out(${at(wiki)}) | filter(e => e.holds) | map(e => e.to)`),
      await set`children(${at(wiki)})`,
    );
    sameSet(
      ids(await ask`in(${at(wiki)}) | filter(e => e.holds) | map(e => e.from)`),
      await set`parents(${at(wiki)})`,
    );
  });

  test("points and pointers are the other references, instance aside", async () => {
    sameSet(
      ids(
        await ask`out(${at(wiki)}) | filter(e => and(not(e.holds), not(eq(e.key, "instance")))) | map(e => e.to)`,
      ),
      await set`points(${at(wiki)})`,
    );
  });

  test("type is a filter on what a holon is an instance of", async () => {
    sameSet(
      ids(await ask`everything() | filter(h => has(h.instance, @types/thread))`),
      await set`type(@types/thread)`,
    );
  });

  test("named and store are filters on a holon's own values", async () => {
    sameSet(
      ids(await ask`everything() | filter(h => contains(else(h.name, ""), "primitives"))`),
      await set`named("primitives")`,
    );
    sameSet(ids(await ask`everything() | filter(h => eq(h.store, "glass"))`), await set`store("glass")`);
  });
});

describe("what the language is", () => {
  test("a lambda closes over the words around it", async () => {
    expect(await ask`[1, 2, 3] | map(n => [10, 20] | map(m => add(n, m)))`).toEqual([
      [11, 21],
      [12, 22],
      [13, 23],
    ]);
  });

  test("only what is chosen is worked out, so a guard holds", async () => {
    expect(await ask`if(false, measure(@"The wiki"), "kept")`).toBe("kept");
    expect(await ask`and(false, get(1, "x"))`).toBe(false);
    expect(await ask`case("b", {a: 1, b: 2}, 3)`).toBe(2);
    expect(await ask`case("z", {a: 1}, 3)`).toBe(3);
  });

  test("every act is total: what it cannot use gives null or nothing", async () => {
    expect(await ask`get(1, "x")`).toBe(null);
    expect(await ask`out("not a holon")`).toEqual([]);
    expect(await ask`add("a", 1)`).toBe(null);
    expect(await ask`first([])`).toBe(null);
  });

  test("not is one lattice with and and or: a truth's opposite, a set's complement", async () => {
    expect(await ask`not(true)`).toBe(false);
    expect(await ask`size(not(everything()))`).toBe(0);
    expect(await ask`size(or(@"The wiki", @Sessions))`).toBe(2);
  });

  test("a function is a value, called by map as a lambda is", async () => {
    expect(await ask`[@Glass/"The grounds"] | map(text) | size`).toBe(1);
  });

  test("functions written as lambdas may be given as values, and lazy ones too", async () => {
    expect(await ask`map([true, false], not)`).toEqual([false, true]);
    expect(await ask`fold([true, true], true, and)`).toBe(true);
    expect(await ask`apply(x => add(x, 1), 2)`).toBe(3);
  });

  test("what is the same does not hang on the order of a record's keys", async () => {
    expect(await ask`eq({a: 1, b: 2}, {b: 2, a: 1})`).toBe(true);
  });

  test("a record that looks like a lambda is a record", async () => {
    expect(await ask`put({}, "fn", ["x"]) | kind`).toBe("record");
  });

  test("words given as a list are words, and no words find nothing", async () => {
    expect(await ask`named(["primitives"])`).toEqual(await ask`named("primitives")`);
    expect(await ask`named([])`).toEqual([]);
  });

  test("the top seen as the stores by their roots, or as one field", async () => {
    expect(await ask`roots() | map(r => r.store) | sort(k => k)`).toEqual(Object.keys(opened).sort());
    expect(await ask`unified() | size`).toBe(
      await ask`roots() | map(r => size(r.contents)) | fold(0, (n, m) => add(n, m))`,
    );
  });

  test("a store's level is its root, which holds its top", async () => {
    expect(ids(await ask`level(store("main"))`).length).toBe(1);
    expect(await ask`level(store("main")) | first | get("contents") | size`).toBe(11);
    expect(await ask`level(store("main")) | first | get("dependencies") | map(d => d.name)`).toEqual([
      "glass",
    ]);
    expect([...((await ask`stores()`) as string[])].sort()).toEqual(Object.keys(opened).sort());
  });
});

describe("the interface's ways of looking, through functions written as lambdas", () => {
  test("a written function that gives a set is seen at its level, and groups as nothing", async () => {
    const expression = (await written`level(store("glass"))`) as Expression;

    expect((await engine.read({ level: expression })).length).toBeGreaterThan(0);
    expect(await engine.read({ groups: expression })).toBe(null);
  });
});

describe("patterns, each answered apart", () => {
  const typeOf = (name: string) => at(typeNamed(name));

  test("a fact clause joined to another by a variable: measures graded three", async () => {
    const found = await ask`find(?m, [?m, "instance", ${typeOf("measure")}], [?m, "value", 3])`;
    sameSet(
      ids(found),
      holons.filter((h) => h.instance.includes(typeNamed("measure")) && h.body.value === 3).map((h) => h.id),
    );
  });

  test("a value joined across holons: a session's utterances in the author's voice", async () => {
    const sixth = holons.find((h) => h.name?.startsWith("A sixth session"))!;
    const found = await ask`find(?u, [${at(sixth.id)}, "said", ?u], [?u, "voice", @"The author"])`;

    const author = named("The author", "voice").id;
    const truth = (sixth.body.said as { $ref: string }[])
      .filter(({ $ref }) => known.get($ref)!.body.voice?.$ref === author)
      .map(({ $ref }) => $ref);
    sameSet(ids(found), truth);
  });

  test("not, with a variable of its own: a store's level", async () => {
    const found = await ask`find(?h, [?h, "store", "main"], not([?w, "$holds", ?h], [?w, "store", "main"]))`;
    sameSet(ids(found), ids(await ask`level(store("main"))`));
  });

  test("or, each branch binding the same variables, and a test of a value", async () => {
    const found = await ask`
      find(?u, [?u, "instance", ${typeOf("utterance")}], or([?u, "as", "typed"], [?u, "as", "spoken"]),
        [?u, "order", ?n], n => lt(n, 3))
    `;
    const truth = holons
      .filter((h) => h.instance.includes(typeNamed("utterance")))
      .filter((h) => ["typed", "spoken"].includes(h.body.as) && h.body.order < 3)
      .map((h) => h.id);
    sameSet(ids(found), truth);
  });

  test("several variables found as a record, each way distinct", async () => {
    const found =
      (await ask`find({s: ?s, on: ?on}, [?s, "instance", ${typeOf("session")}], [?s, "on", ?on])`) as {
        s: { $ref: string };
        on: string;
      }[];
    const truth = holons.filter((h) => h.instance.includes(typeNamed("session")));

    expect(found.length).toBe(truth.length);
    for (const { s, on } of found) expect(known.get(s.$ref)!.body.on).toBe(on);
  });

  test("holding is a fact of its own: what a whole holds", async () => {
    const wiki = named("The wiki", "brief").id;
    sameSet(ids(await ask`find(?p, [${at(wiki)}, "$holds", ?p])`), partsOfHolon(wiki));
  });

  test("a plan says which order answered each step, the narrowest first", async () => {
    const plan = (await ask`explain(find(?m, [?m, "instance", ${typeOf("measure")}], [?m, "value", 3]))`) as {
      steps: { served: string }[];
    };
    expect(plan.steps[0]!.served).toBe("by key and value");
  });

  test("what stands for a holon or a key and cannot be one matches nothing", async () => {
    expect(await ask`find(?n, ["zzz", "name", ?n])`).toEqual([]);
    expect(await ask`find(?n, [3, "name", ?n])`).toEqual([]);
  });

  test("an or waits for what its branches read from outside, and compares only what is used outside", async () => {
    const found = await ask`
      find(?m, [?m, "value", 3], [?m, "instance", ?t],
        or(and([?t, "name", "measure"], m => true), and([?t, "name", "measure"], m => true)))
    `;
    expect(ids(found).length).toBe(
      ids(await ask`find(?m, [?m, "value", 3], [?m, "instance", ${typeOf("measure")}])`).length,
    );
    await expect(
      ask`find(?m, or([?m, "value", 3], and([?m, "value", ?v], not([?m, "name", ?z]))))`,
    ).resolves.toBeDefined();
  });

  // Whether a small set apart is joined with what is bound, or what is bound is asked
  // first, the plan reads few facts and makes few ways.
  test("the planner weighs a join by what it reads in all", async () => {
    const plan =
      (await ask`explain(find(?m, [?m, "instance", ?t], [?t, "name", "measure"], [?m, "value", 3]))`) as {
        found: number;
        steps: { step: string; facts: number; bindings: number }[];
      };
    const sum = (key: "facts" | "bindings") => plan.steps.reduce((n, step) => n + step[key], 0);

    expect(plan.found).toBe(51);
    expect(sum("facts")).toBeLessThan(300);
    expect(sum("bindings")).toBeLessThan(300);
  });

  test("what cannot be a pattern says why", async () => {
    await expect(ask`find(?y, [?m, "value", 3])`).rejects.toThrow("finds ?y, which no fact of it binds");
    await expect(ask`map([1], find)`).rejects.toThrow("called, not given");
    await expect(ask`find(?u, [?u, "as", "typed"], n => eq(n, 1))`).rejects.toThrow("a test reads n");
    await expect(ask`find(?u, or([?u, "as", "typed"], [?v, "as", "spoken"]))`).rejects.toThrow(
      "same variables",
    );
    await expect(ask`[?u]`).rejects.toThrow("stands only within find");
  });
});
