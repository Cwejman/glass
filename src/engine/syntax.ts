import { isId, type Id } from "../store/id.ts";
import type { Argument, Expression } from "./expression.ts";

// An expression said as text, and the text read back: a pure pair of
// functions, so an expression can stand where only text does, as in an
// address, and the way it is written can change without anything that
// holds expressions changing. A call is said by the title of the function
// it calls, its arguments in parentheses, none needing none; a holon by its
// id after @; an argument within a function of one's own by its place
// after $; words in quotes.
//
//   Group by(Not(Children of(Everything)), "type")
//   Type(@01M6GXF94Z4ZJF0AQQ4JVRTHHQ)
//
// A function is found by its title among those given; a title two
// functions share is said, and read, by the id instead, @id(…).

export function print(expression: Expression, titles: ReadonlyMap<Id, string>): string {
  const shared = new Set(
    [...titles.values()].filter((title, i, all) => all.indexOf(title) !== all.lastIndexOf(title)),
  );
  const said = (value: Argument): string => {
    if (typeof value === "string") return JSON.stringify(value);
    if ("$ref" in value) return `@${value.$ref}`;
    if ("arg" in value) return `$${value.arg}`;
    const title = titles.get(value.call.$ref);
    const byTitle = title && !shared.has(title) && title === title.trim() && !/[(),"@$]/.test(title);
    const given = value.with ?? [];
    // A call by id is always said with its parentheses, so it is never read
    // back as the holon of that id.
    if (!byTitle) return `@${value.call.$ref}(${given.map(said).join(", ")})`;
    return given.length ? `${title}(${given.map(said).join(", ")})` : title!;
  };
  return said(expression);
}

export function parse(text: string, functions: ReadonlyMap<string, Id[]>): Expression {
  let at = 0;
  const fail = (what: string): never => {
    throw new Error(`${what}, at ${at + 1} of “${text}”`);
  };
  const space = () => {
    while (/\s/.test(text[at] ?? "")) at++;
  };
  const take = (char: string) => (space(), text[at] === char ? (at++, true) : false);

  const words = (): string => {
    const start = at;
    at++;
    while (at < text.length && text[at] !== '"') at += text[at] === "\\" ? 2 : 1;
    if (text[at] !== '"') fail("words begun with a quote are not ended");
    at++;
    return JSON.parse(text.slice(start, at)) as string;
  };
  const argument = (): Argument => (space(), text[at] === '"' ? words() : expression());

  // A call's arguments, if it is given any.
  const given = (): Argument[] => {
    if (!take("(")) return [];
    const all: Argument[] = [];
    if (take(")")) return all;
    do all.push(argument());
    while (take(","));
    if (!take(")")) fail("a call's arguments are closed by )");
    return all;
  };
  const called = (id: Id): Expression => {
    const arguments_ = given();
    return { call: { $ref: id }, ...(arguments_.length ? { with: arguments_ } : {}) };
  };

  function expression(): Expression {
    space();
    if (take("@")) {
      const id = text.slice(at, at + 26);
      if (!isId(id)) fail("@ is followed by a holon's id");
      at += 26;
      space();
      return text[at] === "(" ? called(id) : { $ref: id };
    }
    if (take("$")) {
      const digits = /^\d+/.exec(text.slice(at))?.[0];
      if (!digits) fail("$ is followed by an argument's place");
      at += digits!.length;
      return { arg: Number(digits) };
    }
    const start = at;
    while (at < text.length && !/[(),"@$]/.test(text[at]!)) at++;
    const title = text.slice(start, at).trim();
    if (!title) fail("an expression is a function, a holon or an argument");
    const found = functions.get(title) ?? [];
    if (found.length === 0) fail(`there is no function ${title}`);
    if (found.length > 1) fail(`${title} names more than one function; say which by @id`);
    return called(found[0]!);
  }

  const read = expression();
  space();
  if (at < text.length) fail("what follows the expression is not part of it");
  return read;
}
