// A read is an expression, and its answer a value. There are two ways to answer it.
// A holon, or a whole with what it holds, named by its id, is read by identity: a few
// blocks, nothing else of the field. Anything else is worked out over the world, every
// attached store read whole, once for the field; where it lacks a store's history, the
// history is read and the expression worked out again.
//
// What a read touched is said with its answer: the holons read by identity, or the
// whole field, so a subscription is answered again only when what it read changes.

import { asHolon, type Holon } from "../integrations/glass/store.ts";
import { expressionProblem, isRef, type Expression, type Value } from "../language/expression.ts";
import { evaluator } from "./core/evaluate.ts";
import { isClosure } from "./core/values.ts";
import { keepersOf, keptIn, type Field } from "./field.ts";
import { mouldOf, partsOf } from "./moulds.ts";
import { isLack } from "./world.ts";

export type Touched = { holons: readonly string[] } | "everything";

export type Answered = { value: Value; touched: Touched };

export async function answer(field: Field, expression: Expression): Promise<Answered> {
  const problem = expressionProblem(expression);
  if (problem) throw new Error(problem);

  return (
    (await byIdentity(field, expression)) ?? {
      value: await overWorld(field, expression),
      touched: "everything",
    }
  );
}

// ---- Over the world

async function overWorld(field: Field, expression: Expression): Promise<Value> {
  const world = await field.world();

  for (;;) {
    try {
      return outward(evaluator(world).evaluate(expression));
    } catch (thrown) {
      if (!isLack(thrown)) throw thrown;
      await field.logOf(thrown.lacks.log);
    }
  }
}

// A value as it leaves the engine: a lambda as the words it takes.
function outward(value: Value): Value {
  if (isClosure(value)) return { function: value.fn.join(", ") };
  if (Array.isArray(value)) return value.map(outward);
  if (typeof value === "object" && value !== null && !isRef(value))
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, outward(inner)]));

  return value;
}

// ---- By identity

// holon(@id) or whole(@id, depth, stop), answered from blocks, if that is what was asked.
async function byIdentity(field: Field, expression: Expression): Promise<Answered | undefined> {
  if (typeof expression !== "object" || expression === null || !("call" in expression)) return undefined;

  const [first, depth, stop] = expression.with ?? [];
  if (!isRef(first) || (depth !== undefined && typeof depth !== "number")) return undefined;

  const native = await nativeIn(field, expression.call.$ref);
  if (native === "holon") {
    const read = await readHolon(field, first.$ref);
    return {
      value: read as Value,
      touched: { holons: [first.$ref, expression.call.$ref, ...(read?.instance ?? [])] },
    };
  }

  const stopAt = stop === undefined ? [] : asStrings(stop);
  if (native === "whole" && stopAt) {
    const whole = await readWhole(field, first.$ref, stopAt, depth ?? Number.POSITIVE_INFINITY);
    const types = Object.values(whole.holons).flatMap(({ instance }) => instance);
    return {
      value: whole as unknown as Value,
      touched: { holons: [expression.call.$ref, ...Object.keys(whole.holons), ...types] },
    };
  }

  return undefined;
}

const asStrings = (value: Expression) =>
  typeof value === "object" &&
  value !== null &&
  "list" in value &&
  value.list.every((each) => typeof each === "string")
    ? (value.list as string[])
    : undefined;

// The native a function holon names, if it is one.
async function nativeIn(field: Field, id: string) {
  const fn = await keptIn(field, id);
  const native = (fn?.holon.body as { native?: unknown } | undefined)?.native;
  if (typeof native !== "string") return undefined;

  const types = await Promise.all(fn!.holon.instance.map((type) => keptIn(field, type)));
  return types.some((type) => type?.holon.name === "function" && type.holon.mould) ? native : undefined;
}

export type HolonRead = Holon & { store: string; version: string; types: string[] };

// The names of what a holon is, as a reader is given them: "type" where it is one.
export const typeNames = (holon: Holon, types: readonly (Holon | null | undefined)[]) => [
  ...(holon.mould ? ["type"] : []),
  ...types.flatMap((type) => (type?.name ? [type.name] : [])),
];

export async function readHolon(field: Field, id: string): Promise<HolonRead | null> {
  const kept = await keptIn(field, id);
  if (!kept) return null;

  const types = await Promise.all(
    kept.holon.instance.map(async (type) => (await keptIn(field, type))?.holon ?? null),
  );
  return { ...kept.holon, store: kept.store, version: kept.block!, types: typeNames(kept.holon, types) };
}

// A whole: a holon and what it holds, a layer of blocks at a time, down to a depth,
// reading but never entering what is of a type named in stop.
export async function readWhole(field: Field, root: string, stop: readonly string[], depth: number) {
  const holons: Record<string, HolonRead> = {};
  const types = new Map<string, Promise<Holon | null>>();
  const typeOf = (id: string) => {
    if (!types.has(id))
      types.set(
        id,
        keptIn(field, id).then((kept) => kept?.holon ?? null),
      );
    return types.get(id)!;
  };

  for (let layer = [root], down = 0; layer.length && down <= depth; down++) {
    const fresh = [...new Set(layer)].filter((id) => !holons[id]);
    const read = await Promise.all(fresh.map((id) => keepersOf(field, id).then(([first]) => first)));
    const next: string[] = [];

    for (const found of read) {
      if (!found) continue;

      const holon = asHolon(found.latest.version);
      const its = await Promise.all(holon.instance.map(typeOf));
      holons[holon.id] = {
        ...holon,
        store: found.key,
        version: found.latest.block,
        types: typeNames(holon, its),
      };

      const stopped = holon.id !== root && holons[holon.id]!.types.some((type) => stop.includes(type));
      if (!stopped) next.push(...partsOf(holon.body, mouldOf(its)));
    }

    layer = next;
  }

  return { root, holons };
}
