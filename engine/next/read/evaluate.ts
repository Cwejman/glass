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
// small act in code its body names, or by the use it holds as its body. A native is one
// of three: given values; lazy, given what it is given unworked, to work out only what it
// needs; or reading what it is given as written, as a pattern is.
//
// Until the earlier form of an expression goes, a read written in it, a record keyed
// call, fn, var, arg, list or record, is worked out as it was, and a function of that
// form gives an expression of its own.

import {
  expressionProblem,
  isRef,
  type Expression,
  type Ref,
  type Value,
} from "../../../language/expression.ts";
import type { Holon } from "../../../stores/store.ts";
import type { Heads, Read } from "../engine.ts";
import { fieldOf, type Field, type Stores } from "./field.ts";
import {
  fits,
  inputOf,
  knownAs,
  matched,
  placeAs,
  type Given,
  type Known,
  type Link,
  type Place,
} from "./input.ts";
import { natives, type Calling, type Deferred, type Written } from "./natives/natives.ts";
import { after, all, each, waits, type Maybe } from "./maybe.ts";
import { isVar } from "./patterns.ts";
import { closure, isClosure, isRecord, type Closure, type Rec } from "./values.ts";

// What a lambda of the earlier form closes over: the words around it, and a function of
// one's own's places.
export type Scope = { words: Record<string, Value>; up?: Scope; args?: Value[] };

// The placeholders bound where a use is worked out, by id, and those around them; and
// the offers nearest first, for an optional placeholder left unfilled.
export type Frame = { bound: ReadonlyMap<string, Value>; up?: Frame; offers: readonly Ref[] };

// The most steps one read may take, so a function that never ends is stopped.
const most = 10_000_000;

// The keys an expression of the earlier form is written with.
const earlier = ["call", "fn", "var", "arg", "list", "record"];

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
    const reading = evaluator(field);
    if (!isEarlier(gives)) return { value: outward(await reading.give(gives)), ...seen() };

    const problem = expressionProblem(gives);
    if (problem) throw new Error(problem);
    return { value: outward(await reading.evaluate(gives as Expression)), ...seen() };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error), ...seen() };
  }
}

const isEarlier = (gives: unknown) => isRecord(gives) && earlier.some((key) => key in (gives as object));

type Function = { name: string; native?: string; input?: Place[]; body?: string; gives?: Expression };

type Use = { fn: Link; args: unknown[]; offer: Ref[] };

export function evaluator(field: Field) {
  let steps = 0;
  const root: Frame = { bound: new Map(), offers: [] };

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

  // What a function takes and how it gives: a native, a use held as its body, or an
  // expression of the earlier form.
  const functionOf = remembered(
    (id): Maybe<Function> =>
      after(known(id), (found) => {
        if (!found) throw new Error(`the function ${id} is not in the field`);

        const { holon, applicable } = found;
        const body = holon.body as { native?: unknown; input?: unknown; body?: unknown; gives?: Expression };
        const name = holon.name ?? id;
        if (!applicable) return { name, gives: body.gives };

        const links = inputOf(holon);
        const input = links && all(links.map(placeOf));
        return after(input, (input) => ({
          name,
          native: typeof body.native === "string" ? body.native : undefined,
          input,
          body: isRef(body.body) ? body.body.$ref : undefined,
          gives: body.gives,
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
        if (!isRef(fn)) throw new Error(`the use ${found?.holon.name ?? id} names no function, fn, to apply`);

        return {
          fn,
          args: Array.isArray(args) ? args : [],
          offer: Array.isArray(offer) ? offer.filter(isRef).map(({ $ref }) => ({ $ref })) : [],
        };
      }),
  );

  const calling: Calling = { field, apply: (fn, values) => applied(fn, values.map(valueGiven), []) };
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
      if (found?.applicable && $holds) return closure(id, undefined, frame);
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
      const at = offer.length ? { bound: new Map(), up: frame, offers: [...offer, ...frame.offers] } : frame;
      const given = () => args.map((arg) => givenAt(arg, at));

      return after(argOf(fn, at), (applying) => {
        if (isClosure(applying)) return applied(applying, given(), at.offers);
        if (!isRef(applying))
          throw new Error(`the use ${id} applies ${JSON.stringify(applying)}, not a function`);

        return after(functionOf(applying.$ref), ({ native }) => {
          if (native && structural[native]) return structural[native]!(args, writtenAt(at));
          if (native && lazy[native]) return lazy[native]!(args.map((arg) => deferredAt(arg, at)));
          return applied(applying, given(), at.offers);
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

  // A function, as a value or a holon, given its arguments, and the offers around.
  function applied(fn: unknown, given: Given[], offers: readonly Ref[]): Maybe<Value> {
    if (isClosure(fn))
      return typeof fn.fn === "string"
        ? called(fn.fn, given, (fn.scope as Frame).offers, fn.scope as Frame)
        : after(all(given.map(({ value }) => value())), (values) => lambda(fn, values));

    if (!isRef(fn)) return null;
    return after(field.holon(fn.$ref), (kept) => (kept ? called(fn.$ref, given, offers) : null));
  }

  // A function kept as a holon, given its arguments: its body worked out in a frame of
  // its placeholders bound, within the frame it was written in, if it was held there.
  function called(id: string, given: Given[], offers: readonly Ref[], up?: Frame): Maybe<Value> {
    return after(functionOf(id), ({ name, native, input, body, gives }) => {
      if (native && structural[native])
        throw new Error(`${name} reads what it is given as written, so it is called, not given to another`);
      if (native && lazy[native])
        return after(all(given.map(({ value }) => value())), (values) => lazy[native]!(values.map(valued)));
      if (native && byValue[native]) return after(valuesOf(input, given, offers), byValue[native]!);

      if (body) return after(bind(input ?? [], given, offers), (bound) => use(body, { bound, up, offers }));
      if (gives === undefined) throw new Error(`${name} is not a function`);

      return after(all(given.map(({ value }) => value())), (values) => {
        const written = gives as { fn?: string[]; gives?: Expression };
        return Array.isArray(written?.fn)
          ? lambda(closure(written.fn, written.gives, { words: {} }) as Closure, values)
          : evaluate(gives, { words: {}, args: values });
      });
    });
  }

  // What a native is given: in the order of its input, where it has one.
  function valuesOf(input: Place[] | undefined, given: Given[], offers: readonly Ref[]): Maybe<Value[]> {
    if (!input) return all(given.map(({ value }) => value()));
    return after(bind(input, given, offers), (bound) => input.map(({ id }) => bound.get(id) ?? null));
  }

  // The placeholders of an input bound by id to what is given, in order. An optional one
  // is passed over where what comes next does not fit its type, or nothing is left; one
  // left unfilled is given the nearest offer of its type, else null.
  function bind(input: Place[], given: Given[], offers: readonly Ref[]): Maybe<Map<string, Value>> {
    const fit = (place: Place, arg: Given) => fits(place.types, arg, known);

    return after(matched(input, given, fit), ({ taking }) => {
      const values = input.map((place, i) => {
        const arg = given[taking[i] ?? given.length];
        if (!arg) return offered(place, offers);
        return place.itself ? (arg.written as Value) : arg.value();
      });
      return after(all(values), (values) => new Map(input.map(({ id }, i) => [id, values[i]!])));
    });
  }

  function offered(place: Place, offers: readonly Ref[]): Maybe<Value> {
    return each(
      offers,
      null as Value,
      (found, offer) =>
        found ?? after(fits(place.types, valueGiven(offer), known), (fit) => (fit ? offer : null)),
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

  // ---- The earlier form

  function lambda(fn: Closure, values: Value[]): Maybe<Value> {
    const words = Object.fromEntries((fn.fn as string[]).map((word, i) => [word, values[i] ?? null]));
    return evaluate(fn.gives as Expression, { words, up: fn.scope as Scope });
  }

  function evaluate(expression: Expression, scope: Scope = { words: {} }): Maybe<Value> {
    if (++steps > most) throw new Error(`a read takes at most ${most.toLocaleString("en")} steps`);
    return form(expression, scope);
  }

  function form(expression: Expression, scope: Scope): Maybe<Value> {
    if (expression === null || typeof expression !== "object") return expression ?? null;
    if (Array.isArray(expression)) throw new Error("a list is written { list: [ … ] }");

    if ("$ref" in expression) return { $ref: expression.$ref };
    if ("var" in expression) return wordIn(scope, expression.var);
    if ("arg" in expression) return argumentIn(scope, expression.arg);
    if ("fn" in expression) return closure(expression.fn, expression.gives, scope);
    if ("?" in expression)
      throw new Error(`?${expression["?"]} is a pattern's variable, and stands only within find`);
    if ("list" in expression) return all(expression.list.map((each) => evaluate(each, scope)));
    if ("record" in expression) {
      const entries = Object.entries(expression.record);
      return after(all(entries.map(([, each]) => evaluate(each, scope))), (values) =>
        Object.fromEntries(entries.map(([key], i) => [key, values[i]!])),
      );
    }

    if ("call" in expression) {
      const id = expression.call.$ref;
      const written = expression.with ?? [];

      return after(functionOf(id), ({ native }) => {
        if (native && structural[native]) return structural[native]!(written, writtenIn(scope));
        if (native && lazy[native]) return lazy[native]!(written.map((each) => deferred(each, scope)));

        return after(all(written.map((each) => evaluate(each, scope))), (values) =>
          called(id, values.map(valueGiven), []),
        );
      });
    }

    throw new Error(`not an expression: ${JSON.stringify(expression).slice(0, 80)}`);
  }

  // What a lazy native is given for an expression: worked out when asked, and a record's
  // one field alone when a case asks for it.
  function deferred(expression: Expression, scope: Scope): Deferred {
    const record = (expression as { record?: Record<string, Expression> } | null)?.record;
    return Object.assign(() => evaluate(expression, scope), {
      key: (key: string) => (record && key in record ? evaluate(record[key]!, scope) : undefined),
    });
  }

  // How find and explain read an expression of the earlier form: a fact { list: [3] },
  // a clause a call, and a test a lambda of the variables it reads.
  function writtenIn(scope: Scope): Written {
    return {
      value: (arg) => evaluate(arg as Expression, scope),
      fact: (arg) => {
        const list = (arg as { list?: unknown } | null)?.list;
        return Array.isArray(list) && list.length === 3 ? list : undefined;
      },
      fields: (arg) => (arg as { record?: Record<string, unknown> } | null)?.record,
      called: (arg) => {
        const call = arg as { call?: { $ref?: string }; with?: unknown[] } | null;
        const id = call?.call?.$ref;
        if (!id) return undefined;
        return after(field.holon(id), (kept) =>
          kept ? after(functionOf(id), ({ native }) => ({ native, given: call!.with ?? [] })) : undefined,
        );
      },
      test: (arg) => {
        const words = (arg as { fn?: unknown } | null)?.fn;
        if (!Array.isArray(words)) return undefined;
        return after(evaluate(arg as Expression, scope), (fn) => ({
          names: words as string[],
          holds: (values: Value[]) => calling.apply(fn, values),
        }));
      },
    };
  }

  return {
    give: (gives: unknown) => argOf(gives, root),
    evaluate: (expression: Expression) => evaluate(expression),
  };
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

function wordIn(scope: Scope | undefined, word: string): Value {
  for (let at = scope; at; at = at.up) if (word in at.words) return at.words[word]!;
  throw new Error(`${word} is not a word any lambda around it takes`);
}

function argumentIn(scope: Scope | undefined, place: number): Value {
  for (let at = scope; at; at = at.up) if (at.args) return at.args[place] ?? null;
  throw new Error("an argument is given only within a function of one's own");
}

// A value as it leaves the engine: a lambda as the words it takes, a function held where
// it was written as its id.
function outward(value: Value): Value {
  if (isClosure(value)) return { function: typeof value.fn === "string" ? value.fn : value.fn.join(", ") };
  if (Array.isArray(value)) return value.map(outward);
  if (typeof value === "object" && value !== null && !isRef(value))
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, outward(inner)]));

  return value;
}
