// Completion in the bar: what is being typed where the caret stands, and what may finish
// it. After a pipe, or at the start, it is a function's name, and the functions that
// exist are offered, every one where nothing of the name is typed yet, natives and those written in the field alike, each with what it
// says and what it takes; after @, a holon, offered by name with what it is, and taken
// as the language says it, by its route.
//
// What exists is read through the engine, as any holon may be asked: the functions are
// the instances of the type function, the holons those with a name. Each is read once a
// page, and what matches what is typed is found here.

import type { Read } from "../../engine/next/engine.ts";
import { isRecord, isRef, ref, type Value } from "../../engine/next/read/values.ts";
import { applying, applyingEach } from "./carried.ts";
import type { Space } from "./chassis.ts";

// What is being typed: its kind, where it begins, and what of it is typed so far.
export type Completing = { kind: "function" | "holon"; from: number; typed: string };

// What may finish it: what it is called, what it takes and says, and the text it puts in.
export type Option = { name: string; takes?: string; says?: string; insert: string };

export function completing(text: string, caret = text.length): Completing | undefined {
  const before = text.slice(0, caret);
  if (!before.trim()) return undefined;

  const holon = /@("?)([^"|(),[\]{}]*)$/.exec(before);
  if (holon && (holon[1] || !/\s/.test(holon[2]!)))
    return { kind: "holon", from: holon.index, typed: holon[2]! };

  const fn = /(^|\|)\s*([A-Za-z_][\w]*)?$/.exec(before);
  if (fn) return { kind: "function", from: caret - (fn[2]?.length ?? 0), typed: fn[2] ?? "" };
  return undefined;
}

// The candidates whose names hold what is typed: those beginning with it first, then the
// shorter, then by name; all by name where nothing is typed; at most so many.
export function matching<T extends { name: string }>(candidates: readonly T[], typed: string, most = 8): T[] {
  const wanted = typed.toLowerCase();
  return candidates
    .flatMap((each) => {
      const at = each.name.toLowerCase().indexOf(wanted);
      return at < 0 ? [] : [{ each, first: at === 0 ? 0 : 1 }];
    })
    .sort(
      (a, b) =>
        a.first - b.first ||
        (wanted ? a.each.name.length - b.each.name.length : 0) ||
        a.each.name.localeCompare(b.each.name),
    )
    .slice(0, most)
    .map(({ each }) => each);
}

// A name a function is called by, as the language reads a word.
const callable = /^[A-Za-z_]\w*$/;

type Named = { id: string; name: string };

// What completes what is typed, read through the space: the functions and the named
// holons, each list read once.
export function completer(space: Pick<Space, "read" | "glass">) {
  let functions: Promise<Option[]> | undefined;
  let named: Promise<Named[]> | undefined;

  const found = async (text: string): Promise<Value> => {
    const parsed = await space.read(applying(space.glass, "parse", text));
    if (!("value" in parsed)) throw new Error(parsed.problem);
    const answer = await space.read(parsed.value as unknown as Read);
    if (!("value" in answer)) throw new Error(answer.problem);
    return answer.value;
  };

  const functionsNow = () =>
    (functions ??= found(
      `find(?f, [?f, "instance", @${space.glass.function}]) | map(f => {name: f.name, says: f.says, takes: f.input | map(p => p.name)})`,
    ).then((read) => {
      const seen = new Set<string>();
      return (Array.isArray(read) ? read : []).flatMap((each): Option[] => {
        if (!isRecord(each)) return [];
        const { name, says, takes } = each as Record<string, Value>;
        if (typeof name !== "string" || !callable.test(name) || seen.has(name)) return [];
        seen.add(name);
        const placeholders = Array.isArray(takes) ? takes.filter((take) => typeof take === "string") : [];
        return [
          {
            name,
            insert: name,
            ...(placeholders.length && { takes: placeholders.join(", ") }),
            ...(typeof says === "string" && says && { says }),
          },
        ];
      });
    }));

  const namedNow = () =>
    (named ??= found(`find({h: ?h, n: ?n}, [?h, "name", ?n])`).then((read) =>
      (Array.isArray(read) ? read : []).flatMap((each): Named[] => {
        const { h, n } = (isRecord(each) ? each : {}) as Record<string, Value>;
        return isRef(h ?? null) && typeof n === "string"
          ? [{ id: (h as { $ref: string }).$ref, name: n }]
          : [];
      }),
    ));

  // The holons named so, each said by what it is and taken by its route.
  async function holons(typed: string): Promise<Option[]> {
    const chosen = matching(await namedNow(), typed);
    if (!chosen.length) return [];
    const [read, printed] = await Promise.all([
      space.read(
        applyingEach(
          space.glass,
          "holon",
          chosen.map(({ id }) => [ref(id)]),
        ),
      ),
      space.read(
        applyingEach(
          space.glass,
          "print",
          chosen.map(({ id }) => [{ gives: ref(id) } as unknown as Value]),
        ),
      ),
    ]);
    const reads = "value" in read && Array.isArray(read.value) ? read.value : [];
    const texts = "value" in printed && Array.isArray(printed.value) ? printed.value : [];
    return chosen.map(({ id, name }, i) => {
      const { types, store } = (isRecord(reads[i]) ? reads[i] : {}) as Record<string, Value>;
      const kind = [
        Array.isArray(types) ? types.join(", ") : "",
        typeof store === "string" ? `in ${store}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        name,
        ...(kind && { says: kind }),
        insert: typeof texts[i] === "string" ? texts[i] : `@${id}`,
      };
    });
  }

  return async ({ kind, typed }: Completing): Promise<Option[]> =>
    kind === "holon" ? holons(typed) : matching(await functionsNow(), typed, typed ? 8 : Infinity);
}

export type Completer = ReturnType<typeof completer>;

// The text once an option is taken: what was being typed put in its place, and the caret
// after it.
export function taken(text: string, caret: number, { from }: Completing, { insert }: Option) {
  const next = text.slice(0, from) + insert + text.slice(caret);
  return { text: next, caret: from + insert.length };
}
