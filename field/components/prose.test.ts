import { expect, test } from "bun:test";
import { markdown, slotOf } from "./prose.ts";

const id = "01JB0000000000000000000001";
const slot = (text: string) => slotOf(markdown.lexer(text)[0]!);

test("a paragraph that is nothing but a link into the field is a slot, of the kind its link says", () => {
  expect(slot(`[The store](ref:${id})`)).toEqual({ id });
  expect(slot(`[The store](ref:${id} "full")`)).toEqual({ id, kind: "full" });
  expect(slot(`As [the store](ref:${id}) says.`)).toBeUndefined();
  expect(slot(`[A site](https://example.com)`)).toBeUndefined();
});
