// A git repository read as a field, at the command line: its commits, trees, blobs and
// refs as holons of four types of its own, each id derived from the object's own hash, so
// the same object is the same holon in every clone. It is read only, through git's own
// `cat-file`, which reads loose objects and packs alike. A name belongs to the tree that
// holds a thing, so a tree's entries say the names, and a blob says only its size.
//
// What it gives as everything is what is reached from the tip: the refs, the commits a
// few steps back, and the tip's tree all the way down. Anything older is read when asked.

import { derivedId, derivedOf, isDerived, type Latest, type LogEntry, type Version } from "../glass/store.ts";
import type { Source } from "../source.ts";

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

// What git says when asked, or a refusal in its words: a failure is never read as nothing.
// Git is asked in its own plain words, whatever the reader's language, so they can be read.
const spawn = (dir: string, args: string[], asked?: string[]) =>
  Bun.spawnSync(["git", "-C", dir, ...args], {
    env: { ...process.env, LC_ALL: "C" },
    ...(asked ? { stdin: new TextEncoder().encode(`${asked.join("\n")}\n`) } : {}),
  });

const refusal = (dir: string, said: string) =>
  new Error(
    said.includes("not a git repository")
      ? `${dir} is no git repository`
      : `git could not read ${dir}: ${said}`,
  );

function git(dir: string, args: string[], asked?: string[]) {
  const run = spawn(dir, args, asked);
  if (run.exitCode === 0) return run.stdout;
  throw refusal(dir, run.stderr.toString().trim());
}

// The commit HEAD names; nothing where it names none yet, which git says by saying nothing.
function headOf(dir: string) {
  const run = spawn(dir, ["rev-parse", "-q", "--verify", "HEAD"]);
  const said = run.stderr.toString().trim();

  if (run.exitCode === 0) return run.stdout.toString().trim();
  if (!said) return "";
  throw refusal(dir, said);
}

// Objects asked of git in one go: each hash given, its kind and its bytes.
function catFile(dir: string, hashes: string[]) {
  if (!hashes.length) return new Map<string, { hash: string; kind: Kind; content: Uint8Array }>();

  const out = git(dir, ["cat-file", "--batch"], hashes);
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

  return new Map(
    git(dir, ["cat-file", "--batch-check"], hashes)
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

const blobOf = (hash: string, size: number) => ({
  id: idOfObject(hash),
  instance: [types.blob.id],
  body: { size },
});

// An object read as a holon of the field, by its kind.
const holonOfKind: Record<Kind, (hash: string, content: Uint8Array) => Version["body"] & object> = {
  commit: (hash, content) => {
    const { tree, parents, author, at, message } = commitOf(content);
    return {
      id: idOfObject(hash),
      instance: [types.commit.id],
      name: message.split("\n")[0]!.slice(0, 80),
      body: { message, author, at, tree: ref(tree), parents: parents.map((parent) => ref(parent)) },
    };
  },
  tree: (hash, content) => ({
    id: idOfObject(hash),
    instance: [types.tree.id],
    body: {
      entries: entriesOf(content).map(({ name, mode, hash: under }) => ({
        name,
        mode,
        entry: ref(under, true),
      })),
    },
  }),
  blob: (hash, content) => blobOf(hash, content.length),
};

// An object of a kind the field does not read, as a tag object, is not a holon here: a
// tag is read through its ref, which names the commit it peels to.
const objectHolon = (hash: string, kind: string, content: Uint8Array) =>
  Object.hasOwn(holonOfKind, kind) ? holonOfKind[kind as Kind](hash, content) : null;

// A ref as a holon: its name, and the commit it names.
const refHolon = (name: string, hash: string) => {
  const id = idOfName(`ref ${name}`);
  return latestOf({ id, instance: [types.ref.id], name, body: { commit: ref(hash) } }, id);
};

// The refs git names: HEAD and every branch and tag, each with the commit it names. A
// HEAD with no commit yet names nothing, and is not there.
function refsOf(dir: string) {
  const lines = git(dir, [
    "for-each-ref",
    "--format=%(objectname) %(*objectname) %(refname)",
    "refs/heads",
    "refs/tags",
  ])
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);

  // An annotated tag names a tag object; the ref names the commit it peels to.
  return [
    { name: "HEAD", hash: headOf(dir) },
    ...lines.map((line) => {
      const [hash, peeled, name] = line.split(" ");
      return { name: name!, hash: peeled || hash! };
    }),
  ].filter(({ hash }) => hash);
}

// The repository at a folder, as a source the engine reads: everything reached from the
// tip, the commits as far back as depth, and any object by its id when asked.
export function gitSource(dir: string, { depth = 30 } = {}): Source {
  const read = async (id: string): Promise<Latest | null> => {
    const typed = typeHolons.find((holon) => holon.id === id);
    if (typed) return latestOf(typed, id);

    // A name is asked of the refs, an object of git by its hash; git is asked only which.
    const what = derivedOf(id);

    if (what?.facet === named) {
      const found = refsOf(dir).find(({ name }) => idOfName(`ref ${name}`) === id);
      return found ? refHolon(found.name, found.hash) : null;
    }

    if (what?.facet !== object) return null;

    const [found] = catFile(dir, [what.prefix]).values();
    const holon = found && objectHolon(found.hash, found.kind, found.content);
    return holon ? latestOf(holon, found.hash) : null;
  };

  async function all() {
    const held = new Map<string, Latest>(typeHolons.map((holon) => [holon.id, latestOf(holon, holon.id)]));
    const refs = refsOf(dir);

    for (const { name, hash } of refs) {
      const holon = refHolon(name, hash);
      held.set(holon.version.id, holon);
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

        const holon = holonOfKind.commit(hash, content);
        const { tree, parents } = commitOf(content);
        held.set(holon.id, latestOf(holon, hash));
        tip ??= tree;
        commits.push(...parents);
      }
    }

    // Trees are read; a blob is known by its size alone.
    let level = tip ? [tip] : [];

    while (level.length) {
      const found = catFile(dir, level);
      const blobs: string[] = [];
      level = [];

      for (const { hash, content } of found.values()) {
        const holon = holonOfKind.tree(hash, content);
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
