import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Body } from "../store/objects.ts";
import type { Holon } from "../store/store.ts";
import { resolve, rewriteLinks, walk, type WikiFile } from "./wiki.ts";

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

export interface ComponentFile {
  from: string;
  title: string;
  says: string;
  takes: string[];
  draws: string[];
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

export function components(files: ComponentFile[], idOf: IdOf, typeOf: Record<string, Id>): Born {
  return {
    holons: files.map(({ from, title, says, takes, draws, code, source }) => ({
      id: idOf(from),
      instance: [typeOf.component!],
      body: { title, says, takes: takes.map((type) => ({ $ref: typeOf[type]! })), draws, code, source, from },
    })),
    names: {},
  };
}

// The materials everything drawn is made of, each a style sheet.
export function materials(files: { from: string; title: string; says: string; css: string }[], idOf: IdOf, typeOf: Record<string, Id>): Born {
  return {
    holons: files.map(({ from, title, says, css }) => ({ id: idOf(from), instance: [typeOf.material!], body: { title, says, css, from } })),
    names: {},
  };
}

// The wiki: each file a brief or a record, each heading a brief beneath it,
// every link to a file or heading in the wiki made a reference to its holon.
export function wiki(files: ReadonlyMap<string, WikiFile>, entry: string, idOf: IdOf, typeOf: Record<string, Id>): Born {
  const idAt = (file: WikiFile, slug?: string) => {
    const section = slug ? file.slugs.get(slug) : file.root;
    return section && idOf(section === file.root ? file.path : `${file.path}#${section.slug}`);
  };
  const holons: Holon[] = [];
  const nowhere: string[] = [];
  for (const file of files.values())
    walk(file.root, (section) => {
      const prose = rewriteLinks(section.prose, (target) => {
        const to = resolve(file.path, target);
        if (!to || !to.path.endsWith(".md")) return undefined;
        const into = files.get(to.path);
        const id = into && idAt(into, to.anchor);
        if (!id) nowhere.push(`${file.path}: ${target}`);
        return id ? `ref:${id}` : undefined;
      });
      const body: Body = { title: section.title, prose };
      if (section.parts.length) body.parts = section.parts.map((part) => ({ $ref: idAt(file, part.slug)! }));
      if (section === file.root && file.status) body.status = file.status;
      body.from = section === file.root ? file.path : `${file.path}#${section.slug}`;
      holons.push({ id: idAt(file, section === file.root ? undefined : section.slug)!, instance: [typeOf[file.kind]!], body });
    });
  if (nowhere.length) throw new Error(`links that lead nowhere:\n  ${nowhere.join("\n  ")}`);
  return { holons, names: { wiki: idAt(files.get(entry)!)! } };
}

// The entry: the layout a client boots into, one mount of a component
// reading a holon.
export function entry(idOf: IdOf, typeOf: Record<string, Id>, component: Id, reads: Id): Born {
  const id = idOf("field/entry");
  return {
    holons: [
      {
        id,
        instance: [typeOf.layout!],
        body: { title: "Entry", mounts: [{ component: { $ref: component }, reads: { $ref: reads } }] as unknown as Json, from: "field/entry" },
      },
    ],
    names: { entry: id },
  };
}
