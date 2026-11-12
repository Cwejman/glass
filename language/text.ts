// An expression said as text, and the text read back: the face an agent types at the
// command line and code writes in a template. The field holds the expression as data;
// this is one way of saying it, so how it is written can change without anything that
// holds expressions changing.
//
//   type(@types/measure) | filter(m => eq(m.value, 3)) | size
//   text(@"The wiki")
//
// A call is a function's name and what it is given in parentheses. A holon is @ and
// its id, its name, or a route of names through the wholes that hold it. A variable is
// a lambda's own word, `m => …`, and `m.value` is what m holds under value; ?x is a
// variable of a pattern, within find. `a | f(b)`
// is f(a, b), read left to right. Lists are [ … ] and records { key: … }. Words in
// double quotes are a string, as JSON writes one. A line's rest after // is a remark.
//
// A function named alone is the function itself, to be given to another, as in
// map(xs, text); it is called only with parentheses, everything(), or after a pipe.
// A store is named by its key as a string, store("main"); stores() gives the keys.
// A holon's own values are id, name, store, instance, a list of its types, and mould;
// the rest are its body's, so a type's fields are @types/session.mould | keys.
//
//   @main:main.contents | map(h => {name: h.name, tokens: measure(h)})
//   outline(@"The wiki", 3)
//   @Sessions.sessions | sort(s => s.on) | reverse | take(2) | map(text)

import { isId } from "../integrations/glass/store.ts";
import type { Expression as Expr } from "./expression.ts";

// A route of names through the wholes that hold each in turn: from anywhere, or, given
// a store, from that store's level, what nothing in it holds.
export type Route = { store?: string; names: string[] };

// What a text needs of the field to be read, and to be said again: which functions
// and holons a name finds, and how each is best said back.
export type Names = {
  functions(name: string): string[];
  holons(route: Route): string[];
  isFunction(id: string): boolean;
  nameOf(id: string): string | undefined;
  // What a holon is and what holds it, so a name that finds several can say which.
  about?(id: string): string;
};

// ---- Reading

type Token =
  | { at: number; kind: "number"; value: number }
  | { at: number; kind: "string"; value: string }
  | { at: number; kind: "word"; value: string }
  | { at: number; kind: "variable"; value: string }
  | { at: number; kind: "mark"; value: string }
  | { at: number; kind: "end" };

const marks = ["=>", "(", ")", "[", "]", "{", "}", ",", ":", ".", "|", "@", "/"];

function tokensOf(text: string): Token[] {
  const out: Token[] = [];
  let at = 0;

  while (at < text.length) {
    const rest = text.slice(at);
    const space = /^(\s+|\/\/[^\n]*)/.exec(rest);

    if (space) {
      at += space[0].length;
      continue;
    }

    const number = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(rest);
    const string = /^"(?:[^"\\]|\\.)*"/.exec(rest);
    // An id is read only after @, so a long number stays a number.
    const afterAt = out.at(-1)?.kind === "mark" && (out.at(-1) as { value: string }).value === "@";
    const word =
      (afterAt && /^[0-9A-HJKMNP-TV-Z]{15}(?![\p{L}\p{N}_])/u.exec(rest)) ||
      /^[\p{L}_][\p{L}\p{N}_]*/u.exec(rest);
    const mark = marks.find((each) => rest.startsWith(each));

    // A pattern's variable, ?x, stands only within find.
    const variable = /^\?([\p{L}_][\p{L}\p{N}_]*)/u.exec(rest);
    if (variable) {
      out.push({ at, kind: "variable", value: variable[1]! });
      at += variable[0].length;
      continue;
    }

    if (string) {
      out.push({ at, kind: "string", value: JSON.parse(string[0]) });
      at += string[0].length;
    } else if (word && (!number || afterAt)) {
      out.push({ at, kind: "word", value: word[0] });
      at += word[0].length;
    } else if (number) {
      out.push({ at, kind: "number", value: Number(number[0]) });
      at += number[0].length;
    } else if (mark) {
      out.push({ at, kind: "mark", value: mark });
      at += mark.length;
    } else {
      throw new Error(
        `nothing in the language begins with ${rest[0]}, at ${where(text, at)}${rest.startsWith("=") || rest.startsWith("!") || rest.startsWith("<") ? "; to compare, eq(a, b), lt(a, b) and not(…)" : ""}`,
      );
    }
  }

  out.push({ at, kind: "end" });

  return out;
}

const isName = (token: Token | undefined) => token?.kind === "word" || token?.kind === "string";
const isMarkToken = (token: Token | undefined, value: string) =>
  token?.kind === "mark" && token.value === value;

// The names a text uses: every word that may name a function, and every route after @,
// so whoever reads it can ask the field for just those before reading it.
export function namesUsed(text: string) {
  const tokens = tokensOf(text);
  const words = new Set<string>();
  const routes: Route[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    if (token.kind === "word") words.add(token.value);

    if (token.kind === "mark" && token.value === "@") {
      const route: Route = { names: [] };
      let j = i + 1;

      if (isName(tokens[j]) && isMarkToken(tokens[j + 1], ":")) {
        route.store = (tokens[j] as { value: string }).value;
        j += 2;
      }

      for (; isName(tokens[j]); j += 2) {
        route.names.push((tokens[j] as { value: string }).value);
        if (!isMarkToken(tokens[j + 1], "/")) break;
      }

      if (route.names.length) routes.push(route);
    }
  }

  return { words: [...words], routes };
}

// A route said as it is written after @.
export const routeText = ({ store, names }: Route) =>
  `${store ? `${quotedName(store)}:` : ""}${names.map(quotedName).join("/")}`;

const quotedName = (name: string) => (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name) ? name : JSON.stringify(name));

const call = (id: string, given: Expr[]): Expr => ({
  call: { $ref: id },
  ...(given.length ? { with: given } : {}),
});

// Where in a text a place is: in one line, its column and the text; in many, its line
// and column, and that line alone.
function where(text: string, at: number) {
  if (!text.includes("\n")) return `${at + 1} of “${text}”`;

  const before = text.slice(0, at).split("\n");
  const line = before.length;
  const column = before.at(-1)!.length + 1;

  return `line ${line}, column ${column}: “${text.split("\n")[line - 1]!.trim()}”`;
}

export function parse(text: string, names: Names): Expr {
  const tokens = tokensOf(text);
  let next = 0;

  const peek = (ahead = 0) => tokens[next + ahead]!;

  const fail = (what: string, token = peek(), after = ""): never => {
    throw new Error(`${what}, at ${where(text, token.at)}${after}`);
  };

  const isMark = (value: string, token = peek()) => token.kind === "mark" && token.value === value;

  const take = (value: string) => {
    if (!isMark(value)) return false;

    next++;
    return true;
  };

  const expect = (value: string, what: string) => {
    if (!take(value)) fail(what);
  };

  // The lambdas around where one reads, innermost last, so a word is known as a variable.
  const bound: string[][] = [];
  const isVariable = (word: string) => bound.some((names) => names.includes(word));

  function one(found: string[], what: string, token: Token): string {
    if (found.length === 0) fail(`there is no ${what}`, token);

    if (found.length > 1) {
      const which = found.map((id) => `\n  @${id}${names.about ? ` ${names.about(id)}` : ""}`).join("");
      fail(
        `${what} names ${found.length}`,
        token,
        `; say which by @id, or by a route through what holds it:${which}`,
      );
    }

    return found[0]!;
  }

  function functionNamed(name: string, token: Token) {
    return one(names.functions(name), `function ${name}`, token);
  }

  // What may be given in a list: expressions set apart by commas, closed by the mark.
  function listed(close: string) {
    const all: Expr[] = [];
    if (take(close)) return all;

    do all.push(expression());
    while (take(","));

    expect(close, `a list of what is given is closed by ${close}`);

    return all;
  }

  // A holon after @: its id, or a route of names, each a word or quoted, from anywhere,
  // or from a store's level when the store's key and a colon begin it.
  function holon(): string {
    const start = peek();
    const route: Route = { names: [] };

    if (isName(peek()) && isMark(":", peek(1))) {
      route.store = (peek() as { value: string }).value;
      next += 2;
    }

    do {
      if (!isName(peek())) fail("@ is followed by an id or a name");

      route.names.push((peek() as { value: string }).value);
      next++;
    } while (take("/"));

    if (!route.store && route.names.length === 1 && isId(route.names[0])) return route.names[0];

    return one(names.holons(route), `holon ${routeText(route)}`, start);
  }

  function atom(): Expr {
    const token = peek();

    if (token.kind === "number" || token.kind === "string") {
      next++;
      return token.value;
    }

    if (token.kind === "variable") {
      next++;
      return { "?": token.value };
    }

    if (take("@")) {
      const id = holon();
      return isMark("(") ? (next++, call(id, listed(")"))) : { $ref: id };
    }

    if (take("[")) return { list: listed("]") };

    if (take("{")) {
      const record: Record<string, Expr> = {};

      if (!take("}")) {
        do {
          const key = peek();
          if (key.kind !== "word" && key.kind !== "string") fail("a record's key is a word or a string");

          next++;
          expect(":", "a record's key is followed by :");
          record[(key as { value: string }).value] = expression();
        } while (take(","));

        expect("}", "a record is closed by }");
      }

      return { record };
    }

    if (take("(")) {
      const inner = expression();
      expect(")", "what is opened by ( is closed by )");

      return inner;
    }

    if (token.kind === "word") {
      next++;

      if (["true", "false", "null"].includes(token.value)) return JSON.parse(token.value);
      if (isVariable(token.value)) return { var: token.value };

      const id = functionNamed(token.value, token);
      return isMark("(") ? (next++, call(id, listed(")"))) : { $ref: id };
    }

    return fail("an expression begins here");
  }

  // An atom, then what it is called with, or what it holds under a key.
  function applied(): Expr {
    let value = atom();

    while (take(".")) {
      const key = peek();
      if (key.kind !== "word" && key.kind !== "string") fail("a . is followed by a key");

      next++;
      value = call(functionNamed("get", key), [value, (key as { value: string }).value]);
    }

    return value;
  }

  // A lambda's own words, if one begins here: `m =>` or `(a, b) =>`.
  function parameters(): string[] | undefined {
    if (peek().kind === "word" && isMark("=>", peek(1))) {
      const word = (peek() as { value: string }).value;
      next += 2;

      return [word];
    }

    if (!isMark("(")) return undefined;

    const words: string[] = [];
    let ahead = 1;

    while (peek(ahead).kind === "word") {
      words.push((peek(ahead) as { value: string }).value);
      ahead++;

      if (!isMark(",", peek(ahead))) break;
      ahead++;
    }

    if (!isMark(")", peek(ahead)) || !isMark("=>", peek(ahead + 1))) return undefined;

    next += ahead + 2;
    return words;
  }

  // What follows a | : a call given what came before as its first argument.
  function stage(before: Expr): Expr {
    const token = peek();
    const id =
      token.kind === "word" && !isVariable(token.value)
        ? (next++, functionNamed(token.value, token))
        : take("@")
          ? holon()
          : fail("a | is followed by a function");

    const given = take("(") ? listed(")") : [];
    return call(id, [before, ...given]);
  }

  function expression(): Expr {
    const words = parameters();

    if (words) {
      bound.push(words);
      const gives = expression();
      bound.pop();

      return { fn: words, gives };
    }

    let value = applied();
    while (take("|")) value = stage(value);

    return value;
  }

  const read = expression();
  if (peek().kind !== "end") fail("what follows the expression is not part of it");

  return read;
}

// ---- Saying

const isWord = (text: string) => /^[\p{L}_][\p{L}\p{N}_]*$/u.test(text) && !isId(text);
const quoted = (text: string) => (isWord(text) ? text : JSON.stringify(text));

// Said in the call form. A holon is said by its id, which never changes, so what is
// said stays true however the field's names move; a function by its name, where that
// finds it alone.
export function print(expression: Expr, names: Names): string {
  const named = (id: string) => {
    const name = names.nameOf(id);
    const alone = name !== undefined && isWord(name) && names.functions(name).length === 1;

    return alone ? name : `@${id}`;
  };

  const said = (value: Expr): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);

    const form = value as Record<string, any>;

    if ("$ref" in form) return names.isFunction(form.$ref) ? named(form.$ref) : `@${form.$ref}`;
    if ("var" in form) return form.var;
    if ("?" in form) return `?${form["?"]}`;
    if ("list" in form) return `[${form.list.map(said).join(", ")}]`;

    if ("record" in form)
      return `{${Object.entries(form.record)
        .map(([key, inner]) => `${quoted(key)}: ${said(inner as Expr)}`)
        .join(", ")}}`;

    if ("fn" in form) {
      const words = form.fn as string[];
      const head = words.length === 1 ? words[0] : `(${words.join(", ")})`;

      return `${head} => ${said(form.gives)}`;
    }

    if ("call" in form) {
      const given = (form.with ?? []) as Expr[];
      const [of, key] = given;
      const isGet = names.nameOf(form.call.$ref) === "get" && given.length === 2;

      if (isGet && typeof key === "string" && isWord(key)) {
        const inner = said(of as Expr);
        return of !== null && typeof of === "object" && "fn" in of ? `(${inner}).${key}` : `${inner}.${key}`;
      }

      return `${named(form.call.$ref)}(${given.map(said).join(", ")})`;
    }

    if ("arg" in form) throw new Error("an argument is said only within the function that takes it");

    throw new Error(`not an expression: ${JSON.stringify(value).slice(0, 80)}`);
  };

  return said(expression);
}

// ---- Writing in code

// The language in a template, for code: `` ask`children(${id}) | size` ``. What is put
// into the text is put in as a value, never read as words of the language: a string
// stays a string, a holon given as { $ref } is that holon, and an expression is itself.
export function template(names: Names) {
  return (parts: TemplateStringsArray, ...given: unknown[]): Expr => {
    const put = (value: unknown): string => {
      if (value === null || typeof value !== "object") return JSON.stringify(value);
      return `(${print(value as Expr, names)})`;
    };

    return parse(
      parts.reduce((text, part, i) => text + put(given[i - 1]) + part),
      names,
    );
  };
}
