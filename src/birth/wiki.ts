import { dirname, join, normalize } from "node:path/posix";

// The wiki as files under the rule: each file a brief, or a record, with its
// sections as the briefs beneath it. A heading's number is where it stands,
// not part of its title, so the title is kept without it.

export interface Section {
  title: string;
  slug: string;
  prose: string;
  parts: Section[];
}

export interface WikiFile {
  path: string;
  kind: "brief" | "record";
  status?: string;
  root: Section;
  slugs: Map<string, Section>;
}

export function parseFile(path: string, text: string): WikiFile {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const meta = Object.fromEntries(
    (front?.[1] ?? "").split("\n").map((line) => line.split(/:\s*/, 2).map((part) => part.trim())),
  );

  const lines = linesOf(front ? text.slice(front[0].length) : text);
  const tops = lines.filter((line) => line.level === 1);
  if (tops.length === 0) throw new Error(`${path}: no heading`);
  if (tops.length > 1) throw new Error(`${path}: a second top heading, ${tops[1]!.text}`);

  const root = sectionOf(lines.slice(lines.indexOf(tops[0]!)), anchorsOf(lines));
  const slugs = new Map(flatten(root).map((section) => [section.slug, section]));

  return {
    path,
    kind: meta.kind === "record" ? "record" : "brief",
    ...(meta.status ? { status: meta.status } : {}),
    root,
    slugs,
  };
}

// A file's lines, each heading with its level. A line inside a fence of
// code is never a heading.
interface Line {
  text: string;
  level?: number;
}

function linesOf(text: string): Line[] {
  let fence: string | undefined;
  return text.split("\n").map((text) => {
    const marker = /^(```|~~~)/.exec(text)?.[1];
    if (marker) fence = fence === marker ? undefined : (fence ?? marker);
    const heading = fence || marker ? null : /^(#{1,6})\s+(.+?)\s*$/.exec(text);
    return heading ? { text: heading[2]!, level: heading[1]!.length } : { text };
  });
}

// Each heading's anchor, made unique in the order they stand, as GitHub
// makes them.
function anchorsOf(lines: Line[]): Map<Line, string> {
  const taken = new Set<string>();
  return new Map(
    lines
      .filter((line) => line.level)
      .map((line) => {
        const base = slug(line.text);
        let anchor = base;
        for (let n = 1; taken.has(anchor); n++) anchor = `${base}-${n}`;
        taken.add(anchor);
        return [line, anchor];
      }),
  );
}

// A heading and what stands under it: its prose, up to the first heading
// beneath it, and each heading one level down, with what stands under that.
function sectionOf([heading, ...rest]: Line[], anchors: Map<Line, string>): Section {
  const level = heading!.level!;
  const end = rest.findIndex((line) => line.level !== undefined && line.level <= level);
  const under = end === -1 ? rest : rest.slice(0, end);

  const firstHeading = under.findIndex((line) => line.level !== undefined);
  const prose = (firstHeading === -1 ? under : under.slice(0, firstHeading))
    .map(({ text }) => text)
    .join("\n")
    .trim();

  const partLevel = under[firstHeading]?.level;
  const parts = under.flatMap((line, i) =>
    line.level === partLevel && partLevel !== undefined ? [sectionOf(under.slice(i), anchors)] : [],
  );

  return { title: untitled(heading!.text), slug: anchors.get(heading!)!, prose, parts };
}

export const flatten = (section: Section): Section[] => [section, ...section.parts.flatMap(flatten)];

const untitled = (heading: string) => heading.replace(/^\d+(?:\.\d+)*(?:\.[a-z])?\.?\s+/, "");

// The anchor GitHub gives a heading, which the wiki's links use.
export function slug(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

// Every markdown link in prose outside code, with where it points.
const link = /(!?)\[((?:[^\][]|\[[^\]]*\])*)\]\(([^()\s]+)(\s+"[^"]*")?\)/g;

export function rewriteLinks(prose: string, rewrite: (target: string) => string | undefined): string {
  let fence: string | undefined;
  return prose
    .split("\n")
    .map((line) => {
      const marker = /^(```|~~~)/.exec(line)?.[1];
      if (marker) fence = fence === marker ? undefined : (fence ?? marker);
      if (fence || marker) return line;
      return line
        .split(/(`[^`]*`)/)
        .map((piece) =>
          piece.startsWith("`")
            ? piece
            : piece.replace(link, (whole, bang: string, text: string, target: string, title = "") => {
                if (bang) return whole;
                const to = rewrite(target);
                return to === undefined ? whole : `[${text}](${to}${title})`;
              }),
        )
        .join("");
    })
    .join("\n");
}

export function linkTargets(prose: string): string[] {
  const targets: string[] = [];
  rewriteLinks(prose, (target) => void targets.push(target));
  return targets;
}

// A target relative to the file it stands in, as a path in the wiki and an
// anchor; a target with a scheme, as an address elsewhere, is not resolved.
export function resolve(from: string, target: string): { path: string; anchor?: string } | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined;
  const [file, anchor] = target.split("#", 2) as [string, string | undefined];
  const path = file ? normalize(join(dirname(from), decodeURIComponent(file))) : from;
  return { path, ...(anchor ? { anchor } : {}) };
}
