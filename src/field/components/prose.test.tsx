import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { beforeAll, expect, test } from "bun:test";
import type { HolonRead, Whole } from "../../engine/reads.ts";
import { block, inline } from "./prose.tsx";

beforeAll(() => {
  if (!globalThis.document) GlobalRegistrator.register();
});

const holon = (id: string, type: string, body: Record<string, unknown>) =>
  ({ id, types: [type], instance: [], store: "main", version: "", body }) as unknown as HolonRead;

const ref = ($ref: string) => ({ $ref });

const word = (id: string, text: string, more = {}) => holon(id, "word", { text, lexeme: ref("L"), ...more });

const holons: Whole["holons"] = Object.fromEntries(
  [
    word("a", "Whole", { before: "“" }),
    word("b", "pieces", { after: ",", typed: "peices" }),
    word("c", "kept"),
    holon("em", "emphasis", { words: [ref("c")] }),
    word("d", "here", { after: "." }),
    holon("link", "link", { words: [ref("d")], leads: ref("target") }),
    word("e", "site"),
    holon("web", "link", { words: [ref("e")], to: "https://example.com/a" }),
    word("f", "hidden"),
    holon("img", "link", { words: [ref("f")], to: "https://example.com/i.png", image: true }),
    holon("span", "codespan", { text: "x < y" }),
    holon("s1", "sentence", { words: [ref("a"), ref("b"), ref("em"), ref("link")] }),
    holon("s2", "sentence", { words: [ref("span"), ref("web"), ref("img")] }),
    holon("p", "paragraph", { sentences: [ref("s1"), ref("s2")] }),
    holon("i1", "item", { sentences: [ref("s1")] }),
    holon("list", "list", { items: [ref("i1")] }),
    holon("q", "quote", { prose: [ref("p")] }),
    holon("code", "code", { text: "let a = 1;" }),
    holon("br", "break", { mark: "---" }),
    holon("other", "statistic", { says: "Not prose" }),
  ].map((h) => [h.id, h]),
);

const element = (node: Node | null) => node as HTMLElement;

test("a word is what comes before it, its text, and what comes after", () => {
  expect(inline(holons, "a")).toBe("“Whole");
  expect(inline(holons, "b")).toBe("pieces,");
});

test("a paragraph is its sentences, spaced, with its marks and links", () => {
  const drawn = element(block(holons, "p"));

  expect(drawn.tagName).toBe("P");
  expect(drawn.textContent).toBe("“Whole pieces, kept here. x < y site hidden");
  expect(drawn.querySelector("em")?.textContent).toBe("kept");
  expect(drawn.querySelector("code")?.textContent).toBe("x < y");
});

test("a link into the field says where it leads, so a press rises with it", () => {
  const link = element(block(holons, "p")).querySelector("a[data-location]") as HTMLElement;

  expect(JSON.parse(link.dataset.location!)).toEqual(["target"]);
  expect(link.textContent).toBe("here.");
});

test("a link to the web stays a link, and an image is never fetched", () => {
  const drawn = element(block(holons, "p"));

  expect(drawn.querySelector('a[href="https://example.com/a"]')?.textContent).toBe("site");
  expect(drawn.querySelector("img")).toBe(null);
  expect(drawn.querySelector(".unlinked")?.textContent).toBe("hidden");
});

test("blocks are what they are", () => {
  expect(element(block(holons, "br")).tagName).toBe("HR");
  expect(element(block(holons, "code")).querySelector("code")?.textContent).toBe("let a = 1;");
  expect(element(block(holons, "list")).querySelectorAll("li").length).toBe(1);
  expect(element(block(holons, "q")).tagName).toBe("BLOCKQUOTE");
});

test("what is not prose, or is not read, is left to the caller", () => {
  expect(block(holons, "other")).toBe(null);
  expect(block(holons, "absent")).toBe(null);
  expect(inline(holons, "absent")).toBe(null);
});

test("a mark standing as a word keeps to what is before it", () => {
  const marked: Whole["holons"] = {
    w: word("w", "here"),
    c: word("c", ","),
    n: word("n", "next"),
    s: holon("s", "sentence", { words: [ref("w"), ref("c"), ref("n")] }),
  };

  expect(element(block(marked, "s")).textContent).toBe("here, next");
});

test("text is never read as markup", () => {
  const dangerous: Whole["holons"] = {
    w: word("w", "<img src=x onerror=alert(1)>"),
    s: holon("s", "sentence", { words: [ref("w")] }),
  };

  expect(element(block(dangerous, "s")).querySelector("img")).toBe(null);
});
