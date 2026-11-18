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
//
// A text is read in two steps: its syntax, then its names found. It is read into the
// earlier form of an expression, for the earlier engine, or into a read of uses the new
// engine works out, and said again from either.

import { isHandle } from "../engine/handles.ts";
import type { Read } from "../engine/next/engine.ts";
import { isId } from "../integrations/glass/store.ts";
import type { Holon } from "../stores/store.ts";
import { isRef, type Expression as Expr } from "./expression.ts";

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
  // The language's own types by name: use, function, and the kinds of value a
  // placeholder takes. Reading into uses needs them; the earlier form does not.
  typeOf?(name: string): string | undefined;
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

// What a text says, before any name in it is found: its tree, each part at the place in
// the text it begins, so a name that finds nothing can say where. A lambda's word is
// known as one here, by the lambdas around it; every other word names a function.
export type Syntax = { text: string; tree: Node };

export type Node = { at: number } & (
  | { kind: "value"; value: null | boolean | number | string }
  | { kind: "variable"; name: string }
  | { kind: "word"; word: string }
  | { kind: "function"; name: string }
  | { kind: "holon"; route: Route }
  | { kind: "call"; fn: Node; given: Node[] }
  | { kind: "key"; of: Node; key: string }
  | { kind: "list"; items: Node[] }
  | { kind: "record"; fields: [string, Node][] }
  | { kind: "lambda"; words: string[]; gives: Node }
);

export function syntax(text: string): Syntax {
  const tokens = tokensOf(text);
  let next = 0;

  const peek = (ahead = 0) => tokens[next + ahead]!;

  const fail = (what: string, token = peek()): never => {
    throw new Error(`${what}, at ${where(text, token.at)}`);
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

  // What may be given in a list: expressions set apart by commas, closed by the mark.
  function listed(close: string) {
    const all: Node[] = [];
    if (take(close)) return all;

    do all.push(expression());
    while (take(","));

    expect(close, `a list of what is given is closed by ${close}`);

    return all;
  }

  // A holon after @: its id, or a route of names, each a word or quoted, from anywhere,
  // or from a store's level when the store's key and a colon begin it.
  function holon(): Node {
    const at = peek().at;
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

    return { at, kind: "holon", route };
  }

  // A function or a holon, called if parentheses follow.
  const called = (fn: Node): Node => (take("(") ? { at: fn.at, kind: "call", fn, given: listed(")") } : fn);

  function atom(): Node {
    const token = peek();
    const at = token.at;

    if (token.kind === "number" || token.kind === "string") {
      next++;
      return { at, kind: "value", value: token.value };
    }

    if (token.kind === "variable") {
      next++;
      return { at, kind: "variable", name: token.value };
    }

    if (take("@")) return called(holon());
    if (take("[")) return { at, kind: "list", items: listed("]") };

    if (take("{")) {
      const fields: [string, Node][] = [];

      if (!take("}")) {
        do {
          const key = peek();
          if (key.kind !== "word" && key.kind !== "string") fail("a record's key is a word or a string");

          next++;
          expect(":", "a record's key is followed by :");
          fields.push([(key as { value: string }).value, expression()]);
        } while (take(","));

        expect("}", "a record is closed by }");
      }

      return { at, kind: "record", fields };
    }

    if (take("(")) {
      const inner = expression();
      expect(")", "what is opened by ( is closed by )");

      return inner;
    }

    if (token.kind === "word") {
      next++;

      if (["true", "false", "null"].includes(token.value))
        return { at, kind: "value", value: JSON.parse(token.value) };
      if (isVariable(token.value)) return { at, kind: "word", word: token.value };

      return called({ at, kind: "function", name: token.value });
    }

    return fail("an expression begins here");
  }

  // An atom, then what it holds under a key.
  function applied(): Node {
    let value = atom();

    while (take(".")) {
      const key = peek();
      if (key.kind !== "word" && key.kind !== "string") fail("a . is followed by a key");

      next++;
      value = { at: key.at, kind: "key", of: value, key: (key as { value: string }).value };
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
  function stage(before: Node): Node {
    const token = peek();
    const fn: Node =
      token.kind === "word" && !isVariable(token.value)
        ? (next++, { at: token.at, kind: "function", name: token.value })
        : take("@")
          ? holon()
          : fail("a | is followed by a function");

    return { at: fn.at, kind: "call", fn, given: [before, ...(take("(") ? listed(")") : [])] };
  }

  function expression(): Node {
    const at = peek().at;
    const words = parameters();

    if (words) {
      bound.push(words);
      const gives = expression();
      bound.pop();

      return { at, kind: "lambda", words, gives };
    }

    let value = applied();
    while (take("|")) value = stage(value);

    return value;
  }

  const tree = expression();
  if (peek().kind !== "end") fail("what follows the expression is not part of it");

  return { text, tree };
}

// How a text's names are found: a function by its name, a holon by its id or its route,
// each found alone, or a problem saying where, and which ones a name finds.
function finding(text: string, names: Names) {
  const fail = (what: string, at: number, after = ""): never => {
    throw new Error(`${what}, at ${where(text, at)}${after}`);
  };

  function one(found: string[], what: string, at: number): string {
    if (found.length === 0) fail(`there is no ${what}`, at);

    if (found.length > 1) {
      const which = found.map((id) => `\n  @${id}${names.about ? ` ${names.about(id)}` : ""}`).join("");
      fail(
        `${what} names ${found.length}`,
        at,
        `; say which by @id, or by a route through what holds it:${which}`,
      );
    }

    return found[0]!;
  }

  const functionAt = (name: string, at: number) => one(names.functions(name), `function ${name}`, at);

  const holonAt = (route: Route, at: number) =>
    !route.store && route.names.length === 1 && isId(route.names[0])
      ? route.names[0]
      : one(names.holons(route), `holon ${routeText(route)}`, at);

  // What a call applies: a function by its name, or a holon by @.
  const applying = (fn: Node) =>
    fn.kind === "function" ? functionAt(fn.name, fn.at) : holonAt((fn as { route: Route }).route, fn.at);

  return { fail, functionAt, holonAt, applying };
}

// A text read into the earlier form of an expression, as the earlier engine takes it.
export function toExpression({ text, tree }: Syntax, names: Names): Expr {
  const { functionAt, holonAt, applying } = finding(text, names);

  const expression = (node: Node): Expr => {
    switch (node.kind) {
      case "value":
        return node.value;
      case "variable":
        return { "?": node.name };
      case "word":
        return { var: node.word };
      case "function":
        return { $ref: functionAt(node.name, node.at) };
      case "holon":
        return { $ref: holonAt(node.route, node.at) };
      case "call":
        return call(applying(node.fn), node.given.map(expression));
      case "key": {
        const of = expression(node.of);
        return call(functionAt("get", node.at), [of, node.key]);
      }
      case "list":
        return { list: node.items.map(expression) };
      case "record":
        return { record: Object.fromEntries(node.fields.map(([key, inner]) => [key, expression(inner)])) };
      case "lambda":
        return { fn: node.words, gives: expression(node.gives) };
    }
  };

  return expression(tree);
}

export const parse = (text: string, names: Names): Expr => toExpression(syntax(text), names);

// The natives find reads as clauses of clauses.
const combining = new Set(["not", "or", "and"]);

// A text read into uses, carried by the read under handles: a call a use of its
// function, `a | f(b)` the use f(a, b); a lambda a function held where it is written,
// its words placeholders of the kind value; lists and records JSON as they are, a held
// use at each place one is written. A holon is referred to, and a stored use so referred
// to gives what it gives.
//
// Within find a clause that is a lambda is a test: its words are the pattern's
// variables, so `n => gt(n, 3)` is read as the use gt(?n, 3).
export function toRead({ text, tree }: Syntax, names: Names): Read {
  const { fail, functionAt, holonAt, applying } = finding(text, names);
  const holons: Holon[] = [];

  const typed = (name: string) =>
    names.typeOf?.(name) ?? fail(`the language's type ${name} is not in the field`, tree.at);

  // A holon carried by the read, under the next handle.
  const carried = (type: string): Holon => {
    const holon: Holon = { id: `~${holons.length + 1}`, instance: [typed(type)], body: {} };
    holons.push(holon);
    return holon;
  };

  // What each lambda word around stands for: a placeholder, or a pattern's variable.
  type Scope = ReadonlyMap<string, unknown>;

  const use = (fn: string, args: () => unknown[]) => {
    const holon = carried("use");
    holon.body = { fn: { $ref: fn }, args: args() };
    return { $ref: holon.id, $holds: true };
  };

  function arg(node: Node, scope: Scope): unknown {
    switch (node.kind) {
      case "value":
        return node.value;
      case "variable":
        return { "?": node.name };
      case "word":
        return scope.get(node.word);
      case "function":
        return { $ref: functionAt(node.name, node.at) };
      case "holon":
        return { $ref: holonAt(node.route, node.at) };
      case "call": {
        const fn = applying(node.fn);
        const pattern = names.nameOf(fn) === "find";
        return use(fn, () =>
          node.given.map((each, i) => (pattern && i > 0 ? clause(each, scope) : arg(each, scope))),
        );
      }
      case "key":
        return use(functionAt("get", node.at), () => [arg(node.of, scope), node.key]);
      case "list":
        return node.items.map((each) => arg(each, scope));
      case "record":
        return Object.fromEntries(
          node.fields.map(([key, inner]) => {
            if (key === "$ref" || key === "?")
              fail(`a record's key ${key} would be read as a holon or a variable`, inner.at);
            return [key, arg(inner, scope)];
          }),
        );
      case "lambda": {
        const fn = carried("function");
        const input = node.words.map((word) => Object.assign(carried("value"), { name: word }).id);
        const within = new Map([
          ...scope,
          ...node.words.map((word, i) => [word, { $ref: input[i] }] as const),
        ]);
        fn.body = { input: input.map(($ref) => ({ $ref, $holds: true })), body: arg(node.gives, within) };
        return { $ref: fn.id, $holds: true };
      }
    }
  }

  // A clause of a pattern: a test written as a lambda, its words the pattern's
  // variables; not, or and and, each a clause of clauses; anything else as it is.
  function clause(node: Node, scope: Scope): unknown {
    if (node.kind === "lambda")
      return arg(
        node.gives,
        new Map([...scope, ...node.words.map((word) => [word, { "?": word }] as const)]),
      );

    const fn = node.kind === "call" ? applying(node.fn) : undefined;
    if (!fn || !combining.has(names.nameOf(fn) ?? "")) return arg(node, scope);

    return use(fn, () => (node as { given: Node[] }).given.map((each) => clause(each, scope)));
  }

  const gives = arg(tree, new Map());
  return holons.length ? { gives, holons } : { gives };
}

// ---- Saying

const isWord = (text: string) => /^[\p{L}_][\p{L}\p{N}_]*$/u.test(text) && !isId(text);
const quoted = (text: string) => (isWord(text) ? text : JSON.stringify(text));

// Said in the call form. A holon is said by its id, which never changes, so what is
// said stays true however the field's names move; a function by its name, where that
// finds it alone.
export function print(expression: Expr, names: Names): string {
  const named = (id: string) => functionSaid(id, names);

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

// A function by its name, where that finds it alone, and else by its id.
function functionSaid(id: string, names: Names) {
  const name = names.nameOf(id);
  const alone = name !== undefined && isWord(name) && names.functions(name).length === 1;

  return alone ? name : `@${id}`;
}

type Link = { $ref: string; $holds?: boolean };

// A read said in the same form: a use held where it is written as a call, a function
// held there as a lambda, its placeholders by their names, and ?x as itself. A named use
// held elsewhere and reused here is said by its name, where that finds it alone; any
// other holon by its id. The holons a read does not carry are found by stored, if given.
export function printRead(
  { gives, holons = [] }: Read,
  names: Names,
  stored?: (id: string) => Holon | undefined,
) {
  const carried = new Map(holons.map((holon) => [holon.id, holon]));
  const holonOf = (id: string) => carried.get(id) ?? stored?.(id);
  const is = (holon: Holon | undefined, type: string) =>
    holon !== undefined && holon.instance.includes(names.typeOf?.(type) ?? "");

  // The placeholders of the lambdas around, by id, each said by its name.
  type Around = ReadonlyMap<string, string>;

  const said = (arg: unknown, around: Around): string => {
    if (arg === null || typeof arg !== "object") return JSON.stringify(arg);
    if (Array.isArray(arg)) return `[${arg.map((each) => said(each, around)).join(", ")}]`;
    if (isRef(arg)) return referred(arg, around);

    const record = arg as Record<string, unknown>;
    if (typeof record["?"] === "string" && Object.keys(record).length === 1) return `?${record["?"]}`;

    return `{${Object.entries(record)
      .map(([key, inner]) => `${quoted(key)}: ${said(inner, around)}`)
      .join(", ")}}`;
  };

  function referred({ $ref: id, $holds }: Link, around: Around): string {
    if (around.has(id)) return around.get(id)!;

    const holon = holonOf(id);
    if (is(holon, "use")) return $holds || isHandle(id) ? used(holon!, around) : reused(holon!);
    if (is(holon, "function") && $holds) return lambda(holon!, around);

    return names.isFunction(id) ? functionSaid(id, names) : `@${id}`;
  }

  function reused({ id, name }: Holon) {
    const alone = name !== undefined && names.holons({ names: [name] }).length === 1;
    return alone ? `@${quotedName(name)}` : `@${id}`;
  }

  function used({ id, body }: Holon, around: Around): string {
    const { fn, args } = body as { fn?: unknown; args?: unknown };
    if (!isRef(fn)) throw new Error(`the use ${id} names no function, so it is said only where it is drawn`);

    const given = Array.isArray(args) ? args : [];
    const [of, key] = given;
    const isGet = names.nameOf(fn.$ref) === "get" && given.length === 2;

    if (isGet && typeof key === "string" && isWord(key)) {
      const inner = said(of, around);
      const isLambda = isRef(of) && (of as Link).$holds && is(holonOf(of.$ref), "function");
      return isLambda ? `(${inner}).${key}` : `${inner}.${key}`;
    }

    return `${said(fn, around)}(${given.map((each) => said(each, around)).join(", ")})`;
  }

  function lambda({ body }: Holon, around: Around): string {
    const input = (Array.isArray(body.input) ? body.input : []).filter(isRef);
    const words = input.map(({ $ref }) => holonOf($ref)?.name ?? $ref);
    const within = new Map([...around, ...input.map(({ $ref }, i) => [$ref, words[i]!] as const)]);
    const head = words.length === 1 ? words[0] : `(${words.join(", ")})`;

    return `${head} => ${said(body.body, within)}`;
  }

  return said(gives, new Map());
}

// A use kept in the field said as it is written, not by its name.
export const printUse = (id: string, names: Names, stored: (id: string) => Holon | undefined) =>
  printRead({ gives: { $ref: id, $holds: true } }, names, stored);

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
