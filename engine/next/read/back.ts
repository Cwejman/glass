// The way back: a value proposed where a drawing stands, walked back through the
// expression that gave it to a change that would make the expression give it.
//
// A drawing stands at the uses walked from the root to the one that drew it (values.ts),
// and what it was given is that use's arguments, in the order of its component's input.
// From the argument a value is proposed for, the walk goes outward:
//   - a use of get(holon, key) ends it: the change is that holon with key set to the value;
//   - a use whose function names a reverse goes on into its first argument, given what
//     the reverse makes of the value, the other arguments held as they are;
//   - a placeholder goes on in the use one step out, at the placeholder's place in the
//     input of the component that use applies;
//   - anything else has no way back, and gives null.
//
// The walk only reads; whether the change is committed is for whoever proposed it.

import type { Holon } from "../../../stores/store.ts";
import { inputOf, knownAs, type Known } from "./input.ts";
import type { Calling, Native } from "./natives/natives.ts";
import { isRecord, isRef, type Value } from "./values.ts";

// What a holon's own keys say, kept apart from its body, so get gives them and no change
// of a body key reaches them.
const own = ["id", "name", "store", "instance", "mould"];

export function back({ field, apply }: Calling): Record<string, Native> {
  async function known(id: string): Promise<Known | null> {
    const kept = await field.holon(id);
    if (!kept) return null;

    const types = await Promise.all(kept.holon.instance.map((type) => field.holon(type)));
    return knownAs(
      kept.holon,
      types.flatMap((type) => (type ? [type.holon] : [])),
    );
  }

  // A use's function and arguments, where the holon is a use naming a function.
  async function useOf(id: string) {
    const found = await known(id);
    if (!found?.use) return null;

    const { fn, args } = found.holon.body;
    if (!isRef(fn)) return null;
    const applying = await known(fn.$ref);
    return applying ? { fn: applying.holon, args: Array.isArray(args) ? args : [] } : null;
  }

  // The argument of the last use of at that a function's input takes at a place. Where
  // an optional placeholder comes at or before it, what it takes depends on what fits,
  // and the walk stops.
  async function argument(at: readonly string[], place: number, value: Value): Promise<Value> {
    const use = at.length ? await useOf(at.at(-1)!) : null;
    if (!use || !(place in use.args)) return null;

    const input = inputOf(use.fn);
    if (input?.slice(0, place + 1).some((link) => link.$optional)) return null;
    return expression(use.args[place], at, value);
  }

  // An expression written in the last use of at, proposed a value.
  async function expression(written: unknown, at: readonly string[], value: Value): Promise<Value> {
    if (!isRef(written)) return null;

    const use = await useOf(written.$ref);
    if (use) {
      const { native, reverse } = use.fn.body;
      if (native === "get") return set(use.args, value);
      if (!isRef(reverse) || !use.args.length) return null;

      const [first, ...rest] = use.args;
      if (!rest.every(isLiteral)) return null;
      return expression(first, at, await apply(reverse, [value, ...(rest as Value[])]));
    }

    const around = at.length > 1 ? await useOf(at.at(-2)!) : null;
    const place = around && inputOf(around.fn)?.findIndex((link) => link.$ref === written.$ref);
    if (place === null || place === undefined || place < 0) return null;
    return argument(at.slice(0, -1), place, value);
  }

  // The change get(holon, key) is walked back to: the holon, its body's key the value.
  async function set([holon, key]: unknown[], value: Value): Promise<Value> {
    if (!isRef(holon) || typeof key !== "string" || own.includes(key)) return null;

    const found = await known(holon.$ref);
    if (!found || found.use) return null;

    const { id, instance, name, mould, body } = found.holon;
    const changed: Holon = {
      id,
      instance,
      ...(name !== undefined && { name }),
      ...(mould !== undefined && { mould }),
      body: { ...body, [key]: value },
    };
    return { holons: [changed], says: `${key} of ${name ?? id} set`, at: {} } as unknown as Value;
  }

  return {
    // back(at, place, value): the change that would make the drawing at at be given the
    // value at that place, or null where there is no way back.
    back: ([at, place, value]) =>
      Array.isArray(at) && at.every((id) => typeof id === "string") && typeof place === "number"
        ? argument(at as string[], place, value ?? null)
        : null,
  };
}

// A value written as it is: no reference anywhere in it, so it gives itself.
function isLiteral(written: unknown): boolean {
  if (written === null || typeof written !== "object") return true;
  if (isRef(written)) return false;
  return Array.isArray(written)
    ? written.every(isLiteral)
    : isRecord(written) && Object.values(written).every(isLiteral);
}
