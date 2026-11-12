// The engine as it was asked before reads were expressions: the forms of read the
// interface and the tests still send, each answered by the engine as it now is. It goes
// when they ask in the language.
//
// A way of looking, gather, level and groups, was a second kind of expression, read by
// its shape; it is kept here, read by the same shapes, over the world.

import type { LogEntry, Store, Version } from "../../integrations/glass/store.ts";
import type { Source } from "../../integrations/source.ts";
import { expressionProblem, isRef, type Expression, type Value } from "../../language/expression.ts";
import type { Change, Problem } from "./act.ts";
import { evaluator } from "./core/evaluate.ts";
import { engine as engineOf, type Committed } from "./engine.ts";
import { keepersOf, type Attachment, type Field } from "./field.ts";
import { answer, readHolon, readWhole, type HolonRead } from "./reading.ts";
import type { Holder, World } from "./world.ts";

export type { HolonRead, Holder };
export type Whole = { root: string; holons: Record<string, HolonRead> };
export type Attached = Attachment;

export type Axis = "type" | "parent" | "store";
export type Grouped = { by: Axis; groups: { value: string; count: number; gathers: Expression }[]; rest: string[] };

export type Read =
  | { holon: string }
  | { whole: string; stop?: string[]; depth?: number }
  | { named: string; store?: string }
  | { instances: string; store?: string }
  | { holders: string }
  | { log: string }
  | { versions: string }
  | { gather: Expression }
  | { level: Expression }
  | { groups: Expression }
  | { value: Expression };

export type Answer<R extends Read> = R extends { holon: string }
  ? HolonRead | null
  : R extends { whole: string }
    ? Whole
    : R extends { holders: string }
      ? readonly Holder[]
      : R extends { log: string }
        ? LogEntry[] | null
        : R extends { versions: string }
          ? Version[]
          : R extends { groups: Expression }
            ? Grouped | null
            : R extends { value: Expression }
              ? Value
              : string[];

export const notASet = "what is looked at is a set of holons, and this gives something else";

export type Engine = {
  attach(key: string, store: Source, options?: { write?: false }): Promise<void>;
  attach(key: string, store: Store, options: { write: true }): Promise<void>;
  renew(key: string, store: Source): Promise<void>;
  read<R extends Read>(query: R): Promise<Answer<R>>;
  judge(change: Change): Promise<Problem[]>;
  commit(change: Change): Promise<Committed>;
  onChange(listener: () => void): () => void;
};

export function startEngine(given: readonly Attached[] = []): Engine {
  const engine = engineOf(given);

  return {
    attach: (key: string, store: Source | Store, { write = false } = {}) =>
      engine.attach(write ? { key, store: store as Store, write: true } : { key, store }),
    renew: (key, store) => engine.moved(key, store),
    read: (query) => answerOf(engine.field(), query) as never,
    judge: engine.judge,
    commit: engine.commit,
    onChange: engine.onChange,
  } as Engine;
}

async function answerOf(field: Field, query: Read): Promise<unknown> {
  if ("holon" in query) return readHolon(field, query.holon);
  if ("whole" in query) return readWhole(field, query.whole, query.stop ?? [], query.depth ?? Number.POSITIVE_INFINITY);

  if ("log" in query) {
    const attachment = field.stores.find(({ key }) => key === query.log);
    return attachment ? attachment.store.log() : null;
  }

  if ("versions" in query) {
    const [first] = await keepersOf(field, query.versions);
    return first ? first.store.versions(query.versions) : [];
  }

  if ("named" in query || "instances" in query) {
    const matches = ({ holon }: { holon: { name?: string; instance: string[] } }) =>
      "named" in query ? holon.name === query.named : holon.instance.includes(query.instances);
    const held = query.store ? await field.holonsOf(query.store) : [...(await field.world()).known.values()];

    return held.filter(matches).map(({ holon }) => holon.id);
  }

  if ("value" in query) return (await answer(field, query.value)).value;

  const world = await field.world();
  if ("gather" in query) return gather(world, query.gather);
  if ("level" in query) return level(world, query.level);
  if ("groups" in query) return groups(world, query.groups);

  return world.holders(query.holders);
}

// ---- Ways of looking, read by their shapes

type Takes = "set" | "sets" | "words" | "store" | "axis";
type Definition = { native?: string; gives?: Expression; takes?: Takes[] };
const axes: readonly string[] = ["type", "parent", "store"];
const setKinds = new Set(["set", "sets", "words", "store", "axis"]);
type Call = { call: { $ref: string }; with?: Expression[] };

const isCall = (expression: Expression): expression is Call =>
  typeof expression === "object" && expression !== null && "call" in expression;

// A function a way of looking calls, and its arguments weighed against what it takes,
// where all it takes are sets, words, a store or an axis.
function definitionOf(world: World, call: Call) {
  const holon = world.known.get(call.call.$ref)?.holon;
  if (!holon) throw new Error(`${call.call.$ref} is not in the field`);

  const fn = holon.body as Definition;
  const title = holon.name ?? holon.id;
  if (!fn.native && !fn.gives) throw new Error(`${title} is not a function the engine can run`);

  const takes = fn.takes ?? [];
  const wrong = takes.every((kind) => setKinds.has(kind)) ? argumentsProblem(takes, call.with ?? []) : undefined;
  if (wrong) throw new Error(`${title} ${wrong}`);

  return fn;
}

function argumentsProblem(takes: Takes[], given: readonly Expression[]) {
  const variadic = takes.at(-1) === "sets";
  if (variadic ? given.length < takes.length : given.length !== takes.length)
    return `takes ${takes.length === 0 ? "nothing" : takes.join(", ")}, and was given ${given.length}`;

  for (const [i, argument] of given.entries()) {
    const kind = takes[Math.min(i, takes.length - 1)]!;
    const takesSet = kind === "set" || kind === "sets";

    if (takesSet === (typeof argument === "string")) return `takes ${takesSet ? "a set" : `a ${kind}`} as its argument ${i + 1}`;
    if (kind === "axis" && !axes.includes(argument as string)) return `groups by ${axes.join(", ")}`;
  }

  return undefined;
}

// A function of one's own whose gives is worked out by place, not a lambda.
const byPlace = (fn: Definition) =>
  fn.gives !== undefined && !(typeof fn.gives === "object" && fn.gives !== null && "fn" in fn.gives);

function substituted(expression: Expression, given: readonly Expression[]): Expression {
  if (Array.isArray(expression)) return expression.map((each) => substituted(each, given)) as never;
  if (typeof expression !== "object" || expression === null || "$ref" in expression) return expression;
  if ("arg" in expression) {
    if (given[expression.arg] === undefined) throw new Error(`there is no argument ${expression.arg + 1}`);
    return given[expression.arg]!;
  }
  if (!("call" in expression)) return expression;

  return { call: expression.call, ...(expression.with ? { with: expression.with.map((each) => substituted(each, given)) } : {}) };
}

export function gather(world: World, expression: Expression): string[] {
  if (isRef(expression)) return world.known.has(expression.$ref) ? [expression.$ref] : [];

  const problem = expressionProblem(expression);
  if (problem) throw new Error(problem);
  if (isCall(expression)) definitionOf(world, expression);

  const sets = gathered.get(world) ?? new Map<string, string[]>();
  gathered.set(world, sets);
  const key = JSON.stringify(expression);
  if (sets.has(key)) return sets.get(key)!;

  const value = evaluator(world).evaluate(expression);
  if (!Array.isArray(value) || !value.every(isRef)) throw new Error(notASet);

  const set = [...new Set(value.map(({ $ref }) => $ref))]
    .filter((id) => world.place.has(id))
    .sort((a, b) => world.place.get(a)! - world.place.get(b)!);

  sets.set(key, set);
  return set;
}

// What each world has gathered, by the expression's text.
const gathered = new WeakMap<World, Map<string, string[]>>();

// What nothing in a set holds; flat is the whole set, deliberately.
export function level(world: World, expression: Expression, nested = 0): string[] {
  if (isCall(expression) && nested < 32) {
    const fn = definitionOf(world, expression);
    if (byPlace(fn)) return level(world, substituted(fn.gives!, expression.with ?? []), nested + 1);
    if (fn.native === "flat") return gather(world, expression);
  }

  const set = gather(world, expression);
  const members = new Set(set);
  const tops = set.filter((id) => !world.holders(id).some(({ from, holds }) => holds && members.has(from)));

  return tops.length ? tops : set;
}

export function groups(world: World, expression: Expression, nested = 0): Grouped | null {
  if (!isCall(expression) || nested >= 32) return null;

  const fn = definitionOf(world, expression);
  if (fn.gives) return byPlace(fn) ? groups(world, substituted(fn.gives, expression.with ?? []), nested + 1) : null;
  if (fn.native !== "group") return null;

  const [inner, by] = (expression.with ?? []) as [Expression, Axis];
  const members = gather(world, inner);
  const values = new Map<string, string[]>();

  for (const id of members)
    for (const value of along(world, id, by)) {
      const list = values.get(value);
      if (list) list.push(id);
      else values.set(value, [id]);
    }

  for (const [value, list] of values) if (list.length === members.length) values.delete(value);

  const valued = new Set([...values.values()].flat());

  return {
    by,
    groups: [...values]
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([value, list]) => ({ value, count: list.length, gathers: narrowed(world, inner, by, value) })),
    rest: members.filter((id) => !valued.has(id)),
  };
}

function along(world: World, id: string, axis: Axis): readonly string[] {
  if (axis === "type") return world.known.get(id)!.holon.instance;
  if (axis === "store") return world.storesOf(id);

  return [...new Set(world.holders(id).filter(({ holds }) => holds).map(({ from }) => from))];
}

// The function holon each native is first found in, found once for each world.
const nativesFound = new WeakMap<World, Map<string, string>>();

function nativeId(world: World, name: string) {
  if (!nativesFound.has(world)) {
    const found = new Map<string, string>();
    for (const { holon } of world.known.values()) {
      const native = (holon.body as Definition).native;
      if (typeof native === "string" && !found.has(native)) found.set(native, holon.id);
    }
    nativesFound.set(world, found);
  }

  return nativesFound.get(world)!.get(name);
}

function narrowed(world: World, inner: Expression, by: Axis, value: string): Expression {
  const call = (name: string, ...given: Expression[]): Expression => ({ call: { $ref: nativeId(world, name)! }, with: given });
  const calls = (expression: Expression, name: string) => isCall(expression) && expression.call.$ref === nativeId(world, name);

  const narrow =
    by === "type" ? call("type", { $ref: value }) : by === "parent" ? call("children", { $ref: value }) : call("store", value);

  if (calls(inner, "everything")) return narrow;

  return call("and", ...(calls(inner, "and") ? ((inner as Call).with ?? []) : [inner]), narrow);
}
