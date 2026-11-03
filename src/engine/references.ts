import type { Json } from "../store/canonical.ts";
import { isId, type Id } from "../store/id.ts";
import { isName, type Name } from "../store/name.ts";
import type { Body } from "../store/objects.ts";

// A reference is written the same way wherever it stands, so it is seen
// without knowing the type: `{ "$ref": id }`, or `{ "$ref": id, "@": version }`
// pinned to one version. In markdown prose the same reference is a link whose
// target is `ref:<id>`, or `ref:<id>@<version>`.

export interface Reference {
  id: Id;
  key: string;
  pinned?: Name;
}

export function isRef(value: unknown): value is { $ref: Id; "@"?: Name } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return (
    isId(record.$ref) &&
    keys.every((key) => key === "$ref" || key === "@") &&
    (record["@"] === undefined || isName(record["@"]))
  );
}

const proseLink = /\]\(ref:([0-9A-HJKMNP-TV-Z]{26})(?:@(sha256-[0-9a-f]{64}))?(?:\s+"[^"]*")?\)/g;

export const references = (body: Body): Reference[] =>
  Object.entries(body).flatMap(([key, value]) => within(value, key));

// The references within a value, found wherever they stand.
function within(value: Json, key: string): Reference[] {
  if (typeof value === "string")
    return [...value.matchAll(proseLink)].map((match) => found(match[1]!, key, match[2] as Name | undefined));
  if (Array.isArray(value)) return value.flatMap((item) => within(item, key));
  if (value === null || typeof value !== "object") return [];
  if (isRef(value)) return [found(value.$ref, key, value["@"])];
  return Object.values(value).flatMap((item) => within(item, key));
}

const found = (id: Id, key: string, pinned?: Name): Reference => ({ id, key, ...(pinned ? { pinned } : {}) });
