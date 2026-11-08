// Rewrites briefs in the main store, as one commit. Each brief gets a new version and
// its old flow stays in its history; ids stay, so every link to a brief still leads there.
// Usage: bun src/tools/rewrite.ts <patch.json>
//
// A patch is a list of what to change, each by the brief's id:
//   { "id": "...", "name": "a new name", "flow": [ ... ], "says": "..." }
// and of what to bring in, under a whole:
//   { "new": "its name", "under": "the whole's id", "flow": [ ... ] }
// and the stale marks it resolves:
//   { "resolves": ["id of a brief marked stale"] }
//
// A flow lists, in order: a string, a new paragraph in marked prose; { "keep": i }, what
// stood at place i of the old flow; { "keep": i, "change": [[from, to]] }, that paragraph
// said again with its words changed; { "code": "...", "language": "..." }; { "list": [...] }.

import { mouldOf, type Mould } from "../engine/moulds.ts";
import { partsOf, references } from "../engine/references.ts";
import { commit } from "../store/store.ts";
import { markedWriter, proseWriter } from "./prose.ts";
import { holonsOf, open, storeDir, type Holon } from "./stores.ts";

type FlowItem =
  | string
  | { keep: number; change?: [string, string][] }
  | { code: string; language?: string }
  | { list: string[] };

type Edit =
  | { id: string; name?: string; flow?: FlowItem[] }
  | { new: string; under: string; flow: FlowItem[] }
  | { resolves: string[] };

const held = (id: string) => ({ $ref: id, $holds: true });

const patch: Edit[] = await Bun.file(process.argv[2]!).json();
const store = await open(storeDir);
const holons = await holonsOf(store);
const byId = new Map(holons.map((holon) => [holon.id, holon]));
const mint = store.minter();

const writer = proseWriter(holons, mint);
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

    const kept = before[item.keep];
    if (!kept) throw new Error(`${name} has nothing at place ${item.keep}`);
    if (!item.change) return kept;

    let text = said(kept.$ref);

    for (const [from, to] of item.change) {
      if (!text.includes(from))
        throw new Error(`${name}, place ${item.keep}: no “${from.slice(0, 60)}” in “${text.slice(0, 120)}”`);
      text = text.replace(from, to);
    }

    return held(marked.paragraph(text));
  });
}

for (const edit of patch) {
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
    const id = mint();

    writer.born.push({
      id,
      instance: [types.brief!],
      name: edit.new,
      body: { parts: [], prose: flowOf([], edit.flow, edit.new) },
    });
    whole.body.parts = [{ $ref: id }, ...whole.body.parts];
    changed.add(whole);
  } else {
    const brief = byId.get(edit.id);
    if (!brief) throw new Error(`no holon ${edit.id}`);

    if (edit.name) brief.name = edit.name;

    if (edit.flow) {
      const before = refsOf(brief.body.prose);

      brief.body.prose = flowOf(brief.body.prose, edit.flow, brief.name ?? edit.id);

      const after = new Set(refsOf(brief.body.prose));
      for (const id of before) if (!after.has(id)) replaced.add(id);
    }

    changed.add(brief);
  }
}

if (writer.lexiconGrew()) changed.add(writer.lexicon);

const mouldFor = (holon: Holon) =>
  mouldOf(holon.instance.map((type) => byId.get(type)?.mould as Mould | undefined));

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

const born = writer.born.sort((a, b) => (a.id < b.id ? -1 : 1));

const { blocks, bytes } = await commit(store, {
  holons: [...changed, ...born],
  gone,
  says: "The wiki brought to what stands: its briefs on the store, the client and the interface rewritten, their stale marks resolved",
});

console.log({ changed: changed.size, born: born.length, gone: gone.length, blocks, bytes });
