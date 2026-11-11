// A git repository read as a field, at the command line: its commits, trees, blobs and
// refs as holons of four types of its own, each id derived from the object's own hash, so
// the same object is the same holon in every clone. It is read only, through git's own
// `cat-file`, which reads loose objects and packs alike. A name belongs to the tree that
// holds a thing, so a tree's entries say the names, and a blob says only its size.
//
// What it gives as everything is what is reached from the tip: the refs, the commits a
// few steps back, and the tip's tree all the way down. Anything older is read when asked.

import { derivedId, derivedOf, isDerived, type Latest, type LogEntry, type Version } from "../glass/store.ts";
import type { Source } from "../../engine/source.ts";

type Kind = "commit" | "tree" | "blob";

// The facets of an id: an object by its hash, a name by the hash of its words.
const object = 0;
const named = 2;

const nameHash = (words: string) => new Bun.CryptoHasher("sha1").update(words).digest("hex");
const idOfObject = (hash: string) => derivedId(object, hash);
const idOfName = (words: string) => derivedId(named, nameHash(words));
const ref = (hash: string, holds?: boolean) => ({
  $ref: idOfObject(hash),
  ...(holds === undefined ? {} : { $holds: holds }),
});

const says = (shape: unknown, text: string, more = {}) => ({ says: text, shape, ...more });

// The field's own types, named, each a holon of its own.
const types = {
  commit: {
    id: idOfName("type commit"),
    mould: {
      message: says("string", "What the commit says of itself."),
      author: says("string", "Who made it, as git says them."),
      at: says("string", "When it was made, as the log writes a moment."),
      tree: says("ref", "The tree it records, all the way down.", { holds: true }),
      parents: says({ list: "ref" }, "The commits it comes after.", { holds: false }),
    },
  },
  tree: {
    id: idOfName("type tree"),
    mould: {
      entries: says(
        "json",
        "What it holds, each a name, a mode and the tree or blob under that name; a name is the tree's, not the thing's.",
      ),
    },
  },
  blob: {
    id: idOfName("type blob"),
    mould: { size: says("number", "How many bytes it holds; its content is read apart, when asked.") },
  },
  ref: {
    id: idOfName("type ref"),
    mould: {
      commit: says("ref", "The commit it names.", { holds: false }),
    },
  },
} as const;

const typeHolons = Object.entries(types).map(([name, { id, mould }]) => ({
  id,
  instance: [],
  name,
  mould: mould as Record<string, unknown>,
  body: {},
}));

const latestOf = (holon: Version["body"] & object, hash: string): Latest => ({
  block: hash,
  version: { ...(holon as Version), prev: null },
});

// Objects asked of git in one go: each hash given, its kind and its bytes.
function catFile(dir: string, hashes: string[]) {
  if (!hashes.length) return new Map<string, { hash: string; kind: Kind; content: Uint8Array }>();

  const run = Bun.spawnSync(["git", "-C", dir, "cat-file", "--batch"], {
    stdin: new TextEncoder().encode(`${hashes.join("\n")}\n`),
  });
  if (run.exitCode !== 0) throw new Error(`git could not read ${dir}: ${run.stderr.toString()}`);

  const out = run.stdout;
  const found = new Map<string, { hash: string; kind: Kind; content: Uint8Array }>();
  let at = 0;

  for (const asked of hashes) {
    const end = out.indexOf(10, at);
    const [hash, kind, size] = new TextDecoder().decode(out.subarray(at, end)).split(" ");
    at = end + 1;

    if (kind === "missing" || size === undefined) continue;

    const length = Number(size);
    found.set(asked, { hash: hash!, kind: kind as Kind, content: out.subarray(at, at + length) });
    at += length + 1;
  }

  return found;
}

// The size of each blob asked, its bytes never read.
function sizesOf(dir: string, hashes: string[]) {
  if (!hashes.length) return new Map<string, number>();

  const run = Bun.spawnSync(["git", "-C", dir, "cat-file", "--batch-check"], {
    stdin: new TextEncoder().encode(`${hashes.join("\n")}\n`),
  });

  return new Map(
    run.stdout
      .toString()
      .trim()
      .split("\n")
      .map((line) => line.split(" "))
      .filter(([, kind]) => kind === "blob")
      .map(([hash, , size]) => [hash!, Number(size)] as const),
  );
}

// A tree's bytes: each entry a mode, a name and the hash of what it names.
function entriesOf(content: Uint8Array) {
  const entries: { name: string; mode: string; hash: string }[] = [];
  let at = 0;

  while (at < content.length) {
    const space = content.indexOf(32, at);
    const nul = content.indexOf(0, space);
    const hash = Buffer.from(content.subarray(nul + 1, nul + 21)).toString("hex");

    entries.push({
      mode: new TextDecoder().decode(content.subarray(at, space)),
      name: new TextDecoder().decode(content.subarray(space + 1, nul)),
      hash,
    });
    at = nul + 21;
  }

  return entries;
}

// A commit's text: its headers, a blank line, and what it says.
function commitOf(content: Uint8Array) {
  const text = new TextDecoder().decode(content);
  const blank = text.indexOf("\n\n");
  const headers = text.slice(0, blank).split("\n");
  const value = (key: string) =>
    headers.filter((line) => line.startsWith(`${key} `)).map((line) => line.slice(key.length + 1));
  const [author = ""] = value("author");
  const seconds = Number(author.split(" ").at(-2));

  return {
    tree: value("tree")[0]!,
    parents: value("parent"),
    author: author.replace(/ \d+ [+-]\d{4}$/, ""),
    at: new Date(seconds * 1000).toISOString(),
    message: text.slice(blank + 2).trimEnd(),
  };
}

// An object read as a holon of the field.
function holonOf(hash: string, kind: Kind, content: Uint8Array) {
  const id = idOfObject(hash);

  if (kind === "commit") {
    const { tree, parents, author, at, message } = commitOf(content);
    return {
      id,
      instance: [types.commit.id],
      name: message.split("\n")[0]!.slice(0, 80),
      body: { message, author, at, tree: ref(tree), parents: parents.map((parent) => ref(parent)) },
    };
  }

  if (kind === "tree") {
    const entries = entriesOf(content).map(({ name, mode, hash: under }) => ({
      name,
      mode,
      entry: ref(under, true),
    }));
    return { id, instance: [types.tree.id], body: { entries } };
  }

  return blobOf(hash, content.length);
}

const blobOf = (hash: string, size: number) => ({
  id: idOfObject(hash),
  instance: [types.blob.id],
  body: { size },
});

// The refs git names: HEAD and every branch and tag, each with the commit it names.
function refsOf(dir: string) {
  const run = Bun.spawnSync([
    "git",
    "-C",
    dir,
    "for-each-ref",
    "--format=%(objectname) %(refname)",
    "refs/heads",
    "refs/tags",
  ]);
  const head = Bun.spawnSync(["git", "-C", dir, "rev-parse", "HEAD"]).stdout.toString().trim();
  const lines = run.stdout.toString().trim().split("\n").filter(Boolean);

  return [
    { name: "HEAD", hash: head },
    ...lines.map((line) => {
      const [hash, name] = line.split(" ");
      return { name: name!, hash: hash! };
    }),
  ].filter(({ hash }) => hash);
}

// The repository at a folder, as a source the engine reads: everything reached from the
// tip, the commits as far back as depth, and any object by its id when asked.
export function gitSource(dir: string, { depth = 30 } = {}): Source {
  const read = async (id: string): Promise<Latest | null> => {
    const typed = typeHolons.find((holon) => holon.id === id);
    if (typed) return latestOf(typed, id);

    const named = refsOf(dir).find(({ name }) => idOfName(`ref ${name}`) === id);
    if (named)
      return latestOf(
        { id, instance: [types.ref.id], name: named.name, body: { commit: ref(named.hash) } },
        id,
      );

    const what = derivedOf(id);
    if (!what || what.facet !== object) return null;

    const [found] = catFile(dir, [what.prefix]).values();
    return found ? latestOf(holonOf(found.hash, found.kind, found.content), found.hash) : null;
  };

  async function all() {
    const held = new Map<string, Latest>(typeHolons.map((holon) => [holon.id, latestOf(holon, holon.id)]));
    const refs = refsOf(dir);

    for (const { name, hash } of refs) {
      const id = idOfName(`ref ${name}`);
      held.set(id, latestOf({ id, instance: [types.ref.id], name, body: { commit: ref(hash) } }, id));
    }

    // The commits a few steps back from every ref, then the tip's tree all the way down.
    let commits = [...new Set(refs.map(({ hash }) => hash))];
    const seen = new Set<string>();
    let tip: string | undefined;

    for (let step = 0; step < depth && commits.length; step++) {
      const found = catFile(
        dir,
        commits.filter((hash) => !seen.has(hash)),
      );
      commits = [];

      for (const { hash, kind, content } of found.values()) {
        if (kind !== "commit") continue;
        seen.add(hash);

        const holon = holonOf(hash, kind, content);
        held.set(holon.id, latestOf(holon, hash));
        tip ??= commitOf(content).tree;
        commits.push(...commitOf(content).parents);
      }
    }

    // Trees are read; a blob is known by its size alone.
    let level = tip ? [tip] : [];

    while (level.length) {
      const found = catFile(dir, level);
      const blobs: string[] = [];
      level = [];

      for (const { hash, kind, content } of found.values()) {
        const holon = holonOf(hash, kind, content);
        held.set(holon.id, latestOf(holon, hash));

        for (const entry of entriesOf(content)) (entry.mode === "40000" ? level : blobs).push(entry.hash);
      }

      for (const [hash, size] of sizesOf(dir, [...new Set(blobs)]))
        held.set(idOfObject(hash), latestOf(blobOf(hash, size), hash));
    }

    return held;
  }

  return {
    mayHold: (id) => isDerived(id) && (derivedOf(id)?.facet === object || derivedOf(id)?.facet === named),
    read,
    all,
    log: async (): Promise<LogEntry[]> => [],
    versions: async (id) => {
      const latest = await read(id);
      return latest ? [latest.version] : [];
    },
  };
}
