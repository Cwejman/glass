// Reads any holon of the union back as text: a brief with its prose, a
// session with its utterances, a branch with its understandings, down to the
// words. Nothing is stored; the text is drawn from the holons each time.
// It reads from the packs: store/, and store/paper/ where it is present.
// Usage: bun src/tools/read.ts <name | id | wiki path> [depth]
//   bun src/tools/read.ts union            what stores there are
//   bun src/tools/read.ts README.md 1      the wiki's entry, its parts by title
//   bun src/tools/read.ts 2026-11-06-second the session, utterance by utterance

const [what, depthArg] = process.argv.slice(2);
const depth = Number(depthArg ?? 0);
import { field } from "./packs.ts";
const all: Map<string, any> = await field();
const typeName = (h: any) => all.get(h?.instance?.[0])?.name ?? (h?.mould ? "type" : "");
const get = (r: any) => all.get(r?.$ref);
const many = (v: any) => (Array.isArray(v) ? v : v ? [v] : []).map(get).filter(Boolean);

function inline(h: any): string {
  const t = typeName(h);
  if (t === "word") return (h.body.before ?? "") + h.body.text + (h.body.after ?? "");
  if (t === "sentence" || t === "emphasis" || t === "strong") return h.body.words ? many(h.body.words).map(inline).join(" ") : many(h.body.sentences).map(inline).join(" ");
  if (t === "link") return many(h.body.words).map(inline).join(" ");
  if (t === "codespan" || t === "closed") return h.body.text ?? "";
  if (h.body?.sentences) return many(h.body.sentences).map(inline).join(" ");
  return h.body?.text ?? h.body?.title ?? "";
}

function block(h: any, d: number, indent = ""): string[] {
  const t = typeName(h);
  const b = h.body ?? {};
  switch (t) {
    case "paragraph": case "item": return [indent + inline(h)];
    case "list": return many(b.items).flatMap((i: any) => [indent + "- " + inline(i), ...(i.body.list ? block(get(i.body.list), d, indent + "  ") : [])]);
    case "code": return ["```" + (b.language ?? ""), b.text, "```"];
    case "quote": return many(b.sentences ?? b.prose).map((x: any) => "> " + inline(x));
    case "table": return (b.rows ?? []).map((r: any) => "| " + (Array.isArray(r) ? r.map((c: any) => (c?.$ref ? inline(get(c)) : String(c))).join(" | ") : JSON.stringify(r)) + " |");
    case "break": return [b.mark];
    case "drawing": return b.lines;
    case "figure": return [`[${b.caption}]`];
    case "brief": case "section": {
      const out = [`${"#".repeat(Math.min(6, (b.level ?? 0) + 1))} ${b.number ? b.number + " " : ""}${b.title ?? ""}`];
      for (const p of many(b.prose ?? b.flow)) out.push("", ...block(p, d));
      const parts = many(b.parts ?? b.sections);
      if (parts.length) out.push("", ...(d > 0 ? parts.flatMap((p: any) => ["", ...block(p, d - 1)]) : parts.map((p: any) => `- ${p.body.title} (${p.body.path ?? p.name ?? p.id})`)));
      return out;
    }
    case "utterance": return [`## ${b.order}. (${b.as})`, ...many(b.flow).flatMap((p: any) => ["", ...block(p, d)])];
    case "session": {
      const out = [`# ${b.title}`, `${b.on}${b.beside ? " — " + b.beside : ""}`];
      if (d > 0) for (const u of many(b.said)) out.push("", ...block(u, d - 1));
      else out.push("", ...many(b.said).map((u: any) => `- ${u.body.order}. ${inline(many(u.body.flow)[0] ?? {}).slice(0, 90)}…`));
      out.push("", "Paths:", ...many(b.paths).map((p: any) => `- ${p.body.title} (${p.body.stands})`));
      return out;
    }
    case "path": return [`## ${b.title} (${b.stands})`, b.opens, "Rests on: " + (b.restsOn ?? []).join("; ")];
    case "branch": return [`# ${h.name} (${b.model}, seed from ${b.seedFrom})`, ...block(get(b.top), d + 4)];
    case "understanding": return [`${indent}${b.title}: ${b.prose} [matters: ${b.matters}]`, ...(d > 0 ? many(b.parts).filter((p: any) => typeName(p) === "understanding").flatMap((p: any) => block(p, d - 1, indent + "  ")) : [])];
    case "union": return ["# The union", ...b.stores.map((s: any) => `- ${s.name}: ${s.roots.length} root(s)${s.keeps ? ", " + s.keeps : ""}`)];
    case "type": return [`# ${h.name}`, b.says ?? "", ...Object.entries(h.mould ?? {}).map(([k, f]: any) => `- ${k}: ${f.says}${f.holds === true ? " (holds)" : f.holds === false ? " (points)" : ""}`)];
    case "statistic": return [`## ${b.title}`, b.says, "Gives: " + JSON.stringify(b.gives)];
    case "measures": return [...many(b.measures)].sort((x: any, y: any) => y.body.value - x.body.value).flatMap((m: any) => block(m, d));
    case "measure": {
      const [of] = many(b.of), first = many(of?.body?.flow)[0];
      const what = typeName(of) === "session" ? of.body.title : b.range ? `${inline(get(b.range.from)).slice(0, 60)} … ${inline(get(b.range.to)).slice(-60)}` : inline(first ?? of).slice(0, 110);
      return [`- ${b.value} ${b.as}${b.note ? ": " + b.note : ""}`, `    ${typeName(of)} ${of?.id}: ${what}`];
    }
    case "threads": return many(b.threads).flatMap((x: any) => block(x, d));
    case "thread": return [`- ${b.title} (${b.stands}): ${b.asks}`];
    default: return [indent + (inline(h) || JSON.stringify(b).slice(0, 300))];
  }
}

const found = all.get(what!) ?? [...all.values()].find((h) => h.name === what || h.body?.path === what) ?? [...all.values()].find((h) => h.body?.title === what);
if (!found) { console.error(`nothing named ${what}`); process.exit(1); }
console.log(block(found, depth).join("\n"));
