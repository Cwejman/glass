// What a holon shown compactly, as a card, a row or a link, says of itself. The rules are
// generic, taken in order: a brief, or any holon of prose, says its first paragraph; a
// holon that says something, what it says; one keeping a text, its text; a whole, how
// many of each it holds, by key; and last, quietly, what it is and where it is kept. A
// holon with no name is called by its text where it keeps a short one, else by what it
// is.

import { isRef, type Value } from "../../engine/read/values.ts";

// A holon as the native holon reads it, as far as a summary needs.
export type Said = {
  name?: string;
  types: string[];
  store?: string;
  body: Record<string, Value>;
};

export type Summary = { title: string; says?: string; kind: string };

// So long a text may be and still stand as a holon's title.
const titled = 80;

export function saidOf(read: Value): Said | undefined {
  if (read === null || typeof read !== "object" || Array.isArray(read)) return undefined;
  const { name, types, store, body } = read as Record<string, Value>;
  return {
    ...(typeof name === "string" && { name }),
    types: Array.isArray(types) ? types.filter((type): type is string => typeof type === "string") : [],
    ...(typeof store === "string" && { store }),
    body:
      body !== null && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, Value>)
        : {},
  };
}

// The paragraph a holon of prose opens with, a brief's or an utterance's: the first of
// its flow, kept under prose or flow.
export function ledeOf(read: Said | undefined): string | undefined {
  const flow = read?.body.prose ?? read?.body.flow;
  const first = Array.isArray(flow) ? flow[0] : undefined;
  return first && isRef(first) ? first.$ref : undefined;
}

// What a holon is called where it has no name: its text, or what it is.
export function titleOf(read: Said | undefined, id: string): string {
  if (read?.name) return read.name;
  const text = read?.body.text;
  if (typeof text === "string" && text.trim() && text.length <= titled && !text.includes("\n")) return text;
  const type = read?.types.find((each) => each !== "type") ?? read?.types[0];
  return type ? `${/^[aeiou]/i.test(type) ? "an" : "a"} ${type}` : `@${id}`;
}

// The keys that say only that a whole holds what is under them.
const holding = new Set(["holds", "contents"]);

// How many of each a whole holds, by the key it holds them under: "4,486 lexemes"; under
// a key saying only that it holds them, so many held.
export function countsOf(body: Record<string, Value>): string | undefined {
  const counted = Object.entries(body)
    .filter(([, held]) => Array.isArray(held) && held.length > 0 && held.every(isRef))
    .map(([key, held]) => {
      const n = (held as Value[]).length;
      const what = holding.has(key) ? "held" : n === 1 ? key.replace(/ies$/, "y").replace(/s$/, "") : key;
      return `${n.toLocaleString("en")} ${what}`;
    });
  return counted.length ? counted.join(" · ") : undefined;
}

// A holon said compactly: its title, what it says by the first rule that holds, and the
// quiet line of its types and store. A brief's first paragraph is given, read already.
export function summaryOf(read: Said | undefined, id: string, lede?: string): Summary {
  const title = titleOf(read, id);
  const body = read?.body ?? {};
  const text = typeof body.text === "string" && body.text !== title ? body.text : undefined;
  const says = lede ?? (typeof body.says === "string" ? body.says : undefined) ?? text ?? countsOf(body);
  const root = read?.name !== undefined && read.name === read.store;
  const kind = [read?.types.join(", "), !root && read?.store && `in ${read.store}`]
    .filter(Boolean)
    .join(" · ");
  return { title, ...(says?.trim() && { says: says.trim() }), kind };
}

// The keys most of these holons keep, for a table of them: each kept by at least half,
// and by two at least, none of them a long list; at most so many.
export function sharedKeys(reads: (Said | undefined)[], most = 6): string[] {
  const kept = new Map<string, number>();
  for (const read of reads)
    for (const [key, value] of Object.entries(read?.body ?? {}))
      if (!(Array.isArray(value) && value.length > 4)) kept.set(key, (kept.get(key) ?? 0) + 1);
  const enough = Math.max(2, Math.ceil(reads.length / 2));
  return [...kept]
    .filter(([, n]) => n >= enough)
    .map(([key]) => key)
    .slice(0, most);
}

// The way a list of holons is shown: as cards, as rows, or as a table of what they keep.
export type Mode = "cards" | "rows" | "table";

// So many holons are shown as cards at first; more, as rows.
const few = 24;

export const modeFor = (count: number): Mode => (count <= few ? "cards" : "rows");
