import { expect, test } from "bun:test";
import { newId } from "../store/id.ts";
import { parse, print } from "./syntax.ts";

const group = newId();
const not = newId();
const children = newId();
const everything = newId();
const type = newId();
const brief = newId();
const titles = new Map([
  [group, "Group by"],
  [not, "Not"],
  [children, "Children of"],
  [everything, "Everything"],
  [type, "Type"],
]);
const functions = new Map([...titles].map(([id, title]) => [title, [id]]));

const roots = {
  call: { $ref: group },
  with: [
    { call: { $ref: not }, with: [{ call: { $ref: children }, with: [{ call: { $ref: everything } }] }] },
    "type",
  ],
};

test("an expression is said by its functions' titles, and read back as it was", () => {
  const said = print(roots, titles);
  expect(said).toBe("Group by(Not(Children of(Everything)), 'type')");
  expect(parse(said, functions)).toEqual(roots);
});

test("a holon is said by its id, an argument by its place, words in quotes as written", () => {
  const typed = { call: { $ref: type }, with: [{ $ref: brief }] };
  expect(print(typed, titles)).toBe(`Type(@${brief})`);
  expect(parse(`Type( @${brief} )`, functions)).toEqual(typed);
  expect(parse("Type($0)", functions)).toEqual({ call: { $ref: type }, with: [{ arg: 0 }] });
  expect(parse(`Group by(Everything, 'a \\'b\\' "c"')`, functions)).toEqual({
    call: { $ref: group },
    with: [{ call: { $ref: everything } }, `a 'b' "c"`],
  });
});

test("words with quotes and backslashes in them are said and read back as they were", () => {
  const worded = { call: { $ref: group }, with: [{ call: { $ref: everything } }, `it's a \\ "word"`] };
  expect(parse(print(worded, titles), functions)).toEqual(worded);
});

test("a function whose title is shared, or unknown, is said and read by its id", () => {
  const twin = newId();
  const shared = new Map([...titles, [twin, "Type"]]);
  const typed = { call: { $ref: type }, with: [{ $ref: brief }] };
  expect(print(typed, shared)).toBe(`@${type}(@${brief})`);
  const bare = { call: { $ref: twin } };
  expect(print(bare, new Map([[twin, "Mine, kept"]]))).toBe(`@${twin}()`);
  expect(parse(`@${twin}()`, functions)).toEqual(bare);
  expect(parse(`@${type}(@${brief})`, functions)).toEqual(typed);
  expect(() =>
    parse(
      "Type(Everything)",
      new Map([
        ["Type", [type, twin]],
        ["Everything", [everything]],
      ]),
    ),
  ).toThrow("more than one function");
  expect(() => parse("Colour(Everything)", functions)).toThrow("there is no function Colour");
});

test("what is not an expression says where it goes wrong", () => {
  expect(() => parse("Type(Everything", functions)).toThrow("closed by )");
  expect(() => parse("Everything Everything(", functions)).toThrow();
  expect(() => parse('Type("open', functions)).toThrow("not ended");
  expect(() => parse("@nothing", functions)).toThrow("holon's id");
});
