import { expect, test } from "bun:test";
import { newId } from "../store/id.ts";
import type { Version } from "../store/objects.ts";
import { expressionProblem, gather, groups, type Argument, type Expression } from "./expression.ts";
import { fieldOf, type Known, type Standing } from "./field.ts";

const TYPE = newId();
const NOTE = newId();
const typeBody = { title: "Type", fields: {} };

type Held = [string, Version["body"], string[]];

function standing(key: string, holons: Held[], names: Record<string, string> = {}): Standing {
  const known = new Map<string, Known>();
  for (const [id, body, instance] of holons)
    known.set(id, {
      key,
      name: `sha256-${"0".repeat(64)}`,
      version: { kind: "version", id, prev: null, instance, body },
    });
  return { key, head: undefined, names, holons: known };
}

// Glass's own programs, each a holon in a store of their own.
const takes: Record<string, string[]> = {
  everything: [],
  type: ["set"],
  children: ["set"],
  parents: ["set"],
  text: ["words"],
  store: ["store"],
  named: [],
  types: [],
  and: ["sets"],
  or: ["sets"],
  not: ["set"],
  group: ["set", "axis"],
};
const program = Object.fromEntries(Object.keys(takes).map((name) => [name, newId()]));
const programs = standing(
  "programs",
  Object.entries(takes).map(
    ([name, given]): Held => [program[name]!, { title: name, takes: given, native: name }, []],
  ),
);
const P = Object.values(program);
const call = (name: string, ...given: Argument[]): Expression => ({
  call: { $ref: program[name]! },
  with: given,
});
const ref = (id: string): Expression => ({ $ref: id });

const a = newId();
const b = newId();
const field = fieldOf([
  standing("home", [[b, { title: "B", about: { $ref: a } }, [NOTE]]]),
  standing(
    "glass",
    [
      [TYPE, typeBody, [TYPE]],
      [NOTE, typeBody, [TYPE]],
      [a, { title: "A, the reader" }, [NOTE]],
    ],
    { note: NOTE },
  ),
  programs,
]);

test("a program given what it takes gathers from the field, in the field's order", () => {
  expect(gather(field, call("everything"))).toEqual([b, TYPE, NOTE, a, ...P]);
  expect(gather(field, call("type", ref(NOTE)))).toEqual([b, a]);
  expect(gather(field, call("types"))).toEqual([TYPE, NOTE]);
  expect(gather(field, call("children", ref(b)))).toEqual([a]);
  expect(gather(field, call("parents", ref(a)))).toEqual([b]);
  expect(gather(field, call("store", "glass"))).toEqual([TYPE, NOTE, a]);
  expect(gather(field, call("named"))).toEqual([NOTE]);
  expect(gather(field, ref(a))).toEqual([a]);
});

test("relations take sets, so they compose: the children of every note, the type of a type", () => {
  expect(gather(field, call("children", call("type", ref(NOTE))))).toEqual([a]);
  expect(gather(field, call("type", call("types")))).toEqual([b, TYPE, NOTE, a]);
});

test("and, or and not are programs too, and nest as deep as one likes", () => {
  expect(gather(field, call("and", call("type", ref(NOTE)), call("parents", ref(a))))).toEqual([b]);
  expect(gather(field, call("or", ref(a), call("types")))).toEqual([TYPE, NOTE, a]);
  expect(gather(field, call("and", call("type", ref(NOTE)), call("not", call("store", "home"))))).toEqual([
    a,
  ]);
  expect(gather(field, call("not", call("or", call("everything"))))).toEqual([]);
});

test("a match gathers what says each of its words, in any case, but not by the ids it points by", () => {
  expect(gather(field, call("text", "READER the"))).toEqual([a]);
  expect(gather(field, call("text", a.slice(0, 8)))).toEqual([]);
});

test("a program of one's own gives an expression over what it is given, and is called as glass's are", () => {
  const notesOf = newId();
  const own = fieldOf([
    standing("home", [
      [
        notesOf,
        {
          title: "Notes held by",
          takes: ["set"],
          gives: call("and", call("type", ref(NOTE)), call("children", { arg: 0 })),
        },
        [],
      ],
    ]),
    ...field.stores,
  ]);
  expect(gather(own, { call: { $ref: notesOf }, with: [ref(b)] })).toEqual([a]);
  expect(() => gather(own, { call: { $ref: notesOf } })).toThrow("takes set, and was given 0");
});

test("what a program is given is held against what it takes", () => {
  expect(() => gather(field, call("type", "Note"))).toThrow("takes a set");
  expect(() => gather(field, call("text", ref(a)))).toThrow("takes a words");
  expect(() => gather(field, call("and"))).toThrow("takes sets");
  expect(() => gather(field, call("group", call("everything"), "colour"))).toThrow("groups by");
  expect(() => gather(field, { call: { $ref: a } })).toThrow("is not a program");
  expect(() => gather(field, { arg: 0 })).toThrow("within a program");
});

test("a value that is not an expression says what is wrong with its shape", () => {
  expect(expressionProblem(call("type", ref(NOTE)) as never)).toBeUndefined();
  expect(expressionProblem({ arg: 1 })).toBeUndefined();
  expect(expressionProblem({ instances: NOTE })).toContain("a holon, a call or an argument");
  expect(expressionProblem({ call: "x" })).toContain("names its program");
  expect(expressionProblem({ call: { $ref: a }, with: "x" })).toContain("a list");
  expect(expressionProblem({ arg: -1 })).toContain("counted from 0");
  let deep: Expression = ref(a);
  for (let i = 0; i < 40; i++) deep = call("not", deep);
  expect(expressionProblem(deep as never)).toContain("nests at most");
});

test("a grouping gathers what it groups, and gives its collections, each an expression of its own", () => {
  const everything = call("everything");
  expect(gather(field, call("group", everything, "type"))).toEqual(gather(field, everything));
  expect(groups(field, call("group", everything, "type"))).toEqual({
    by: "type",
    groups: [
      { value: NOTE, count: 2, gathers: call("type", ref(NOTE)) },
      { value: TYPE, count: 2, gathers: call("type", ref(TYPE)) },
    ],
    rest: P,
  });
  expect(groups(field, call("group", call("type", ref(NOTE)), "parent"))).toEqual({
    by: "parent",
    groups: [{ value: b, count: 1, gathers: call("and", call("type", ref(NOTE)), call("children", ref(b))) }],
    rest: [b],
  });
  expect(groups(field, everything)).toBeNull();
});

test("a collection deep down is narrowed by its steps side by side", () => {
  const two = call("and", call("type", ref(NOTE)), call("not", call("named")));
  expect(groups(field, call("group", two, "store"))!.groups[0]!.gathers).toEqual(
    call("and", call("type", ref(NOTE)), call("not", call("named")), call("store", "home")),
  );
});

test("a program of one's own that groups is looked through to its collections", () => {
  const grouped = newId();
  const own = fieldOf([
    standing("home", [
      [
        grouped,
        { title: "Notes, by store", takes: [], gives: call("group", call("type", ref(NOTE)), "store") },
        [],
      ],
    ]),
    ...field.stores,
  ]);
  expect(groups(own, { call: { $ref: grouped } })!.by).toBe("store");
});

test("grouped automatically, a value every holon shares says nothing, and a few groups outweigh many", () => {
  expect(groups(field, call("group", call("type", ref(NOTE)), "type"))!.groups).toEqual([]);
  expect(groups(field, call("group", call("type", ref(NOTE)), "auto"))!.by).toBe("store");

  const kinds = [newId(), newId()];
  const holders = Array.from({ length: 40 }, () => newId());
  const items = holders.map(() => newId());
  const many = fieldOf([
    standing("glass", [
      ...kinds.map((id): Held => [id, typeBody, [TYPE]]),
      [TYPE, typeBody, [TYPE]],
      ...items.map((id, i): Held => [id, { title: "x" }, [kinds[i % 4 === 0 ? 0 : 1]!]]),
      ...holders.map((id, i): Held => [id, { part: { $ref: items[i]! } }, [TYPE]]),
    ]),
    programs,
  ]);
  const either = call("or", call("type", ref(kinds[0]!)), call("type", ref(kinds[1]!)));
  expect(groups(many, call("group", either, "auto"))!.by).toBe("type");
});
