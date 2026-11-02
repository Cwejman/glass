// The one canonical text of a JSON value, as RFC 8785 defines it: object keys
// sorted by UTF-16 code units, no whitespace, strings and numbers written as
// ECMAScript writes them. The same value is always the same text, so the same
// object always has the same name.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function canonical(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new Error(`not a JSON number: ${value}`);
      return JSON.stringify(value);
    case "string":
      if (!value.isWellFormed()) throw new Error("a string with a lone surrogate");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) if (!(i in value)) throw new Error("an array with a hole");
        return `[${value.map(canonical).join(",")}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new Error("not a plain object");
      const keys = Object.keys(value).sort();
      const record = value as Record<string, unknown>;
      return `{${keys
        .filter((key) => record[key] !== undefined)
        .map((key) => `${canonical(key)}:${canonical(record[key])}`)
        .join(",")}}`;
    }
    default:
      throw new Error(`not JSON: ${typeof value}`);
  }
}
