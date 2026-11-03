import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Body } from "../store/objects.ts";
import type { Holon } from "../store/store.ts";
import { flatten, resolve, rewriteLinks, type Section, type WikiFile } from "./wiki.ts";

// What glass's field is, as holons, made from what its files hold. Each
// function takes what was read and gives holons and the names they are
// known by; nothing here reads a file or writes a store. An id is asked of
// `idOf` by where the holon comes from, so the same file and heading is
// always the same holon.

export type IdOf = (from: string) => Id;

export interface Born {
  holons: Holon[];
  names: Record<string, Id>;
}

export interface TypeFile {
  from: string;
  name: string;
  body: Body;
}

export interface MaterialFile {
  from: string;
  title: string;
  says: string;
  css: string;
}

export interface ComponentFile {
  from: string;
  title: string;
  says: string;
  takes: string[];
  kinds: string[];
  argument?: string;
  code: string;
  source: string;
}

// The types, each an instance of the type of types, which is one of itself.
export function types(files: TypeFile[], idOf: IdOf, typeOfTypes: string): Born {
  const type = idOf(typeOfTypes);
  return {
    holons: files.map(({ from, body }) => ({ id: idOf(from), instance: [type], body: { ...body, from } })),
    names: Object.fromEntries(files.map(({ from, name }) => [name, idOf(from)])),
  };
}

export interface KindFile {
  name: string;
  title: string;
  says: string;
}

// The kinds of slot, the words a holder and the held share.
export function kinds(files: KindFile[], idOf: IdOf, typeOf: Record<string, Id>): Born {
  const fromOf = (name: string) => `field/kinds.json#${name}`;
  return {
    holons: files.map(({ name, title, says }) => ({
      id: idOf(fromOf(name)),
      instance: [typeOf.kind!],
      body: { title, says, from: fromOf(name) },
    })),
    names: Object.fromEntries(files.map(({ name }) => [name, idOf(fromOf(name))])),
  };
}

export function components(
  files: ComponentFile[],
  idOf: IdOf,
  typeOf: Record<string, Id>,
  kindOf: Record<string, Id>,
): Born {
  return {
    holons: files.map(({ from, title, says, takes, kinds, argument, code, source }) => ({
      id: idOf(from),
      instance: [typeOf.component!],
      body: {
        title,
        says,
        takes: takes.map((type) => ({ $ref: typeOf[type]! })),
        kinds: kinds.map((kind) => ({ $ref: kindOf[kind]! })),
        ...(argument ? { argument } : {}),
        code,
        source,
        from,
      },
    })),
    names: {},
  };
}

// The materials everything drawn is made of, each a style sheet.
export function materials(files: MaterialFile[], idOf: IdOf, typeOf: Record<string, Id>): Born {
  return {
    holons: files.map(({ from, title, says, css }) => ({
      id: idOf(from),
      instance: [typeOf.material!],
      body: { title, says, css, from },
    })),
    names: {},
  };
}

// The wiki: each file a brief or a record, each heading a brief beneath it,
// every link to a file or heading in the wiki made a reference to its holon.
export function wiki(
  files: ReadonlyMap<string, WikiFile>,
  entry: string,
  idOf: IdOf,
  typeOf: Record<string, Id>,
): Born {
  const fromOf = (file: WikiFile, section: Section) =>
    section === file.root ? file.path : `${file.path}#${section.slug}`;

  const idAt = (path: string, anchor?: string) => {
    const file = files.get(path);
    const section = file && (anchor ? file.slugs.get(anchor) : file.root);
    return file && section && idOf(fromOf(file, section));
  };

  const nowhere: string[] = [];
  const holonOf = (file: WikiFile, section: Section): Holon => {
    const prose = rewriteLinks(section.prose, (target) => {
      const to = resolve(file.path, target);
      if (!to || !to.path.endsWith(".md")) return undefined;
      const id = idAt(to.path, to.anchor);
      if (!id) nowhere.push(`${file.path}: ${target}`);
      return id && `ref:${id}`;
    });

    const body: Body = { title: section.title, prose };
    if (section.parts.length) body.parts = section.parts.map((part) => ({ $ref: idOf(fromOf(file, part)) }));
    if (section === file.root && file.status) body.status = file.status;
    body.from = fromOf(file, section);

    return { id: idOf(fromOf(file, section)), instance: [typeOf[file.kind]!], body };
  };

  const holons = [...files.values()].flatMap((file) =>
    flatten(file.root).map((section) => holonOf(file, section)),
  );
  if (nowhere.length) throw new Error(`links that lead nowhere:\n  ${nowhere.join("\n  ")}`);

  return { holons, names: { wiki: idAt(entry)! } };
}

// The entry: the layout a client boots into, one mount standing at the
// field itself, drawn by whatever is found for it.
export function entry(idOf: IdOf, typeOf: Record<string, Id>): Born {
  const id = idOf("field/entry");
  const body = { title: "Entry", mounts: [{ projects: "field" }] as unknown as Json, from: "field/entry" };
  return { holons: [{ id, instance: [typeOf.layout!], body }], names: { entry: id } };
}
