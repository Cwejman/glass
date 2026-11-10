// The kernel grounded in real cases over the real stores. Each case is a question one
// would ask of the field, written in the kernel, and answered a second time apart from
// it, in plain code over the holons, so the kernel has to earn every answer.

import { describe, expect, test } from "bun:test";
import { openStore, type Store } from "../store/store.ts";
import { folderFiles, storeFolders } from "../tools/stores.ts";
import { gather } from "./expression.ts";
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

// Writing the kernel.
const c = (act: string, ...given: unknown[]) => ({ call: act, with: given });
const fn = (body: unknown) => ({ fn: body });
const x = { arg: 0 };
const y = { arg: 1 };
const at = (id: string) => ({ $ref: id });
const rec = (record: Record<string, unknown>) => ({ record });
const get = (value: unknown, key: string) => c("get", value, key);
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

// Steps the cases share, written once in the kernel.
const holding = fn(c("map", c("filter", c("out", x), fn(get(x, "holds"))), fn(get(x, "to"))));
const holders = fn(
  c("map", c("filter", c("in", x), fn(get(x, "holds"))), fn(rec({ to: get(x, "from"), key: get(x, "key") }))),
);
const ofType = (type: string) => c("filter", c("all"), fn(c("has", get(x, "instance"), at(type))));

describe("cases from OpenLight, in glass's field", () => {
  test("a thread: the line a fork came from, followed by its link", () => {
    const fork = named("A fork on the paper's licence, ended by the author");
    const line = evaluate(
      c("follow", at(fork.id), fn(c("filter", c("out", x), fn(c("eq", get(x, "key"), "forkedFrom"))))),
    ) as { to: { $ref: string }; depth: number; key: string }[];

    const truth: string[] = [];
    for (let at = fork.body.forkedFrom; at; at = all.known.get(at.$ref)?.holon.body.forkedFrom)
      truth.push(at.$ref);

    expect(line.map(({ to }) => to.$ref)).toEqual(truth);
    expect(line.every(({ key }) => key === "forkedFrom")).toBe(true);
  });

  test("a capped walk: the work tree one level down only", () => {
    const sessions = named("Sessions");
    const walked = evaluate(c("follow", at(sessions.id), holding, rec({ depth: 1 }))) as { depth: number }[];

    expect(walked.length).toBe(partsOfHolon(sessions.id).length);
    expect(walked.every(({ depth }) => depth === 1)).toBe(true);
  });

  test("a review queue: what is measured and not yet resolved", () => {
    const measured = named("measured");
    const open = evaluate(
      c("filter", get(at(measured.id), "measures"), fn(c("not", c("eq", get(x, "as"), "resolved")))),
    );

    const truth = (measured.body.measures as { $ref: string }[]).filter(
      ({ $ref }) => all.known.get($ref)!.holon.body.as !== "resolved",
    );
    expect(ids(open)).toEqual(truth.map(({ $ref }) => $ref));
  });

  test("the prompts only: a session's utterances in the author's voice", () => {
    const sixth = holons.find((h) => h.name?.startsWith("A sixth session"))!;
    const author = named("The author", "voice");
    const theirs = evaluate(
      c("filter", get(at(sixth.id), "said"), fn(c("eq", get(x, "voice"), at(author.id)))),
    );

    const truth = (sixth.body.said as { $ref: string }[])
      .map(({ $ref }) => all.known.get($ref)!.holon)
      .filter((u) => u.body.voice?.$ref === author.id);
    expect(ids(theirs)).toEqual(truth.map(({ id }) => id));
  });

  test("intersection: what is both a brief and a step", () => {
    const both = evaluate(c("common", ofType(typeNamed("brief")), ofType(typeNamed("step"))));
    sameSet(
      ids(both),
      instancesOf(typeNamed("brief")).filter((id) => instancesOf(typeNamed("step")).includes(id)),
    );
  });

  test("search: what says a word, the index's case", () => {
    const found = ids(evaluate(c("match", "holarchy")));
    expect(found.length).toBeGreaterThan(0);
    for (const id of found.slice(0, 20))
      expect(JSON.stringify(all.known.get(id)!.holon).toLowerCase()).toContain("holarchy");
  });

  test("order and a window: the two latest sessions", () => {
    const sessions = named("Sessions");
    const latest = evaluate(
      c("take", c("reverse", c("sort", get(at(sessions.id), "sessions"), fn(get(x, "on")))), 2),
    );

    const truth = [...(sessions.body.sessions as { $ref: string }[])]
      .map(({ $ref }) => all.known.get($ref)!.holon)
      .sort((a, b) => (a.body.on < b.body.on ? -1 : a.body.on > b.body.on ? 1 : 0))
      .reverse()
      .slice(0, 2);
    expect(ids(latest)).toEqual(truth.map(({ id }) => id));
  });

  test("history as values: what the store's last commit says", () => {
    const last = evaluate(get(c("first", c("reverse", c("log", "main"))), "says"));
    expect(last).toBe(logs.get("main")!.at(-1)!.says);
  });
});

describe("cases from glass", () => {
  test("a store at its level: what nothing in it holds", () => {
    const level = evaluate(
      c(
        "filter",
        c("all"),
        fn(
          c(
            "and",
            c("eq", get(x, "store"), "main"),
            c(
              "eq",
              c(
                "size",
                c(
                  "filter",
                  c("in", x),
                  fn(c("and", get(x, "holds"), c("eq", get(get(x, "from"), "store"), "main"))),
                ),
              ),
              0,
            ),
          ),
        ),
      ),
    );

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
    const count = evaluate(
      c(
        "size",
        c(
          "distinct",
          c(
            "filter",
            c("map", c("follow", at(grounds.id), holding), fn(get(x, "to"))),
            fn(c("has", get(x, "instance"), at(typeNamed("word")))),
          ),
        ),
      ),
    );

    const seen = new Set<string>();
    const walk = (id: string) => partsOfHolon(id).forEach((p) => !seen.has(p) && (seen.add(p), walk(p)));
    walk(grounds.id);
    const truth = [...seen].filter((id) => all.known.get(id)!.holon.instance.includes(typeNamed("word")));
    expect(count).toBe(truth.length);
  });

  test("measure: a token estimate as the probe makes it, words times 1.85", () => {
    const grounds = named("The grounds", "brief");
    const words = c(
      "filter",
      c("map", c("follow", at(grounds.id), holding), fn(get(x, "to"))),
      fn(c("has", get(x, "instance"), at(typeNamed("word")))),
    );
    const tokens = evaluate(c("mul", c("size", words), 1.85)) as number;
    expect(tokens).toBeGreaterThan(500);
  });

  test("group: every utterance by how it came, as a fold into a record", () => {
    const sessions = named("Sessions");
    const none = { list: [] };
    const utterances = c(
      "fold",
      c("map", get(at(sessions.id), "sessions"), fn(c("else", get(x, "said"), none))),
      none,
      fn(c("union", x, y)),
    );
    const grouped = evaluate(
      c(
        "fold",
        utterances,
        rec({}),
        fn(c("put", x, get(y, "as"), c("union", c("else", c("get", x, get(y, "as")), none), { list: [y] }))),
      ),
    ) as Record<string, unknown[]>;

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
    const walked = evaluate(c("follow", at(paragraph), holders)) as { to: { $ref: string }; key: string }[];

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
    const pointing = evaluate(
      c(
        "fold",
        c("filter", c("in", at(primitives.id)), fn(c("not", get(x, "holds")))),
        rec({}),
        fn(c("put", x, get(y, "key"), true)),
      ),
    );

    const truth = new Set(
      (all.holders.get(primitives.id) ?? []).filter(({ holds }) => !holds).map(({ key }) => key),
    );
    expect(Object.keys(pointing as object).sort()).toEqual([...truth].sort());
  });

  test("any value a holon carries is for deriving: measures graded three, and steps waiting", () => {
    const three = evaluate(
      c("size", c("filter", ofType(typeNamed("measure")), fn(c("eq", get(x, "value"), 3)))),
    );
    const waiting = evaluate(
      c("size", c("filter", ofType(typeNamed("step")), fn(c("eq", get(x, "status"), "waiting")))),
    );

    expect(three).toBe(
      holons.filter((h) => h.instance.includes(typeNamed("measure")) && h.body.value === 3).length,
    );
    expect(waiting).toBe(
      holons.filter((h) => h.instance.includes(typeNamed("step")) && h.body.status === "waiting").length,
    );
  });
});

describe("today's natives, written in the kernel", () => {
  const glassFn = (native: string) => holons.find((h) => h.store === "glass" && h.body.native === native)!.id;
  const native = (name: string, ...given: unknown[]) =>
    gather(all, { call: { $ref: glassFn(name) }, with: given as never });
  const wiki = named("The wiki", "brief").id;

  test("children and parents are holding walked one step down or up", () => {
    sameSet(
      ids(evaluate(c("map", c("filter", c("out", at(wiki)), fn(get(x, "holds"))), fn(get(x, "to"))))),
      native("children", at(wiki)),
    );
    sameSet(
      ids(evaluate(c("map", c("filter", c("in", at(wiki)), fn(get(x, "holds"))), fn(get(x, "from"))))),
      native("parents", at(wiki)),
    );
  });

  test("points to and pointed from are the other references, instance aside", () => {
    const pointsTo = c(
      "map",
      c(
        "filter",
        c("out", at(wiki)),
        fn(c("and", c("not", get(x, "holds")), c("not", c("eq", get(x, "key"), "instance")))),
      ),
      fn(get(x, "to")),
    );
    sameSet(ids(evaluate(pointsTo)), native("points-to", at(wiki)));
  });

  test("type is a filter on what a holon is an instance of", () => {
    sameSet(ids(evaluate(ofType(typeNamed("thread")))), native("type", at(typeNamed("thread"))));
  });

  test("named and store are filters on a holon's own values", () => {
    const byName = c("filter", c("all"), fn(c("contains", c("else", get(x, "name"), ""), "primitives")));
    sameSet(ids(evaluate(byName)), native("named", "primitives"));

    const inGlass = c("filter", c("all"), fn(c("eq", get(x, "store"), "glass")));
    sameSet(ids(evaluate(inGlass)), native("store", "glass"));
  });
});
