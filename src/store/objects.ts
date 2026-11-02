import type { Json } from "./canonical.ts";
import { isId, type Id } from "./id.ts";
import { isName, type Name } from "./name.ts";

// The kinds of object a store holds, each saying what it is, so any one can be
// read alone. A ref names a commit, a commit names an index, an index names
// the tree of its holons, and the tree names the versions, which are the atoms.

export type Body = { [key: string]: Json };

export interface Commit {
  kind: "commit";
  parent: Name | null;
  at: string;
  index: Name;
}

export interface Index {
  kind: "index";
  names: { [name: string]: Id };
  holons: Name;
}

// The holons of an index are a tree split by the characters of their ids,
// read from the end where ids are random. A leaf holds at most `leafSize`
// entries; past that it becomes a branch over the next character. The shape
// depends only on which ids there are, so the same field is the same tree.
export interface Leaf {
  kind: "index-leaf";
  depth: number;
  versions: { [id: Id]: Name };
}

export interface Branch {
  kind: "index-branch";
  depth: number;
  branches: { [char: string]: Name };
}

export interface Version {
  kind: "version";
  id: Id;
  prev: Name | null;
  instance: Id[];
  body: Body;
}

export type StoreObject = Commit | Index | Leaf | Branch | Version;

export const leafSize = 64;

const isNameMap = (value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every(isName);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const keysOf: Record<StoreObject["kind"], string[]> = {
  commit: ["kind", "parent", "at", "index"],
  index: ["kind", "names", "holons"],
  "index-leaf": ["kind", "depth", "versions"],
  "index-branch": ["kind", "depth", "branches"],
  version: ["kind", "id", "prev", "instance", "body"],
};

// What came over the wire is checked for its shape before anything trusts it:
// exactly the keys its kind has, each of its kind of value.
export function asObject(value: unknown): StoreObject {
  if (!isRecord(value)) throw new Error("an object must be a JSON object");
  const keys = keysOf[value.kind as StoreObject["kind"]];
  if (!keys || Object.keys(value).length !== keys.length || !keys.every((key) => key in value))
    throw new Error(`not a well-formed ${String(value.kind)} object`);
  const ok = (() => {
    switch (value.kind) {
      case "commit":
        return (value.parent === null || isName(value.parent)) && typeof value.at === "string" && isName(value.index);
      case "index":
        return isRecord(value.names) && Object.values(value.names).every(isId) && isName(value.holons);
      case "index-leaf":
        return Number.isInteger(value.depth) && isNameMap(value.versions) && Object.keys(value.versions as object).every(isId);
      case "index-branch":
        return (
          Number.isInteger(value.depth) &&
          isNameMap(value.branches) &&
          Object.keys(value.branches as object).every((char) => /^[0-9A-HJKMNP-TV-Z]$/.test(char))
        );
      case "version":
        return (
          isId(value.id) &&
          (value.prev === null || isName(value.prev)) &&
          Array.isArray(value.instance) &&
          value.instance.every(isId) &&
          isRecord(value.body)
        );
      default:
        return false;
    }
  })();
  if (!ok) throw new Error(`not a well-formed ${String(value.kind)} object`);
  return value as unknown as StoreObject;
}
