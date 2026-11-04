import { isId, type Id } from "../store/id.ts";
import type { Argument, Expression } from "../engine/expression.ts";

// An expression said as text, and the text read back: a pure pair of
// functions, so an expression can stand where only text does, as in an
// address, and the way it is written can change without anything that
// holds expressions changing. It is made to stand in an address as it is,
// using only what an address carries without escaping it, a space being
// carried as +. A call is said by the title of the function it calls, its
// arguments in parentheses after it, none needing none, set apart by
// commas; a holon by its id after @; an argument within a function of
// one's own by its place after $; words after :, up to the comma or
// parenthesis that ends them, a backslash keeping one within them.
//
//   Group by(Not(Children of(Everything)),:type)
//   Type(@01M6GXF94Z4ZJF0AQQ4JVRTHHQ)
//   Text(:what is said)
//
// A function is found by its title among those given; a title two
// functions share is said, and read, by the id instead, @id(…). An id is
// said as short as the holons known let it be, by its last characters,
// enough of them that no other id ends so, and read back by finding the
// one id that ends so.

export function print(
  expression: Expression,
  titles: ReadonlyMap<Id, string>,
  known: readonly Id[] = [],
): string {
  const short = shortest(known);
  const shared = new Set(
    [...titles.values()].filter((title, i, all) => all.indexOf(title) !== all.lastIndexOf(title)),
  );
  const said = (value: Argument): string => {
    if (typeof value === "string") return `:${value.replace(/[\\,()]/g, (kept) => `\\${kept}`)}`;
    if ("$ref" in value) return `@${short(value.$ref)}`;
    if ("arg" in value) return `$${value.arg}`;
    const title = titles.get(value.call.$ref);
    const byTitle = title && !shared.has(title) && title === title.trim() && !/[(),@$:\\]/.test(title);
    const given = value.with ?? [];
    // A call by id is always said with its parentheses, so it is never read
    // back as the holon of that id.
    if (!byTitle) return `@${short(value.call.$ref)}(${given.map(said).join(",")})`;
    return given.length ? `${title}(${given.map(said).join(",")})` : title!;
  };
  return said(expression);
}

export function parse(
  text: string,
  functions: ReadonlyMap<string, Id[]>,
  known: readonly Id[] = [],
): Expression {
  let at = 0;
  const fail = (what: string): never => {
    throw new Error(`${what}, at ${at + 1} of “${text}”`);
  };
  const space = () => {
    while (/\s/.test(text[at] ?? "")) at++;
  };
  const take = (char: string) => (space(), text[at] === char ? (at++, true) : false);

  // Words after a colon, up to the comma or parenthesis that ends them, a
  // backslash keeping the one after it as it is.
  const words = (): string => {
    at++;
    let said = "";
    while (at < text.length && !/[,()]/.test(text[at]!)) {
      if (text[at] === "\\") at++;
      said += text[at++] ?? "";
    }
    return said;
  };
  const argument = (): Argument => (space(), text[at] === ":" ? words() : expression());

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
      const said = /^[0-9A-HJKMNP-TV-Z]{1,26}/.exec(text.slice(at))?.[0] ?? "";
      at += said.length;
      const ids = isId(said) ? [said] : said ? known.filter((id) => id.endsWith(said)) : [];
      if (ids.length === 0) fail("@ is followed by a holon's id, or its last characters");
      if (ids.length > 1) fail(`@${said} is the end of more than one id; say more of it`);
      space();
      return text[at] === "(" ? called(ids[0]!) : { $ref: ids[0]! };
    }
    if (take("$")) {
      const digits = /^\d+/.exec(text.slice(at))?.[0];
      if (!digits) fail("$ is followed by an argument's place");
      at += digits!.length;
      return { arg: Number(digits) };
    }
    const start = at;
    while (at < text.length && !/[(),@$:]/.test(text[at]!)) at++;
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

// The shortest end of each id that no other known id ends with, four
// characters at the least; an id not among those known is said whole, for
// nothing could read its end back.
function shortest(known: readonly Id[]) {
  return (id: Id) => {
    if (!known.includes(id)) return id;
    for (let length = 4; length < id.length; length++) {
      const tail = id.slice(-length);
      if (!known.some((other) => other !== id && other.endsWith(tail))) return tail;
    }
    return id;
  };
}
