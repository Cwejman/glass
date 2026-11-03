import type { Objects } from "./checked.ts";
import type { Id } from "./id.ts";
import type { Name } from "./name.ts";
import type { Branch, Leaf } from "./objects.ts";

// The holons of an index, as a tree split by the characters of their ids
// read from the end, where ids are random. A leaf holds at most `leafSize`;
// past that it is a branch over the next character. The shape depends only
// on which ids there are, so the same field is always the same tree.

export const leafSize = 64;

const charAt = (id: Id, depth: number) => id[id.length - 1 - depth]!;
const suffix = (id: Id, length: number) => (length === 0 ? "" : id.slice(-length));

// A node as it is reached by a path of characters, checked to stand where it
// says, with every id in a leaf belonging on that path, so a tree cannot
// pass one holon off as another.
async function node(objects: Objects, name: Name, path: string): Promise<Leaf | Branch> {
  const found = await objects.get<Leaf | Branch>(name);
  if (found.kind !== "index-leaf" && found.kind !== "index-branch")
    throw new Error(`${name} is not a node of an index`);
  if (found.depth !== path.length)
    throw new Error(`${name} stands at depth ${path.length}, not ${found.depth}`);
  if (found.kind === "index-leaf")
    for (const id of Object.keys(found.versions))
      if (suffix(id, path.length) !== path)
        throw new Error(`${name} holds ${id}, which does not belong under it`);
  return found;
}

export async function lookup(objects: Objects, at: Name, id: Id, path = ""): Promise<Name | undefined> {
  const here = await node(objects, at, path);
  if (here.kind === "index-leaf") return here.versions[id];
  const char = charAt(id, here.depth);
  const next = here.branches[char];
  return next && lookup(objects, next, id, char + path);
}

export async function* entries(objects: Objects, root: Name, path = ""): AsyncGenerator<[Id, Name]> {
  const at = await node(objects, root, path);
  if (at.kind === "index-leaf") yield* Object.entries(at.versions) as [Id, Name][];
  else for (const [char, child] of Object.entries(at.branches)) yield* entries(objects, child, char + path);
}

// Sets entries in the tree under `at`, writing only the nodes on their way
// and sharing every other with the tree before.
export async function grow(
  objects: Objects,
  at: Name | undefined,
  updates: ReadonlyMap<Id, Name>,
  depth = 0,
): Promise<Name> {
  const here: Leaf | Branch = at
    ? await objects.get<Leaf | Branch>(at)
    : { kind: "index-leaf", depth, versions: {} };
  if (here.kind === "index-leaf") {
    const versions = { ...here.versions, ...Object.fromEntries(updates) };
    if (Object.keys(versions).length <= leafSize) return objects.put({ kind: "index-leaf", depth, versions });
    return objects.put({
      kind: "index-branch",
      depth,
      branches: await branchesOf(objects, undefined, Object.entries(versions) as [Id, Name][], depth),
    });
  }
  return objects.put({
    kind: "index-branch",
    depth,
    branches: await branchesOf(objects, here.branches, [...updates], depth),
  });
}

// A tree grown anew from all it holds. Taking entries out is this, which
// gives the same nodes wherever nothing changed, so the tree is the one it
// would have been had they never been there.
export const plant = (objects: Objects, all: ReadonlyMap<Id, Name>) => grow(objects, undefined, all);

// The branches of a node, each grown from the entries whose next character
// leads into it, the others kept as they were.
async function branchesOf(
  objects: Objects,
  before: Branch["branches"] | undefined,
  entries: [Id, Name][],
  depth: number,
) {
  const grown = await Promise.all(
    [...Map.groupBy(entries, ([id]) => charAt(id, depth))].map(
      async ([char, group]) =>
        [char, await grow(objects, before?.[char], new Map(group), depth + 1)] as const,
    ),
  );
  return { ...before, ...Object.fromEntries(grown) };
}
