// The kernel grounded in real cases over the real stores. Each case is a question one
// would ask of the field, written in the language as code writes it, and answered a
// second time apart from it, in plain code over the holons, so the kernel has to earn
// every answer.

import { describe, expect, test } from "bun:test";
import { namesIn } from "../language/names.ts";
import { template } from "../language/text.ts";
import { openStore, type Store } from "../store/store.ts";
import { folderFiles, storeFolders } from "../tools/stores.ts";
import { gather, groups, level } from "./expression.ts";
import { fieldOf } from "./field.ts";
import { kernel, type Value } from "./kernel.ts";
import { partsOf } from "./references.ts";

const opened: Record<string, Store> = {};
for (const [key, dir] of Object.entries(storeFolders())) opened[key] = await openStore(folderFiles(dir));

const all = await fieldOf(Object.entries(opened).map(([key, store]) => ({ key, store }))).everything();
const logs = new Map(
  await Promise.all(Object.entries(opened).map(async ([key, store]) => [key, await store.log()] as const)),
);
const { evaluate } = kernel({ all, logs });

// Asking, in the language.
const written = template(namesIn(all));
const ask = (parts: TemplateStringsArray, ...given: unknown[]) => evaluate(written(parts, ...given));
const at = (id: string) => ({ $ref: id });
const ids = (value: Value) => (value as { $ref: string }[]).map(({ $ref }) => $ref);

// Answering apart: the holons as they are.
const holons = [...all.known.values()].map(({ holon, store }) => ({ ...holon, store }));
const typeNamed = (name: string) => holons.find((h) => h.mould && h.name === name && h.store === "main")!.id;
const named = (name: string, type?: string) =>
  holons.find((h) => h.name === name && (!type || h.instance.includes(typeNamed(type))))!;
const mouldOf = (h: (typeof holons)[number]) =>
  Object.assign({}, ...h.instance.map((t) => (all.known.get(t)?.holon.mould ?? {}) as object));
const partsOfHolon = (id: string) => {
  const h = all.known.get(id)!.holon;
  return partsOf(h.body, mouldOf({ ...h, store: "" }));
};
const instancesOf = (type: string) => holons.filter((h) => h.instance.includes(type)).map((h) => h.id);
const sameSet = (a: string[], b: string[]) => expect([...new Set(a)].sort()).toEqual([...new Set(b)].sort());

describe("cases from OpenLight, in glass's field", () => {
  test("a thread: the line a fork came from, followed by its link", () => {
    const fork = named("A fork on the paper's licence, ended by the author");
    const line = ask`follow(${at(fork.id)}, x => out(x) | filter(e => eq(e.key, "forkedFrom")))` as {
      to: { $ref: string };
      key: string;
    }[];

    const truth: string[] = [];
    for (let at = fork.body.forkedFrom; at; at = all.known.get(at.$ref)?.holon.body.forkedFrom)
      truth.push(at.$ref);

    expect(line.map(({ to }) => to.$ref)).toEqual(truth);
    expect(line.every(({ key }) => key === "forkedFrom")).toBe(true);
  });

  test("a capped walk: the work tree one level down only", () => {
    const walked = ask`follow(@Sessions, x => out(x) | filter(e => e.holds), {depth: 1})` as {
      depth: number;
    }[];

    expect(walked.length).toBe(partsOfHolon(named("Sessions").id).length);
    expect(walked.every(({ depth }) => depth === 1)).toBe(true);
  });

  test("a review queue: what is measured and not yet resolved", () => {
    const measured = named("measured");
    const open = ask`@measured.measures | filter(m => not(eq(m.as, "resolved")))`;

    const truth = (measured.body.measures as { $ref: string }[]).filter(
      ({ $ref }) => all.known.get($ref)!.holon.body.as !== "resolved",
    );
    expect(ids(open)).toEqual(truth.map(({ $ref }) => $ref));
  });

  test("the prompts only: a session's utterances in the author's voice", () => {
    const sixth = holons.find((h) => h.name?.startsWith("A sixth session"))!;
    const author = named("The author", "voice");
    const theirs = ask`${at(sixth.id)}.said | filter(u => eq(u.voice, @"The author"))`;

    const truth = (sixth.body.said as { $ref: string }[])
      .map(({ $ref }) => all.known.get($ref)!.holon)
      .filter((u) => u.body.voice?.$ref === author.id);
    expect(ids(theirs)).toEqual(truth.map(({ id }) => id));
  });

  test("intersection: what is both a brief and a step", () => {
    const both = ask`and(type(@types/brief), type(@types/step))`;
    sameSet(
      ids(both),
      instancesOf(typeNamed("brief")).filter((id) => instancesOf(typeNamed("step")).includes(id)),
    );
  });

  test("search: what says a word, the index's case", () => {
    const found = ids(ask`search("holarchy")`);
    expect(found.length).toBeGreaterThan(0);
    for (const id of found.slice(0, 20)) expect(ask`says(${at(id)})` as string).toContain("holarchy");
  });

  test("order and a window: the two latest sessions", () => {
    const sessions = named("Sessions");
    const latest = ask`@Sessions.sessions | sort(s => s.on) | reverse | take(2)`;

    const truth = [...(sessions.body.sessions as { $ref: string }[])]
      .map(({ $ref }) => all.known.get($ref)!.holon)
      .sort((a, b) => (a.body.on < b.body.on ? -1 : a.body.on > b.body.on ? 1 : 0))
      .reverse()
      .slice(0, 2);
    expect(ids(latest)).toEqual(truth.map(({ id }) => id));
  });

  test("history as values: what the store's last commit says", () => {
    expect(ask`log("main") | last | get("says")`).toBe(logs.get("main")!.at(-1)!.says);
  });
});

describe("cases from glass", () => {
  test("a store at its level: what nothing in it holds", () => {
    const level = ask`
      store("main")
        | filter(h => eq(size(filter(in(h), e => and(e.holds, eq(e.from.store, "main")))), 0))
    `;

    const truth = holons
      .filter((h) => h.store === "main")
      .filter(
        (h) =>
          !(all.holders.get(h.id) ?? []).some(
            ({ holds, from }) => holds && all.known.get(from)?.store === "main",
          ),
      )
      .map(({ id }) => id);
    sameSet(ids(level), truth);
    expect(ids(level).length).toBe(10);
  });

  test("count: the words beneath a brief", () => {
    const grounds = named("The grounds", "brief");
    const count = ask`
      follow(${at(grounds.id)}, x => out(x) | filter(e => e.holds) | map(e => e.to))
        | map(e => e.to)
        | distinct
        | filter(x => has(x.instance, ${at(typeNamed("word"))}))
        | size
    `;

    const seen = new Set<string>();
    const walk = (id: string) => partsOfHolon(id).forEach((p) => !seen.has(p) && (seen.add(p), walk(p)));
    walk(grounds.id);
    const truth = [...seen].filter((id) => all.known.get(id)!.holon.instance.includes(typeNamed("word")));
    expect(count).toBe(truth.length);
  });

  test("measure: a token estimate, words beneath and words kept as strings, at 1.85", () => {
    const wiki = named("The wiki", "brief").id;
    const seen = new Set([wiki]);
    const walk = (id: string) => partsOfHolon(id).forEach((p) => !seen.has(p) && (seen.add(p), walk(p)));
    walk(wiki);

    const wordsOf = (id: string) => {
      const { holon } = all.known.get(id)!;
      if (holon.instance.includes(typeNamed("word"))) return 1;

      return Object.values(holon.body)
        .filter((value) => typeof value === "string")
        .reduce((n, text) => n + (text as string).split(/\s+/).filter(Boolean).length, 0);
    };

    const truth = Math.round([...seen].reduce((n, id) => n + wordsOf(id), 0) * 1.85);
    expect(ask`measure(@"The wiki")`).toBe(truth);
  });

  test("group: every utterance by how it came, as a fold into a record", () => {
    const sessions = named("Sessions");
    const grouped = ask`
      @Sessions.sessions
        | map(s => else(s.said, []))
        | fold([], (all, said) => concat(all, said))
        | fold({}, (by, u) => put(by, u.as, concat(else(get(by, u.as), []), [u])))
    ` as Record<string, unknown[]>;

    const truth: Record<string, number> = {};
    for (const s of sessions.body.sessions as { $ref: string }[])
      for (const u of (all.known.get(s.$ref)!.holon.body.said ?? []) as { $ref: string }[]) {
        const as = all.known.get(u.$ref)!.holon.body.as;
        truth[as] = (truth[as] ?? 0) + 1;
      }
    expect(Object.fromEntries(Object.entries(grouped).map(([as, members]) => [as, members.length]))).toEqual(
      truth,
    );
  });

  test("where one is: the routes up from a paragraph to the roots", () => {
    const glass = partsOfHolon(named("The wiki", "brief").id)[0]!;
    const paragraph = partsOfHolon(glass)[0]!;
    const walked = ask`
      follow(${at(paragraph)}, x => in(x) | filter(e => e.holds) | map(e => {to: e.from, key: e.key}))
    ` as { to: { $ref: string } }[];

    const up: string[] = [];
    const climb = (id: string) =>
      (all.holders.get(id) ?? [])
        .filter(({ holds }) => holds)
        .forEach(({ from }) => !up.includes(from) && (up.push(from), climb(from)));
    climb(paragraph);
    sameSet(
      walked.map(({ to }) => to.$ref),
      up,
    );
    expect(up).toContain(named("The wiki", "brief").id);
  });

  test("what points at a place, by the key it points from", () => {
    const primitives = named("The primitives", "brief");
    const pointing = ask`
      in(${at(primitives.id)}) | filter(e => not(e.holds)) | fold({}, (by, e) => put(by, e.key, true))
    `;

    const truth = new Set(
      (all.holders.get(primitives.id) ?? []).filter(({ holds }) => !holds).map(({ key }) => key),
    );
    expect(Object.keys(pointing as object).sort()).toEqual([...truth].sort());
  });

  test("any value a holon carries is for deriving: measures graded three, and steps waiting", () => {
    const three = ask`type(@types/measure) | filter(m => eq(m.value, 3)) | size`;
    const waiting = ask`type(@types/step) | filter(s => eq(s.status, "waiting")) | size`;

    expect(three).toBe(
      holons.filter((h) => h.instance.includes(typeNamed("measure")) && h.body.value === 3).length,
    );
    expect(waiting).toBe(
      holons.filter((h) => h.instance.includes(typeNamed("step")) && h.body.status === "waiting").length,
    );
  });

  test("prose as text: a word as written, a sentence its words, a whole its heading", () => {
    const text = ask`text(@Glass/"The grounds")` as string;

    expect(text.startsWith("# The grounds\n\nGlass rests on what matters most to it")).toBe(true);
    expect(text).toContain("\n\n## Each layer stands apart\n\n");
    expect(text).toContain("*The author's, 2026-11-02.*");
  });
});

describe("the natives that gather, said again by what the kernel works with", () => {
  const wiki = named("The wiki", "brief").id;
  const set = (parts: TemplateStringsArray, ...given: unknown[]) =>
    gather(all, written(parts, ...given) as never);

  test("children and parents are holding walked one step down or up", () => {
    sameSet(ids(ask`out(${at(wiki)}) | filter(e => e.holds) | map(e => e.to)`), set`children(${at(wiki)})`);
    sameSet(ids(ask`in(${at(wiki)}) | filter(e => e.holds) | map(e => e.from)`), set`parents(${at(wiki)})`);
  });

  test("points and pointers are the other references, instance aside", () => {
    sameSet(
      ids(
        ask`out(${at(wiki)}) | filter(e => and(not(e.holds), not(eq(e.key, "instance")))) | map(e => e.to)`,
      ),
      set`points(${at(wiki)})`,
    );
  });

  test("type is a filter on what a holon is an instance of", () => {
    sameSet(ids(ask`everything() | filter(h => has(h.instance, @types/thread))`), set`type(@types/thread)`);
  });

  test("named and store are filters on a holon's own values", () => {
    sameSet(
      ids(ask`everything() | filter(h => contains(else(h.name, ""), "primitives"))`),
      set`named("primitives")`,
    );
    sameSet(ids(ask`everything() | filter(h => eq(h.store, "glass"))`), set`store("glass")`);
  });
});

describe("what the language is", () => {
  test("a lambda closes over the words around it", () => {
    expect(ask`[1, 2, 3] | map(n => [10, 20] | map(m => add(n, m)))`).toEqual([
      [11, 21],
      [12, 22],
      [13, 23],
    ]);
  });

  test("only what is chosen is worked out, so a guard holds", () => {
    expect(ask`if(false, measure(@"The wiki"), "kept")`).toBe("kept");
    expect(ask`and(false, get(1, "x"))`).toBe(false);
    expect(ask`case("b", {a: 1, b: 2}, 3)`).toBe(2);
    expect(ask`case("z", {a: 1}, 3)`).toBe(3);
  });

  test("every act is total: what it cannot use gives null or nothing", () => {
    expect(ask`get(1, "x")`).toBe(null);
    expect(ask`out("not a holon")`).toEqual([]);
    expect(ask`add("a", 1)`).toBe(null);
    expect(ask`first([])`).toBe(null);
  });

  test("not is one lattice with and and or: a truth's opposite, a set's complement", () => {
    expect(ask`not(true)`).toBe(false);
    expect(ask`size(not(everything()))`).toBe(0);
    expect(ask`size(or(@"The wiki", @Sessions))`).toBe(2);
  });

  test("a function is a value, called by map as a lambda is", () => {
    expect(ask`[@Glass/"The grounds"] | map(text) | size`).toBe(1);
  });

  test("functions written as lambdas may be given as values, and lazy ones too", () => {
    expect(ask`map([true, false], not)`).toEqual([false, true]);
    expect(ask`fold([true, true], true, and)`).toBe(true);
    expect(ask`apply(x => add(x, 1), 2)`).toBe(3);
  });

  test("what is the same does not hang on the order of a record's keys", () => {
    expect(ask`eq({a: 1, b: 2}, {b: 2, a: 1})`).toBe(true);
  });

  test("a record that looks like a lambda is a record", () => {
    expect(ask`put({}, "fn", ["x"]) | kind`).toBe("record");
  });

  test("words given as a list are words, and no words find nothing", () => {
    expect(ask`named(["primitives"])`).toEqual(ask`named("primitives")`);
    expect(ask`named([])`).toEqual([]);
  });

  test("a store's level is its roots", () => {
    expect(ids(ask`level(store("main"))`).length).toBe(10);
    expect([...(ask`stores()` as string[])].sort()).toEqual(Object.keys(opened).sort());
  });
});

describe("the interface's ways of looking, through functions written as lambdas", () => {
  test("a written function that gives a set is seen at its level, and groups as nothing", () => {
    const expression = written`level(store("glass"))` as never;

    expect(level(all, expression).length).toBeGreaterThan(0);
    expect(groups(all, expression)).toBe(null);
  });
});

describe("patterns, each answered apart", () => {
  const typeOf = (name: string) => at(typeNamed(name));

  test("a fact clause joined to another by a variable: measures graded three", () => {
    const found = ask`find(?m, [?m, "instance", ${typeOf("measure")}], [?m, "value", 3])`;
    sameSet(
      ids(found),
      holons.filter((h) => h.instance.includes(typeNamed("measure")) && h.body.value === 3).map((h) => h.id),
    );
  });

  test("a value joined across holons: a session's utterances in the author's voice", () => {
    const sixth = holons.find((h) => h.name?.startsWith("A sixth session"))!;
    const found = ask`find(?u, [${at(sixth.id)}, "said", ?u], [?u, "voice", @"The author"])`;

    const author = named("The author", "voice").id;
    const truth = (sixth.body.said as { $ref: string }[])
      .filter(({ $ref }) => all.known.get($ref)!.holon.body.voice?.$ref === author)
      .map(({ $ref }) => $ref);
    sameSet(ids(found), truth);
  });

  test("not, with a variable of its own: a store's level", () => {
    const found = ask`find(?h, [?h, "store", "main"], not([?w, "$holds", ?h], [?w, "store", "main"]))`;
    sameSet(ids(found), ids(ask`level(store("main"))`));
  });

  test("or, each branch binding the same variables, and a test of a value", () => {
    const found = ask`
      find(?u, [?u, "instance", ${typeOf("utterance")}], or([?u, "as", "typed"], [?u, "as", "spoken"]),
        [?u, "order", ?n], n => lt(n, 3))
    `;
    const truth = holons
      .filter((h) => h.instance.includes(typeNamed("utterance")))
      .filter((h) => ["typed", "spoken"].includes(h.body.as) && h.body.order < 3)
      .map((h) => h.id);
    sameSet(ids(found), truth);
  });

  test("several variables found as a record, each way distinct", () => {
    const found = ask`find({s: ?s, on: ?on}, [?s, "instance", ${typeOf("session")}], [?s, "on", ?on])` as {
      s: { $ref: string };
      on: string;
    }[];
    const truth = holons.filter((h) => h.instance.includes(typeNamed("session")));

    expect(found.length).toBe(truth.length);
    for (const { s, on } of found) expect(all.known.get(s.$ref)!.holon.body.on).toBe(on);
  });

  test("holding is a fact of its own: what a whole holds", () => {
    const wiki = named("The wiki", "brief").id;
    sameSet(ids(ask`find(?p, [${at(wiki)}, "$holds", ?p])`), partsOfHolon(wiki));
  });

  test("a plan says which order answered each step, the narrowest first", () => {
    const plan = ask`explain(find(?m, [?m, "instance", ${typeOf("measure")}], [?m, "value", 3]))` as {
      steps: { served: string }[];
    };
    expect(plan.steps[0]!.served).toBe("by key and value");
  });

  test("what stands for a holon or a key and cannot be one matches nothing", () => {
    expect(ask`find(?n, ["zzz", "name", ?n])`).toEqual([]);
    expect(ask`find(?n, [3, "name", ?n])`).toEqual([]);
  });

  test("an or waits for what its branches read from outside, and compares only what is used outside", () => {
    const found = ask`
      find(?m, [?m, "value", 3], [?m, "instance", ?t],
        or(and([?t, "name", "measure"], m => true), and([?t, "name", "measure"], m => true)))
    `;
    expect(ids(found).length).toBe(
      ids(ask`find(?m, [?m, "value", 3], [?m, "instance", ${typeOf("measure")}])`).length,
    );
    expect(
      () => ask`find(?m, or([?m, "value", 3], and([?m, "value", ?v], not([?m, "name", ?z]))))`,
    ).not.toThrow();
  });

  test("the planner joins by what is bound before what stands apart", () => {
    const plan = ask`explain(find(?m, [?m, "instance", ?t], [?t, "name", "measure"], [?m, "value", 3]))` as {
      steps: { step: string; bindings: number }[];
    };
    expect(Math.max(...plan.steps.map(({ bindings }) => bindings))).toBeLessThan(100);
  });

  test("what cannot be a pattern says why", () => {
    expect(() => ask`find(?y, [?m, "value", 3])`).toThrow("finds ?y, which no fact of it binds");
    expect(() => ask`map([1], find)`).toThrow("called, not given");
    expect(() => ask`find(?u, [?u, "as", "typed"], n => eq(n, 1))`).toThrow("a test reads n");
    expect(() => ask`find(?u, or([?u, "as", "typed"], [?v, "as", "spoken"]))`).toThrow("same variables");
    expect(() => ask`[?u]`).toThrow("stands only within find");
  });
});
