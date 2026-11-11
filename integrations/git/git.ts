// A git repository read as a field, at the command line: its commits, trees, blobs and
// refs as holons of four types of its own, each id derived from the object's own hash, so
// the same object is the same holon in every clone. It is read only: objects through one
// `cat-file` kept running, which reads loose objects and packs alike, and the tip's tree
// whole through one `ls-tree`. A name belongs to the tree that holds a thing, so a tree's
// entries say the names, and a blob says only its size; a submodule's entry points at a
// commit kept elsewhere, and holds nothing here.
//
// What it gives as everything is what is reached from the tip: the refs, the commits a
// few steps back, and the tree of the commit HEAD names all the way down, or, where HEAD
// names none, of the first ref that does. Anything older is read when asked. Branches
// and tags are read; a remote's refs are that remote's, and are left to it.

import { derivedId, derivedOf, isDerived, type Latest, type LogEntry, type Version } from "../glass/store.ts";
import type { Source } from "../source.ts";
import { joined } from "../glass/files.ts";

type Kind = "commit" | "tree" | "blob";

// What git calls each object it holds; a tag object is read only through its ref.
type Called = Kind | "tag";

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
      commit: says("ref", "The commit it names, where it names one.", { holds: false, optional: true }),
      names: says("ref", "What it names where that is no commit: a tree or a blob.", {
        holds: false,
        optional: true,
      }),
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
const gitEnv = { ...Bun.env, LC_ALL: "C" };

const spawn = (dir: string, args: string[], asked?: string[]) =>
  Bun.spawnSync(["git", "-C", dir, ...args], {
    env: gitEnv,
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

// The commit HEAD names, peeled through any tag; nothing where it names none yet, which
// git says by saying nothing.
function headOf(dir: string) {
  const run = spawn(dir, ["rev-parse", "-q", "--verify", "HEAD^{commit}"]);
  const said = run.stderr.toString().trim();

  if (run.exitCode === 0) return run.stdout.toString().trim();
  if (!said) return "";
  throw refusal(dir, said);
}

// What a cat-file says, held as the pieces it came in, taken from the front: joined only
// where what is taken is kept, so a blob of any size is passed over without being held.
function pieces() {
  let held: Uint8Array[] = [];
  let length = 0;

  const add = (piece: Uint8Array) => {
    held.push(piece);
    length += piece.length;
  };

  // The first count bytes, kept as one or passed over.
  function take(count: number, keep: boolean) {
    const kept = keep ? new Uint8Array(count) : null;
    let taken = 0;

    while (taken < count) {
      const piece = held[0]!;
      const part = Math.min(piece.length, count - taken);
      kept?.set(piece.subarray(0, part), taken);
      taken += part;

      if (part === piece.length) held.shift();
      else held[0] = piece.subarray(part);
    }

    length -= count;
    return kept;
  }

  // Where the first line ends, counted from the front, if one has come.
  function lineEnd() {
    let before = 0;
    for (const piece of held) {
      const at = piece.indexOf(10);
      if (at >= 0) return before + at;
      before += piece.length;
    }
    return -1;
  }

  return { add, take, lineEnd, length: () => length, clear: () => ((held = []), (length = 0)) };
}

type Read = { hash: string; kind: Called; size: number; content: Uint8Array | null };

// One cat-file kept running for a repository, asked one object at a time, in turn: each
// hash given, its kind, its size and, for a commit or a tree, its bytes; nothing where git
// has none. It is started when first asked and ended once no read has waited for a moment,
// so it never keeps the reader running; where it ends before answering, it is started
// again once.
function objectReader(dir: string) {
  let running: ReturnType<typeof startReading> | undefined;
  let turn: Promise<unknown> = Promise.resolve();
  let waiting = 0;
  let idle: Timer | undefined;

  // Ended a moment after the last read, so reads in a burst share one.
  const rest = () => {
    idle = setTimeout(() => {
      const ending = running;
      running = undefined;
      ending?.cat.stdin.end();
    }, 100);
  };

  function startReading() {
    const cat = Bun.spawn(["git", "-C", dir, "cat-file", "--batch"], {
      env: gitEnv,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const stream = cat.stdout.getReader();
    const said = pieces();

    // More of what git says; where it says no more, why, in its words or by how it ended.
    async function more() {
      const { value, done } = await stream.read();
      if (!done) return said.add(value);

      running = undefined;
      const words = (await new Response(cat.stderr).text()).trim();
      await cat.exited;
      throw refusal(dir, words || `cat-file ended, ${cat.signalCode ?? `exit ${cat.exitCode}`}`);
    }

    async function line() {
      while (said.lineEnd() < 0) await more();
      const text = new TextDecoder().decode(said.take(said.lineEnd(), true)!);
      said.take(1, false);
      return text;
    }

    async function bytes(count: number, keep: boolean) {
      while (said.length() < count) await more();
      return said.take(count, keep);
    }

    async function object(asked: string): Promise<Read | null> {
      cat.stdin.write(`${asked}\n`);
      cat.stdin.flush();

      const [hash, kind, size] = (await line()).split(" ");
      if (kind === "missing" || size === undefined) return null;

      const content = await bytes(Number(size), kind === "commit" || kind === "tree");
      await bytes(1, false);
      return { hash: hash!, kind: kind as Called, size: Number(size), content };
    }

    return { cat, object };
  }

  async function asked(hash: string) {
    try {
      return await (running ??= startReading()).object(hash);
    } catch (error) {
      if ((error as Error).message.includes("no git repository")) throw error;
      return (running ??= startReading()).object(hash);
    }
  }

  return (hash: string) => {
    if (waiting++ === 0) clearTimeout(idle);

    const read = turn.then(() => asked(hash));
    turn = read.catch(() => undefined);

    return read.finally(() => {
      if (--waiting === 0) rest();
    });
  };
}

// The tree a commit records, all the way down, in one go: each path under it with its
// mode, kind, hash and, for a blob, its size. A mode is said as a tree says it.
function treeOf(dir: string, tree: string) {
  return git(dir, ["ls-tree", "-r", "-t", "-l", "-z", tree])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const tab = record.indexOf("\t");
      const [mode, kind, hash, size] = record.slice(0, tab).split(/ +/);
      const path = record.slice(tab + 1);
      const slash = path.lastIndexOf("/");

      return {
        mode: mode!.replace(/^0+/, ""),
        kind: kind!,
        hash: hash!,
        size: Number(size),
        path,
        under: slash < 0 ? "" : path.slice(0, slash),
        name: path.slice(slash + 1),
      };
    });
}

// What an entry of a tree says: its name, its mode, and what it names, held unless it
// is a submodule's commit, which is kept elsewhere.
const submodule = "160000";
const entryOf = ({ name, mode, hash }: { name: string; mode: string; hash: string }) => ({
  name,
  mode,
  entry: ref(hash, mode !== submodule),
});

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

// A tree as a holon: what it holds, each under its name.
const treeHolon = (hash: string, entries: ReturnType<typeof entryOf>[]) => ({
  id: idOfObject(hash),
  instance: [types.tree.id],
  body: { entries },
});

// An object read as a holon of the field, by its kind.
const holonOfKind: Record<
  Kind,
  (hash: string, content: Uint8Array, size: number) => Version["body"] & object
> = {
  commit: (hash, content) => {
    const { tree, parents, author, at, message } = commitOf(content);
    return {
      id: idOfObject(hash),
      instance: [types.commit.id],
      name: message.split("\n")[0]!.slice(0, 80),
      body: { message, author, at, tree: ref(tree), parents: parents.map((parent) => ref(parent)) },
    };
  },
  tree: (hash, content) => treeHolon(hash, entriesOf(content).map(entryOf)),
  blob: (hash, _, size) => blobOf(hash, size),
};

// An object of a kind the field does not read, as a tag object, is not a holon here: a
// tag is read through its ref, which names the commit it peels to.
const objectHolon = ({ hash, kind, size, content }: Read) =>
  kind === "tag" ? null : holonOfKind[kind](hash, content ?? new Uint8Array(0), size);

// A ref as a holon: its name, and the commit it names, or what it names that is none.
const refHolon = ({ name, hash, kind }: Ref) => {
  const id = idOfName(`ref ${name}`);
  const body = kind === "commit" ? { commit: ref(hash) } : { names: ref(hash) };
  return latestOf({ id, instance: [types.ref.id], name, body }, id);
};

type Ref = { name: string; hash: string; kind: Called };

// What a name peels to, all the way down, where git peeled one tag of a tag only.
function peeled(dir: string, name: string): Ref {
  const [hash, kind] = git(dir, ["cat-file", "--batch-check"], [`${name}^{}`])
    .toString()
    .split(" ");
  return { name, hash: hash!, kind: kind as Called };
}

// The refs git names: HEAD and every branch and tag, each with what it names, an
// annotated tag peeled to what it tags. A HEAD with no commit yet names nothing, and is
// not there.
function refsOf(dir: string): Ref[] {
  const lines = git(dir, [
    "for-each-ref",
    "--format=%(objectname) %(objecttype) %(*objectname) %(*objecttype) %(refname)",
    "refs/heads",
    "refs/tags",
  ])
    .toString()
    .split("\n")
    .filter(Boolean);

  const head = headOf(dir);
  const refs = lines.map((line): Ref => {
    const [hash, kind, peeledHash, peeledKind, name] = line.split(" ");
    if (peeledKind === "tag") return peeled(dir, name!);
    return { name: name!, hash: peeledHash || hash!, kind: (peeledKind || kind) as Called };
  });

  return [...(head ? [{ name: "HEAD", hash: head, kind: "commit" as const }] : []), ...refs];
}

// The repository at a folder, as a source the engine reads: everything reached from the
// tip, the commits as far back as depth, and any object by its id when asked.
export function gitSource(dir: string, { depth = 30 } = {}): Source {
  const objectOf = objectReader(dir);

  const read = async (id: string): Promise<Latest | null> => {
    const typed = typeHolons.find((holon) => holon.id === id);
    if (typed) return latestOf(typed, id);

    // A name is asked of the refs, an object of git by its hash; git is asked only which.
    const what = derivedOf(id);

    if (what?.facet === named) {
      const found = refsOf(dir).find(({ name }) => idOfName(`ref ${name}`) === id);
      return found ? refHolon(found) : null;
    }

    if (what?.facet !== object) return null;

    const found = await objectOf(what.prefix);
    const holon = found && objectHolon(found);
    return holon ? latestOf(holon, found.hash) : null;
  };

  // The commits a few steps back from those given, each with the tree it records.
  async function commitsBack(from: string[], held: Map<string, Latest>) {
    const trees = new Map<string, string>();
    let step = [...new Set(from)];

    for (let taken = 0; taken < depth && step.length; taken++) {
      const found = await Promise.all(step.map(objectOf));
      step = [];

      for (const commit of found) {
        if (commit?.kind !== "commit" || trees.has(commit.hash)) continue;

        const { tree, parents } = commitOf(commit.content!);
        held.set(idOfObject(commit.hash), latestOf(objectHolon(commit)!, commit.hash));
        trees.set(commit.hash, tree);
        step.push(...parents.filter((parent) => !trees.has(parent)));
      }
    }

    return trees;
  }

  // A tree all the way down: each tree with what it holds, and each blob by its size.
  function treeDown(tip: string, held: Map<string, Latest>) {
    const paths = treeOf(dir, tip);
    const under = new Map<string, ReturnType<typeof entryOf>[]>();
    for (const path of paths) under.set(path.under, [...(under.get(path.under) ?? []), entryOf(path)]);

    for (const { path, hash } of [{ path: "", hash: tip }, ...paths.filter(({ kind }) => kind === "tree")])
      held.set(idOfObject(hash), latestOf(treeHolon(hash, under.get(path) ?? []), hash));

    for (const { kind, hash, size } of paths)
      if (kind === "blob") held.set(idOfObject(hash), latestOf(blobOf(hash, size), hash));
  }

  async function all() {
    const held = new Map<string, Latest>(typeHolons.map((holon) => [holon.id, latestOf(holon, holon.id)]));
    const refs = refsOf(dir);

    for (const one of refs) {
      const holon = refHolon(one);
      held.set(holon.version.id, holon);
    }

    const commits = refs.filter(({ kind }) => kind === "commit").map(({ hash }) => hash);
    const trees = await commitsBack(commits, held);

    // The tree of the commit HEAD names, else of the first ref that names one read.
    const tip = commits.map((hash) => trees.get(hash)).find(Boolean);
    if (tip) treeDown(tip, held);

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
