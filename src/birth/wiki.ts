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
    (front?.[1] ?? "").split("\n").map((line) => line.split(/:\s*/, 2).map((part) => part.trim()) as [string, string]),
  );
  const lines = (front ? text.slice(front[0].length) : text).split("\n");

  const slugs = new Map<string, Section>();
  const stack: { level: number; section: Section; lines: string[] }[] = [];
  let root: Section | undefined;
  let fence: string | undefined;

  const close = (level: number) => {
    while (stack.length && stack.at(-1)!.level >= level) {
      const done = stack.pop()!;
      done.section.prose = done.lines.join("\n").trim();
    }
  };

  for (const line of lines) {
    const marker = /^(```|~~~)/.exec(line)?.[1];
    if (marker) fence = fence === marker ? undefined : (fence ?? marker);
    const heading = fence ? null : /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!heading) {
      stack.at(-1)?.lines.push(line);
      continue;
    }
    const level = heading[1]!.length;
    const section: Section = { title: untitled(heading[2]!), slug: unique(slug(heading[2]!), slugs), prose: "", parts: [] };
    slugs.set(section.slug, section);
    close(level);
    if (stack.length) stack.at(-1)!.section.parts.push(section);
    else if (root) throw new Error(`${path}: a second top heading, ${heading[2]}`);
    else root = section;
    stack.push({ level, section, lines: [] });
  }
  close(0);
  if (!root) throw new Error(`${path}: no heading`);
  return { path, kind: meta.kind === "record" ? "record" : "brief", ...(meta.status ? { status: meta.status } : {}), root, slugs };
}

const untitled = (heading: string) => heading.replace(/^\d+(?:\.\d+)*(?:\.[a-z])?\.?\s+/, "");

// The anchor GitHub gives a heading, which the wiki's links use.
export function slug(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function unique(base: string, taken: Map<string, unknown>) {
  if (!taken.has(base)) return base;
  let n = 1;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
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
  rewriteLinks(prose, (target) => {
    targets.push(target);
    return undefined;
  });
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

export function walk(root: Section, visit: (section: Section) => void) {
  visit(root);
  for (const part of root.parts) walk(part, visit);
}
