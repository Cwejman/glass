// An expression said as text, and the text read back: a pure pair of functions, so
// an expression can stand where only text does, as in an address, and how it is
// written can change without anything that holds expressions changing.
//
// A call is said by the title of the function it calls, its arguments in parentheses
// after it, none needing none, set apart by commas; a holon by its name after @; an
// argument within a function of one's own by its place after $; words after :, up to
// the comma or parenthesis that ends them, a backslash keeping one within them.
//
//   Group by(Not(Children of(Everything)),:type)
//   Type(@1M6YBY3G000000X)
//   Text(:what is said)
//
// A title two functions share, or one an address could misread, is said and read by
// the function's name instead: @name(…).

import { isName } from "../store/store.ts";
import type { Argument, Expression } from "../engine/expression.ts";

export function print(expression: Expression, titles: ReadonlyMap<string, string>): string {
  const all = [...titles.values()];
  const shared = new Set(all.filter((title, i) => all.indexOf(title) !== all.lastIndexOf(title)));

  const said = (value: Argument): string => {
    if (typeof value === "string") return `:${value.replace(/[\\,()]/g, (kept) => `\\${kept}`)}`;
    if ("$ref" in value) return `@${value.$ref}`;
    if ("arg" in value) return `$${value.arg}`;

    const title = titles.get(value.call.$ref);
    const byTitle = title && !shared.has(title) && title === title.trim() && !/[(),@$:\\]/.test(title);
    const given = value.with ?? [];

    // A call by name is always said with its parentheses, so it is never read back
    // as the holon of that name.
    if (!byTitle) return `@${value.call.$ref}(${given.map(said).join(",")})`;

    return given.length ? `${title}(${given.map(said).join(",")})` : title;
  };

  return said(expression);
}

export function parse(text: string, functions: ReadonlyMap<string, string[]>): Expression {
  let at = 0;

  const fail = (what: string): never => {
    throw new Error(`${what}, at ${at + 1} of “${text}”`);
  };

  const skipSpace = () => {
    while (/\s/.test(text[at] ?? "")) at++;
  };

  const take = (char: string) => {
    skipSpace();
    if (text[at] !== char) return false;

    at++;
    return true;
  };

  // Words after a colon, up to what ends them, a backslash keeping the one after it.
  function words() {
    let said = "";
    at++;

    while (at < text.length && !/[,()]/.test(text[at]!)) {
      if (text[at] === "\\") at++;
      said += text[at++] ?? "";
    }

    return said;
  }

  function argument(): Argument {
    skipSpace();
    return text[at] === ":" ? words() : expression();
  }

  function given() {
    const all: Argument[] = [];

    if (!take("(")) return all;
    if (take(")")) return all;

    do all.push(argument());
    while (take(","));

    if (!take(")")) fail("a call's arguments are closed by )");

    return all;
  }

  function called(id: string): Expression {
    const inside = given();
    return { call: { $ref: id }, ...(inside.length ? { with: inside } : {}) };
  }

  function expression(): Expression {
    skipSpace();

    if (take("@")) {
      const said = /^[0-9A-HJKMNP-TV-Z]*/.exec(text.slice(at))![0];
      at += said.length;

      if (!isName(said)) fail("@ is followed by a holon's name");
      skipSpace();

      return text[at] === "(" ? called(said) : { $ref: said };
    }

    if (take("$")) {
      const digits = /^\d+/.exec(text.slice(at))?.[0];
      if (!digits) return fail("$ is followed by an argument's place");

      at += digits.length;
      return { arg: Number(digits) };
    }

    const start = at;
    while (at < text.length && !/[(),@$:]/.test(text[at]!)) at++;

    const title = text.slice(start, at).trim();
    if (!title) fail("an expression is a function, a holon or an argument");

    const found = functions.get(title) ?? [];
    if (found.length === 0) fail(`there is no function ${title}`);
    if (found.length > 1) fail(`${title} names more than one function; say which by @name`);

    return called(found[0]!);
  }

  const read = expression();
  skipSpace();

  if (at < text.length) fail("what follows the expression is not part of it");

  return read;
}
