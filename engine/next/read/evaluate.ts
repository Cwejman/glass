// How a read is worked out: what it gives, over the field as the stores stood when the
// read began, and the holons the read carries. The field is not held here. Every holon is
// asked of the stores as it is needed (field.ts), so working a read out waits on them,
// and is asynchronous throughout.
//
// A holon the read already holds is used at once, and only one it waits on is awaited
// (maybe.ts), so the work stays in one turn wherever it can.
//
// What a read gives is JSON with references at any depth. A reference gives, in order:
// the value of a placeholder bound around it; what a use gives, if it points at one; a
// function held where it is written, as a lambda over the placeholders around it; and
// else the holon itself, a function among them as a value. A use is a holon of a type
// whose mould declares fn and args: it names the function it applies, and holds what it
// gives it.
//
// A function is a holon of a type whose mould declares input, the placeholders it takes,
// each held at its place and bound by its id. It gives in one of two ways: natively, by a
// small act in code its body names, or by what its body gives: the use it holds, most
// often, or JSON with held uses at their places, as a lambda's may be. A native is one
// of three: given values; lazy, given what it is given unworked, to work out only what it
// needs; or reading what it is given as written, as a pattern is.
//
// A component is a function drawn rather than worked out. Applied, it gives a drawing
// (values.ts): itself, what it was given bound to its input, and where it stands, the
// uses walked through component bodies from the root to the one applying it. One that
// holds a body gives what its body gives, worked out a step further along. A use that
// names no function is drawn too, its component null, for what draws it to find one.
// Where what a drawing is given fails, the drawing holds the problem in its place, so a
// text that does not read fails its answer alone, never the drawings beside it.

import type { Holon } from "../../../stores/store.ts";
import type { Heads, Read } from "../engine.ts";
import { fieldOf, type Field, type Stores } from "./field.ts";
import {
  fits,
  inputOf,
  isComponentType,
  kindsIn,
  knownAs,
  matched,
  placeAs,
  type Given,
  type Kinds,
  type Known,
  type Link,
  type Place,
} from "./input.ts";
import { natives, type Calling, type Deferred, type Written } from "./natives/natives.ts";
import { after, all, each, waits, type Maybe } from "./maybe.ts";
import { isVar } from "./patterns.ts";
import {
  closure,
  drawing,
  isClosure,
  isDrawing,
  isRecord,
  isRef,
  ref,
  type Rec,
  type Ref,
  type Value,
} from "./values.ts";

// The placeholders bound where a use is worked out, by id, and those around them; the
// offers nearest first, for an optional placeholder left unfilled; and the uses walked
// through component bodies to reach it, from the root.
export type Frame = {
  bound: ReadonlyMap<string, Value>;
  up?: Frame;
  offers: readonly Ref[];
  at: readonly string[];
};

// Where a function is applied: the uses walked to the frame applying it, and the use
// applying it, where a use does.
type Where = { around: readonly string[]; use?: string; up?: Frame };

// The most steps one read may take, so a function that never ends is stopped.
const most = 10_000_000;

// Works a read out over the stores, each at its head. Gives its value, or the problem
// that stopped it, and either way the stores it asked and the holons it found kept
// differently in two stores, where there were any.
export async function evaluate(
  { gives, holons = [] }: Read,
  stores: Stores,
  heads: Heads,
): Promise<({ value: Value } | { problem: string }) & { asked: string[]; diverged?: string[] }> {
  const field = fieldOf(stores, heads, holons);
  const seen = () => ({
    asked: [...field.asked],
    ...(field.diverged.size && { diverged: [...field.diverged].sort() }),
  });

  try {
    return { value: outward(await evaluator(field).give(gives)), ...seen() };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error), ...seen() };
  }
}

type Function = { name: string; native?: string; input?: Place[]; body?: unknown; component: boolean };

type Use = { fn: Link | null; args: unknown[]; offer: Ref[] };

export function evaluator(field: Field) {
  let steps = 0;
  const root: Frame = { bound: new Map(), offers: [], at: [] };

  const known = remembered(
    (id): Maybe<Known | null> =>
      after(field.holon(id), (kept) => {
        if (!kept) return null;

        const { holon } = kept;
        return after(all(holon.instance.map((type) => field.holon(type))), (found) => {
          return knownAs(
            holon,
            found.flatMap((type) => (type ? [type.holon] : [])),
          );
        });
      }),
  );

  // What a function takes and how it gives: natively, or by what its body gives.
  const functionOf = remembered(
    (id): Maybe<Function> =>
      after(known(id), (found) => {
        if (!found) throw new Error(`the function ${id} is not in the field`);

        const { holon, types, applicable } = found;
        const name = holon.name ?? id;
        if (!applicable) throw new Error(`${name} is not a function`);

        const { native, body } = holon.body;
        const links = inputOf(holon);
        return after(links && all(links.map(placeOf)), (input) => ({
          name,
          native: typeof native === "string" ? native : undefined,
          input,
          body,
          component: types.some(isComponentType),
        }));
      }),
  );

  function placeOf(link: Link): Maybe<Place> {
    return after(known(link.$ref), (found) => {
      if (!found) throw new Error(`the placeholder ${link.$ref} is not in the field`);
      return placeAs(link, found);
    });
  }

  const useOf = remembered(
    (id): Maybe<Use> =>
      after(known(id), (found) => {
        const { fn, args, offer } = (found?.holon.body ?? {}) as {
          fn?: unknown;
          args?: unknown;
          offer?: unknown;
        };
        if (fn !== undefined && fn !== null && !isRef(fn))
          throw new Error(`the use ${found?.holon.name ?? id} names no function, fn, to apply`);

        return {
          fn: fn ?? null,
          args: Array.isArray(args) ? args : [],
          offer: Array.isArray(offer) ? offer.filter(isRef).map(({ $ref }) => ({ $ref })) : [],
        };
      }),
  );

  // The kinds of value a placeholder may take, asked of the field once a read, and only
  // when a placeholder is first held to what it is given.
  let kindsFound: Maybe<Kinds> | undefined;
  const kinds = () => (kindsFound ??= kindsIn(field).then((found) => (kindsFound = found)));
  const fitting = (types: Holon[], given: Given) =>
    after(kinds(), (kinds) => fits(types, given, known, kinds));

  const calling: Calling = {
    field,
    apply: (fn, values) => applied(fn, values.map(valueGiven), [], { around: [] }),
  };
  const { given: byValue, lazy, structural } = natives(calling);

  // ---- Uses

  // What an argument gives where it is written: JSON as it is, each reference resolved.
  function argOf(arg: unknown, frame: Frame): Maybe<Value> {
    if (arg === null || typeof arg !== "object") return (arg ?? null) as Value;
    if (Array.isArray(arg)) return all(arg.map((each) => argOf(each, frame)));
    if (isRef(arg)) return referred(arg, frame);
    if (isVar(arg)) return boundIn(frame, `?${arg["?"]}`) ?? arg;

    const entries = Object.entries(arg);
    return after(all(entries.map(([, each]) => argOf(each, frame))), (values) =>
      Object.fromEntries(entries.map(([key], i) => [key, values[i]!])),
    );
  }

  function referred({ $ref: id, $holds }: Link, frame: Frame): Maybe<Value> {
    const bound = boundIn(frame, id);
    if (bound !== undefined) return bound;

    return after(known(id), (found) => {
      if (found?.use) return use(id, frame);
      if (found?.applicable && $holds) return closure(id, frame);
      return { $ref: id };
    });
  }

  // What a use gives. One worked out where no placeholder is bound gives the same
  // wherever it is reused, so it is worked out once a read.
  const atRoot = remembered((id) => worked(id, root));
  const use = (id: string, frame: Frame) => (frame === root ? atRoot(id) : worked(id, frame));

  function worked(id: string, frame: Frame): Maybe<Value> {
    if (++steps > most) throw new Error(`a read takes at most ${most.toLocaleString("en")} steps`);

    return after(useOf(id), ({ fn, args, offer }) => {
      const within: Frame = offer.length
        ? { bound: new Map(), up: frame, offers: [...offer, ...frame.offers], at: frame.at }
        : frame;
      const given = () => args.map((arg) => givenAt(arg, within));

      if (!fn) return drawn(null, [...frame.at, id], () => all(given().map(({ value }) => value())));

      return after(argOf(fn, within), (applying) => {
        if (isClosure(applying)) return applied(applying, given(), within.offers, { around: frame.at });
        if (!isRef(applying))
          throw new Error(`the use ${id} applies ${JSON.stringify(applying)}, not a function`);

        return after(functionOf(applying.$ref), ({ native }) => {
          if (native && structural[native]) return structural[native]!(args, writtenAt(within));
          if (native && lazy[native]) return lazy[native]!(args.map((arg) => deferredAt(arg, within)));
          return applied(applying, given(), within.offers, { around: frame.at, use: id });
        });
      });
    });
  }

  function givenAt(arg: unknown, frame: Frame): Given {
    const bound = isRef(arg) ? boundIn(frame, arg.$ref) : undefined;
    const written = bound !== undefined ? bound : isRef(arg) ? { $ref: arg.$ref } : arg;
    return { written, value: once(() => argOf(arg, frame)) };
  }

  // What a lazy native is given for an argument: worked out when asked, and a literal
  // record's one field alone when a case asks for it.
  function deferredAt(arg: unknown, frame: Frame): Deferred {
    return Object.assign(() => argOf(arg, frame), {
      key: (key: string) =>
        isRecord(arg) && !isVar(arg) && key in arg ? argOf((arg as Rec)[key], frame) : undefined,
    });
  }

  // ---- Functions

  // A function, as a value or a holon, given its arguments, the offers around, and where
  // it is applied. A lambda is worked out where it was written.
  function applied(fn: unknown, given: Given[], offers: readonly Ref[], where: Where): Maybe<Value> {
    if (isClosure(fn)) {
      const up = fn.frame as Frame;
      return called(fn.fn, given, up.offers, { around: up.at, up });
    }

    if (!isRef(fn)) return null;
    return after(field.holon(fn.$ref), (kept) => (kept ? called(fn.$ref, given, offers, where) : null));
  }

  // A function kept as a holon, given its arguments: its body worked out in a frame of
  // its placeholders bound, within the frame it was written in, if it was held there. A
  // component is drawn where it is applied, or its body worked out a step further there.
  function called(id: string, given: Given[], offers: readonly Ref[], where: Where): Maybe<Value> {
    const { around, use, up } = where;
    const place = use === undefined ? around : [...around, use];

    return after(functionOf(id), ({ name, native, input, body, component }) => {
      if (native && structural[native])
        throw new Error(`${name} reads what it is given as written, so it is called, not given to another`);
      if (native && lazy[native])
        return after(all(given.map(({ value }) => value())), (values) => lazy[native]!(values.map(valued)));
      if (native && byValue[native]) return after(valuesOf(input, given, offers), byValue[native]!);

      if (component && body === undefined) return drawn(ref(id), place, () => valuesOf(input, given, offers));
      if (body === undefined) throw new Error(`${name} names no native and holds no body`);

      const at = component ? place : (up?.at ?? around);
      return after(bind(input ?? [], given, offers), (bound) => argOf(body, { bound, up, offers, at }));
    });
  }

  // A drawing of what it is given, or of the problem working that out met.
  function drawn(component: Ref | null, at: readonly string[], given: () => Maybe<Value[]>): Maybe<Value> {
    const failed = (problem: unknown) =>
      drawing(component, [], at, problem instanceof Error ? problem.message : String(problem));

    try {
      const values = after(given(), (values) => drawing(component, values, at));
      return waits(values) ? values.catch(failed) : values;
    } catch (problem) {
      return failed(problem);
    }
  }

  // What a native is given: in the order of its input, where it has one.
  function valuesOf(input: Place[] | undefined, given: Given[], offers: readonly Ref[]): Maybe<Value[]> {
    if (!input) return all(given.map(({ value }) => value()));
    return placed(input, given, offers);
  }

  // The placeholders of an input bound by id to what is given.
  function bind(input: Place[], given: Given[], offers: readonly Ref[]): Maybe<Map<string, Value>> {
    return after(
      placed(input, given, offers),
      (values) => new Map(input.map(({ id }, i) => [id, values[i]!])),
    );
  }

  // What each placeholder of an input is given, in order. An optional one is passed over
  // where what comes next does not fit its type, or nothing is left; one left unfilled is
  // given the nearest offer of its type, else null. Where none is optional, each takes
  // the next, and nothing need be held to a type.
  function placed(input: Place[], given: Given[], offers: readonly Ref[]): Maybe<Value[]> {
    const fit = (place: Place, arg: Given) => fitting(place.types, arg);
    const taking = input.some(({ optional }) => optional)
      ? after(matched(input, given, fit), ({ taking }) => taking)
      : input.map((_, i) => i);

    return after(taking, (taking) =>
      all(
        input.map((place, i) => {
          const arg = given[taking[i] ?? given.length];
          if (!arg) return offered(place, offers);
          return place.itself ? (arg.written as Value) : arg.value();
        }),
      ),
    );
  }

  function offered(place: Place, offers: readonly Ref[]): Maybe<Value> {
    return each(
      offers,
      null as Value,
      (found, offer) =>
        found ?? after(fitting(place.types, valueGiven(offer)), (fit) => (fit ? offer : null)),
    );
  }

  // ---- Patterns

  // How find and explain read their arguments as written: a fact a literal list of
  // three, a clause a held use, and a test a held use reading ?variables, which are
  // bound in its frame as the pattern finds them.
  function writtenAt(frame: Frame): Written {
    const heldUse = (arg: unknown): Maybe<string | undefined> =>
      isRef(arg) ? after(known(arg.$ref), (found) => (found?.use ? arg.$ref : undefined)) : undefined;

    return {
      value: (arg) => argOf(arg, frame),
      fact: (arg) => (Array.isArray(arg) && arg.length === 3 ? arg : undefined),
      fields: (arg) => (isRecord(arg) && !isVar(arg) ? arg : undefined),
      called: (arg) =>
        after(heldUse(arg), (id) =>
          id === undefined
            ? undefined
            : after(useOf(id), ({ fn, args }) =>
                after(argOf(fn, frame), (applying) =>
                  isRef(applying)
                    ? after(functionOf(applying.$ref), ({ native }) => ({ native, given: args }))
                    : { given: args },
                ),
              ),
        ),
      test: (arg) =>
        after(heldUse(arg), (id) =>
          id === undefined
            ? undefined
            : after(varsIn(arg), (names) =>
                names.length
                  ? {
                      names,
                      holds: (values: Value[]) =>
                        use(id, {
                          bound: new Map(names.map((name, i) => [`?${name}`, values[i] ?? null])),
                          up: frame,
                          offers: frame.offers,
                          at: frame.at,
                        }),
                    }
                  : undefined,
              ),
        ),
    };
  }

  // The variables of a pattern an argument reads, within the uses it holds, each once.
  function varsIn(arg: unknown): Maybe<string[]> {
    if (isVar(arg)) return [arg["?"]];
    if (isRef(arg))
      return (arg as Link).$holds
        ? after(known(arg.$ref), (found) =>
            found?.use ? after(useOf(arg.$ref), ({ args }) => varsIn(args)) : [],
          )
        : [];
    if (arg === null || typeof arg !== "object") return [];

    return after(all(Object.values(arg).map(varsIn)), (found) => [...new Set(found.flat())]);
  }

  return { give: (gives: unknown) => argOf(gives, root) };
}

// A finding by id, kept for the rest of the read, and shared while it waits.
function remembered<T>(find: (id: string) => Maybe<T>): (id: string) => Maybe<T> {
  const kept = new Map<string, Maybe<T>>();
  return (id) => {
    if (kept.has(id)) return kept.get(id)!;

    const finding = after(find(id), (found) => (kept.set(id, found), found));
    if (waits(finding)) kept.set(id, finding);
    return finding;
  };
}

function once<T>(work: () => T): () => T {
  let done: { value: T } | undefined;
  return () => (done ??= { value: work() }).value;
}

const valueGiven = (value: Value): Given => ({ written: value, value: () => value });

// What a lazy native is given for a value already worked out.
function valued(value: Value): Deferred {
  return Object.assign(() => value, {
    key: (key: string) => (isRecord(value) ? (value as Rec)[key] : undefined),
  });
}

function boundIn(frame: Frame | undefined, key: string): Value | undefined {
  for (let at = frame; at; at = at.up) if (at.bound.has(key)) return at.bound.get(key)!;
  return undefined;
}

// A value as it leaves the engine: a function held where it was written as its id, a
// drawing as the record it holds.
function outward(value: Value): Value {
  if (isClosure(value)) return { function: value.fn };
  if (isDrawing(value)) {
    const { $draw, given, at, problem } = value;
    return { $draw, given: given.map(outward), at, ...(problem !== undefined && { problem }) };
  }
  if (Array.isArray(value)) return value.map(outward);
  if (typeof value === "object" && value !== null && !isRef(value))
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, outward(inner)]));

  return value;
}
