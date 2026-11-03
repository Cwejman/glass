import { expect, test } from "bun:test";
import { linkTargets, parseFile, resolve, rewriteLinks, slug } from "./wiki.ts";

const file = `---
under: the rule
kind: brief
status: proposed
---

# The store

A store is where a field is kept.

[How holons relate](relations.md)

## 1. Objects named by what they hold

Every object is a small piece of JSON.

\`\`\`
# not a heading
\`\`\`

### 1.1 The prefix

The prefix says how.

## 2. From the ref down

### 2.3.1 A holon's identity

An id is a ULID.
`;

test("a file is a brief, its sections the briefs beneath, numbers left out of titles", () => {
  const parsed = parseFile("architecture/store.md", file);
  expect(parsed.kind).toBe("brief");
  expect(parsed.status).toBe("proposed");
  expect(parsed.root.title).toBe("The store");
  expect(parsed.root.prose).toBe("A store is where a field is kept.\n\n[How holons relate](relations.md)");
  expect(parsed.root.parts.map((part) => part.title)).toEqual([
    "Objects named by what they hold",
    "From the ref down",
  ]);
  expect(parsed.root.parts[0]!.prose).toContain("# not a heading");
  expect(parsed.root.parts[0]!.parts[0]!.title).toBe("The prefix");
  expect(parsed.root.parts[1]!.parts[0]!.title).toBe("A holon's identity");
  expect([...parsed.slugs.keys()]).toEqual([
    "the-store",
    "1-objects-named-by-what-they-hold",
    "11-the-prefix",
    "2-from-the-ref-down",
    "231-a-holons-identity",
  ]);
});

test("anchors are the ones GitHub gives", () => {
  expect(slug("5.a Ownership")).toBe("5a-ownership");
  expect(slug("2.3 The index is the whole field at one commit")).toBe(
    "23-the-index-is-the-whole-field-at-one-commit",
  );
});

test("links outside code are found and rewritten; images and code are left", () => {
  const prose = 'See [a](a.md#x) and `[b](b.md)` and ![c](c.png) and [d [e]](d.md "t").\n```\n[f](f.md)\n```';
  expect(linkTargets(prose)).toEqual(["a.md#x", "d.md"]);
  expect(rewriteLinks(prose, (target) => `ref:${target.length}`)).toBe(
    'See [a](ref:6) and `[b](b.md)` and ![c](c.png) and [d [e]](ref:4 "t").\n```\n[f](f.md)\n```',
  );
});

test("targets resolve against the file they stand in", () => {
  expect(resolve("architecture/store.md", "../plan.md#3-what-is-open")).toEqual({
    path: "plan.md",
    anchor: "3-what-is-open",
  });
  expect(resolve("said/README.md", "#x")).toEqual({ path: "said/README.md", anchor: "x" });
  expect(resolve("README.md", "https://example.com")).toBeUndefined();
  expect(resolve("history.md", "git:6ab1043")).toBeUndefined();
});
