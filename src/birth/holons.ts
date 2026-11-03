import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Body } from "../store/objects.ts";
import type { Holon } from "../store/store.ts";
import { typeProblem } from "../engine/types.ts";
import { readForms, type Declaration } from "../interface/component.ts";
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

// A component as it declares itself: a module, with its code built and its
// source as written, or data, with the mounts of its template, each kind
// given by its name.
export interface ComponentFile extends Declaration {
  from: string;
  code?: string;
  source?: string;
  template?: { argument: Json; kind?: string }[];
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
  const wrong = files.flatMap((file) =>
    declarationProblems(file, typeOf, kindOf).map((problem) => `${file.from}: ${problem}`),
  );
  if (wrong.length) throw new Error(`components that declare what is not so:\n  ${wrong.join("\n  ")}`);
  return {
    holons: files.map(
      ({ from, title, says, takes, kinds, argument, settings, reads, code, source, template }) => ({
        id: idOf(from),
        instance: [typeOf.component!],
        body: {
          title,
          says,
          takes: takes.map((type) => ({ $ref: typeOf[type]! })),
          kinds: kinds.map((kind) => ({ $ref: kindOf[kind]! })),
          ...(argument ? { argument } : {}),
          ...(settings ? { settings: settings as unknown as Json } : {}),
          ...(reads ? { reads } : {}),
          ...(code !== undefined ? { code } : {}),
          ...(source !== undefined ? { source } : {}),
          ...(template
            ? {
                template: template.map(({ argument, kind }) => ({
                  argument,
                  ...(kind ? { kind: { $ref: kindOf[kind]! } } : {}),
                })),
              }
            : {}),
          from,
        },
      }),
    ),
    names: {},
  };
}

// What a component declares that is not so: a type or a kind the field
// does not name, a read form there is not, settings not said as fields, or
// neither code nor a template to be drawn by, or a template that gives
// anything but `$`.
function declarationProblems(
  { takes, kinds, reads, settings, argument, code, template }: ComponentFile,
  typeOf: Record<string, Id>,
  kindOf: Record<string, Id>,
): string[] {
  const notLists = Object.entries({ takes, kinds, reads: reads ?? [] })
    .filter(([, value]) => !Array.isArray(value))
    .map(([key]) => `${key} is not a list`);
  if (notLists.length) return notLists;
  return [
    ...(argument !== undefined && !["holon", "list", "selection"].includes(argument)
      ? [`it is given ${argument}, which is not a holon, a list or a selection`]
      : []),
    ...((code === undefined) === (template === undefined)
      ? ["it is made of code or of a template, one of them"]
      : []),
    ...(template ?? []).flatMap(({ argument, kind }, i) => [
      ...(argument !== "$" ? [`its template's mount ${i} gives ${JSON.stringify(argument)}, not $`] : []),
      ...(kind !== undefined && !Object.hasOwn(kindOf, kind)
        ? [`its template's mount ${i} is a ${kind} slot, which is no kind`]
        : []),
    ]),
    ...takes
      .filter((type) => !Object.hasOwn(typeOf, type))
      .map((type) => `it takes ${type}, which is no type`),
    ...kinds
      .filter((kind) => !Object.hasOwn(kindOf, kind))
      .map((kind) => `it draws in ${kind}, which is no kind`),
    ...(reads ?? [])
      .filter((form) => !(readForms as readonly string[]).includes(form))
      .map((form) => `it reads ${form}, which is no read`),
    ...[settings === undefined ? undefined : typeProblem({ fields: settings as unknown as Json })].filter(
      (problem) => problem !== undefined,
    ),
  ] as string[];
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

// The wiki: each file a brief, each heading a brief beneath it, every link
// to a file or heading in the wiki made a reference to its holon. A file the
// rule keeps as a record, by time, is a brief that says its parts are kept
// so.
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
    if (file.kind === "record") body.kept = "time";
    body.from = fromOf(file, section);

    return { id: idOf(fromOf(file, section)), instance: [typeOf.brief!], body };
  };

  const holons = [...files.values()].flatMap((file) =>
    flatten(file.root).map((section) => holonOf(file, section)),
  );
  if (nowhere.length) throw new Error(`links that lead nowhere:\n  ${nowhere.join("\n  ")}`);

  return { holons, names: { wiki: idAt(entry)! } };
}

export interface ExpressionFile {
  name: string;
  title: string;
  gathers: Json;
}

// The ways of looking the field ships, each an expression held as a holon
// and named. In the files a holon is given by the name the field gives it,
// as `{ "instances": "brief" }`, and made a reference to what it names.
export function expressions(files: ExpressionFile[], idOf: IdOf, typeOf: Record<string, Id>): Born {
  const fromOf = (name: string) => `field/expressions.json#${name}`;
  const holonKeys = new Set(["instances", "pointing"]);
  const resolved = (value: Json, at: string): Json => {
    if (Array.isArray(value)) return value.map((inner) => resolved(inner, at));
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => {
        if (typeof inner !== "string" || !holonKeys.has(key)) return [key, resolved(inner, at)];
        if (!Object.hasOwn(typeOf, inner)) throw new Error(`${at}: ${key} names ${inner}, which is no type`);
        return [key, { $ref: typeOf[inner]! }];
      }),
    );
  };
  return {
    holons: files.map(({ name, title, gathers }) => ({
      id: idOf(fromOf(name)),
      instance: [typeOf.expression!],
      body: { title, gathers: resolved(gathers, fromOf(name)), from: fromOf(name) },
    })),
    names: Object.fromEntries(files.map(({ name }) => [name, idOf(fromOf(name))])),
  };
}

export interface EntryFile {
  title: string;
  component?: string;
  argument: string[];
}

// The entry: the mount a client boots into before the reader has one of
// their own, its component given by its title and each holon of its
// argument by the name the field gives it.
export function entry(
  file: EntryFile,
  idOf: IdOf,
  typeOf: Record<string, Id>,
  named: Record<string, Id>,
  componentTitled: Record<string, Id>,
): Born {
  const from = "field/entry.json";
  const nameOf = (name: string, among: Record<string, Id>) => {
    if (!Object.hasOwn(among, name)) throw new Error(`${from}: ${name}, which the field does not name`);
    return { $ref: among[name]! };
  };
  const body = {
    title: file.title,
    ...(file.component ? { component: nameOf(file.component, componentTitled) } : {}),
    argument: file.argument.map((name) => nameOf(name, named)),
    from,
  };
  const id = idOf(from);
  return { holons: [{ id, instance: [typeOf.mount!], body }], names: { entry: id } };
}
