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

export function references(body: Body): Reference[] {
  const found: Reference[] = [];
  const walk = (value: Json, key: string) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(proseLink))
        found.push({ id: match[1]!, key, ...(match[2] ? { pinned: match[2] as Name } : {}) });
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
    } else if (value !== null && typeof value === "object") {
      if (isRef(value)) found.push({ id: value.$ref, key, ...(value["@"] ? { pinned: value["@"] } : {}) });
      else for (const item of Object.values(value)) walk(item, key);
    }
  };
  for (const [key, value] of Object.entries(body)) walk(value, key);
  return found;
}
