// Rewrites briefs in the main store, as one commit. Each brief gets a new version and
// its old flow stays in its history; ids stay, so every link to a brief still leads there.
// Usage: bun author/rewrite.ts <patch.json>
//
// A patch is a list of what to change, each by the brief's id:
//   { "id": "...", "name": "a new name", "flow": [ ... ], "says": "..." }
// and of what to bring in, under a whole, first among its parts or after one of them:
//   { "new": "its name", "under": "the whole's id", "after": "a part's id", "flow": [ ... ] }
// and of a brief moved to another whole, or to another place in its own:
//   { "move": "its id", "under": "the whole's id", "after": "a part's id" }
// and of a brief let go, with all it alone holds; its versions stay in the history:
//   { "letGo": "its id" }
// and the stale marks it resolves:
//   { "resolves": ["id of a brief marked stale"] }
// and what the commit says of itself:
//   { "says": "..." }
//
// A flow lists, in order: a string, a new paragraph in marked prose; { "keep": i }, what
// stood at place i of the old flow; { "keep": i, "change": [[from, to]] }, that paragraph
// said again with its words changed; { "code": "...", "language": "..." }; { "list": [...] };
// { "mount": "a brief's id" }, a brief placed in the flow as a break, and so no longer among
// the parts of the brief whose flow it stands in.

import { mouldOf, partsOf, references } from "../engine/moulds.ts";
import { handles } from "../engine/handles.ts";
import { localEngine } from "../engine/serve/local.ts";
import { markedWriter, proseWriter } from "./prose.ts";
import { holonsOf, open, storeFolder, type Holon } from "../stores.ts";

type FlowItem =
  | string
  | { keep: number; change?: [string, string][] }
  | { code: string; language?: string }
  | { list: string[] }
  | { mount: string };

type Edit =
  | { id: string; name?: string; flow?: FlowItem[] }
  | { new: string; under: string; after?: string; flow: FlowItem[] }
  | { move: string; under: string; after?: string }
  | { letGo: string }
  | { resolves: string[] }
  | { says: string };

const held = (id: string) => ({ $ref: id, $holds: true });

const patch: Edit[] = await Bun.file(process.argv[2]!).json();
const store = await open(await storeFolder("main"));
const holons = await holonsOf(store);
const byId = new Map(holons.map((holon) => [holon.id, holon]));
const handle = handles();

const writer = proseWriter(holons, handle);
const marked = markedWriter(writer);
const { types, put } = writer;
const changed = new Set<Holon>();
const replaced = new Set<string>();

const refsOf = (list: unknown) => ((list ?? []) as { $ref: string }[]).map(({ $ref }) => $ref);

// A paragraph said again as marked prose: the same marks it holds, in words.
function said(id: string): string {
  const { body, instance } = byId.get(id)!;
  const type = byId.get(instance[0]!)?.name;

  if (type === "word") return `${body.before ?? ""}${body.text}${body.after ?? ""}`;
  if (type === "codespan" || type === "closed") return `\`${body.text}\``;

  const inside = [...refsOf(body.sentences), ...refsOf(body.words)].map(said).join(" ");

  if (type === "link") return `[${inside}](${body.leads?.$ref ?? body.to})`;
  if (type === "emphasis") return `*${inside}*`;
  if (type === "strong") return `**${inside}**`;

  return inside;
}

function flowOf(before: { $ref: string }[], flow: FlowItem[], name: string) {
  return flow.map((item) => {
    if (typeof item === "string") return held(marked.paragraph(item));
    if ("code" in item)
      return held(put("code", { text: item.code, ...(item.language ? { language: item.language } : {}) }));
    if ("list" in item)
      return held(put("list", { items: item.list.map((text) => ({ $ref: marked.item(text) })) }));
    if ("mount" in item) {
      if (!byId.has(item.mount)) throw new Error(`${name} mounts ${item.mount}, which is not in the store`);
      return held(item.mount);
    }

    const kept = before[item.keep];
    if (!kept) throw new Error(`${name} has nothing at place ${item.keep}`);
    if (!item.change) return kept;

    let text = said(kept.$ref);

    for (const [from, to] of item.change) {
      if (!text.includes(from))
        throw new Error(`${name}, place ${item.keep}: no “${from.slice(0, 60)}” in “${text.slice(0, 120)}”`);
      // A function, for a string here would read a `$ in the text as a pattern.
      text = text.replace(from, () => to);
    }

    return held(marked.paragraph(text));
  });
}

// The whole that holds a brief among its parts.
const wholeOf = (id: string) => holons.find((holon) => refsOf(holon.body.parts).includes(id));

// A part placed in a whole: after the part named, or first.
function place(whole: Holon, id: string, after?: string) {
  const parts = (whole.body.parts ?? []) as { $ref: string }[];
  const at = after === undefined ? 0 : parts.findIndex(({ $ref }) => $ref === after) + 1;
  if (after !== undefined && at === 0) throw new Error(`${whole.name} holds no ${after}`);

  whole.body.parts = [...parts.slice(0, at), { $ref: id }, ...parts.slice(at)];
  changed.add(whole);
}

function unplace(id: string) {
  const whole = wholeOf(id);
  if (!whole) throw new Error(`nothing holds ${id} among its parts`);

  whole.body.parts = whole.body.parts.filter(({ $ref }: { $ref: string }) => $ref !== id);
  changed.add(whole);
}

for (const edit of patch) {
  if ("says" in edit) continue;

  if ("move" in edit) {
    unplace(edit.move);
    place(byId.get(edit.under)!, edit.move, edit.after);
    continue;
  }

  if ("letGo" in edit) {
    unplace(edit.letGo);
    replaced.add(edit.letGo);
    continue;
  }

  if ("resolves" in edit) {
    const measures = holons.filter(
      (holon) => byId.get(holon.instance[0]!)?.name === "measure" && holon.body.as === "stale",
    );

    for (const brief of edit.resolves) {
      const measure = measures.find(({ body }) => refsOf(body.of).includes(brief));
      if (!measure) throw new Error(`no stale mark on ${brief}`);

      measure.body.as = "resolved";
      changed.add(measure);
    }
  } else if ("new" in edit) {
    const whole = byId.get(edit.under)!;
    const id = handle();

    writer.born.push({
      id,
      instance: [types.brief!],
      name: edit.new,
      body: { parts: [], prose: flowOf([], edit.flow, edit.new) },
    });
    place(whole, id, edit.after);
  } else {
    const brief = byId.get(edit.id);
    if (!brief) throw new Error(`no holon ${edit.id}`);

    if (edit.name) brief.name = edit.name;

    if (edit.flow) {
      const before = refsOf(brief.body.prose);

      brief.body.prose = flowOf(brief.body.prose, edit.flow, brief.name ?? edit.id);

      const after = new Set(refsOf(brief.body.prose));
      for (const id of before) if (!after.has(id)) replaced.add(id);

      // A brief mounted in the flow is no longer among the parts as well.
      brief.body.parts = (brief.body.parts ?? []).filter(({ $ref }: { $ref: string }) => !after.has($ref));
    }

    changed.add(brief);
  }
}

const mouldFor = (holon: Holon) => mouldOf(holon.instance.map((type) => byId.get(type)));

// What a rewrite stops holding leaves the field, with all it alone held; its versions
// stay in the history. What anything else still refers to stays, and is said so.
function nothingElseHolds() {
  const going = new Set<string>();
  const queue = [...replaced];

  while (queue.length) {
    const id = queue.pop()!;
    if (going.has(id)) continue;

    going.add(id);
    queue.push(...partsOf(byId.get(id)!.body, mouldFor(byId.get(id)!)));
  }

  // A markdown form only says how a holon was written, so it goes with that holon.
  const formsHolder = holons.find(({ name }) => name === "wiki-markdown");
  const isForm = (holon: Holon) => byId.get(holon.instance[0]!)?.name === "markdown";

  for (const holon of holons) {
    if (isForm(holon) && references(holon.body).some(({ id }) => going.has(id))) going.add(holon.id);
  }

  if (formsHolder) {
    formsHolder.body.forms = formsHolder.body.forms.filter(({ $ref }: { $ref: string }) => !going.has($ref));
    changed.add(formsHolder);
  }

  const staying = holons.filter((holon) => !going.has(holon.id));

  for (let settled = false; !settled; ) {
    settled = true;

    for (const holon of [...staying]) {
      for (const { id } of references(holon.body)) {
        if (!going.delete(id)) continue;

        console.log(`kept, still referred to by ${holon.name ?? holon.id}: ${id}`);
        staying.push(byId.get(id)!);
        settled = false;
      }
    }
  }

  return [...going];
}

const gone = nothingElseHolds();

const born = writer.born;

const done = await (
  await localEngine({ writes: ["main"] })
).commit({
  holons: [...changed, ...born],
  gone,
  says: patch.flatMap((edit) => ("says" in edit ? [edit.says] : [])).join(" ") || "Briefs rewritten",
});

for (const { id, name, instance } of born)
  if (instance[0] === types.brief) console.log(`born: ${done.ids[id]} ${name}`);
console.log({ changed: changed.size, born: born.length, gone: gone.length, commit: done.commit });
