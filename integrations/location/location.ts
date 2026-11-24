// The location: an integration projecting the browser's address and its history into
// the field, both ways. What it is it ships in its own store, the .glass beside it: its
// root, standing on glass; the types address and history; and the three holons it
// projects, whose bodies the browser gives as it runs:
//
//   address  where the page is: origin, path and hash;
//   params   what the address asks, ?key=value, each param a key of its body, and so of
//            no type, a type naming its keys;
//   history  the browser's history: its entries, each an address, and at, the index of
//            the one shown; where the browser has no Navigation API, only how many there
//            are, as window.history says.
//
// Running, it serves that same store, the same holons under the same ids and addresses,
// the three as the browser stands; not running, strata serves it as kept, so whatever
// depends on the location reads it alike either way. It is started by browser.ts or
// machine.ts, each finding its store where it lies there, given only its scope. One
// location runs over its store at a time: a second would serve the same holons otherwise.
//
// The browser is the one source of truth: a read reads it, and the store moves whenever
// it does, by a link followed, back and forward, or a change made here. A change writes
// back: params a step in the history, and the address's hash, and its path where the
// location takes its whole origin; history's at a move through the history. History's
// entries are the browser's alone, and never written; nor is the origin, for leading to
// another site is a link's to do, the page then gone with all that would hear of it.
//
// What the location takes is its scope, given as it is made:
//   page    the page's own path: what it asks and its hash; a link to another path loads
//           that page;
//   origin  every path of its origin, as a single-page app routes them: a link to any
//           path of it, or a path written, is taken without loading a page, so whoever
//           serves the site serves the page at every path.
//
// Where the browser has the Navigation API, a link followed within the scope is taken in
// place of loading a page; elsewhere it loads the page, which reads the address anew. It
// follows the browser only while something follows it, so a store let go, its
// subscribers gone as the engine unmounts it, listens to nothing.
//
// It keeps only the present, as a buffer does, and names every head it has had, so a
// change's at is checked.

import { canonical } from "../../stores/canonical.ts";
import { hashOf } from "../../stores/act.ts";
import { present } from "../../stores/buffer/buffer.ts";
import { refusals } from "../../stores/strata/refusals.ts";
import type { Act, Head, Holon, Reply, Store } from "../../stores/store.ts";
import { heldBy } from "../../stores/strata/entries.ts";

// Where a link leads: the path given, the page's own where none is, asking these params,
// the language's punctuation left readable; asking none, the path alone.
export function href(params: Record<string, string>, path = ""): string {
  const asked = Object.entries(params)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${readable(key)}=${readable(value)}`);
  return asked.length ? `${path}?${asked.join("&")}` : path || "./";
}

const readable = (text: string) =>
  encodeURIComponent(text).replace(/%(40|3A|2C|28|29|7C|2F)/gi, (code) => decodeURIComponent(code));

// The Navigation API, where the browser has it.
type Entry = { url: string | null; key: string; index: number };
type Navigation = EventTarget & {
  entries(): Entry[];
  currentEntry: Entry | null;
  traverseTo(key: string): { committed: Promise<unknown> };
};
type Navigating = Event & {
  destination: { url: string };
  canIntercept: boolean;
  downloadRequest: string | null;
  navigationType: string;
  intercept(): void;
};

export type Scope = "page" | "origin";

// The location over its scope, started from its own store.
export async function locationStore(own: Store, scope: Scope = "page"): Promise<Store> {
  const navigation = (globalThis as { navigation?: Navigation }).navigation;
  const holons = new Map((await shipped(own)).map((holon) => [holon.id, holon]));
  // The three it projects, by their names, held by its root.
  const root = [...holons.values()].find((holon) => !heldIn(holons, holon.id))!;
  const named = (name: string) => {
    const found = heldBy(root).find((id) => holons.get(id)?.name === name);
    if (!found) throw new Error(`the location's own store holds no ${name}`);
    return found;
  };
  const ids = { address: named("address"), params: named("params"), history: named("history") };
  const had = new Map<string, Head>();
  const listeners = new Set<(head: Head | null) => void>();
  let head: Head | null = null;
  let seen = "";

  // The browser as it stands, as holons.
  function projected(): Holon[] {
    const { origin, pathname, hash, search } = location;
    const history = navigation
      ? { entries: navigation.entries().map(({ url }) => url), at: navigation.currentEntry?.index ?? null }
      : {
          length: window.history.length,
          says: "This browser shows only how many entries its history holds.",
        };
    const as = (id: string, body: Holon["body"]): Holon => ({ ...holons.get(id)!, body });
    return [
      as(ids.address, { origin, path: pathname, hash }),
      as(ids.params, Object.fromEntries(new URLSearchParams(search))),
      as(ids.history, history),
    ];
  }

  // The store moved to the browser as it stands, where it moved: by an act it took,
  // named by the act, or by the browser, named by what it now holds.
  let moving: Promise<unknown> = Promise.resolve();
  let taking: string | undefined;
  const moved = () => (moving = moving.then(move));

  async function move() {
    const now = projected();
    const said = canonical(now);
    if (head && said === seen && !taking) return;
    seen = said;
    for (const holon of now) holons.set(holon.id, holon);
    const act = taking ?? (await hashOf(said));
    taking = undefined;
    head = { act, commit: await hashOf(canonical({ act, before: head?.commit ?? null })) };
    had.set(act, head);
    for (const listener of listeners) listener(head);
  }

  // Whether an address lies within the scope.
  const within = (to: URL) =>
    to.origin === location.origin && (scope === "origin" || to.pathname === location.pathname);

  // A navigation within the scope, taken here in place of loading a page.
  function taken(event: Event) {
    const going = event as Navigating;
    if (!going.canIntercept || going.downloadRequest !== null || going.navigationType === "reload") return;
    if (within(new URL(going.destination.url))) going.intercept();
  }

  // Following the browser, from the first subscriber to the last.
  function follow(on: boolean) {
    const listen = on ? "addEventListener" : "removeEventListener";
    if (navigation) {
      navigation[listen]("navigate", taken);
      navigation[listen]("currententrychange", moved);
    } else window[listen]("popstate", moved);
  }

  // Unfollowed, the store reads the browser anew before it answers.
  const current = () => (listeners.size ? moving : moved());

  moved();

  async function read(asked: Head, question: Parameters<Store["read"]>[1]) {
    await current();
    if (had.get(asked.act)?.commit !== asked.commit)
      throw new Error(`a head the location never had: ${asked.commit}`);
    if ("act" in question)
      return lines(
        had.has(question.act)
          ? [{ act: question.act, ...(question.act !== head?.act && { kept: false }) }]
          : [],
      );
    if ("acts" in question) return lines([]);
    return present(holons, question);
  }

  // A change writes back to the browser what it writes: params, and the address within
  // the scope, a step in the history; history's at a move through it.
  async function offer(act: Act): Promise<Reply> {
    await current();
    const refused = await refusals(act);
    if (refused.length) return { refused };
    if (had.has(act.hash)) return { accepted: had.get(act.hash)! };

    const problem = unwritable(act);
    if (problem) return { refused: [{ rule: "location", says: problem }] };
    if ((act.over?.commit ?? null) !== head?.commit) return { changed: head! };

    const written = (id: string) => act.holons.find((holon) => holon.id === id)?.body;
    const address = written(ids.address) ?? holons.get(ids.address)!.body;
    const params = written(ids.params) ?? holons.get(ids.params)!.body;
    const at = written(ids.history)?.at;

    if (typeof at === "number" && at !== holons.get(ids.history)!.body.at) {
      const entry = navigation!.entries()[at];
      if (!entry) return { refused: [{ rule: "location", says: `the history holds no entry ${at}` }] };
      taking = act.hash;
      await navigation!.traverseTo(entry.key).committed;
    } else {
      const to = new URL(String(address.path), String(address.origin));
      to.search = href(params as Record<string, string>).replace(/^\.\/$/, "");
      to.hash = String(address.hash);
      taking = act.hash;
      if (to.href !== location.href) history.pushState(null, "", to);
    }
    await moved();
    return { accepted: head! };
  }

  // Why an act cannot be written back, or nothing where it can.
  function unwritable(act: Act): string | undefined {
    if (act.gone.length) return "the location's holons are the browser's, and are never taken out";
    for (const { id, body } of act.holons) {
      if (id === ids.params) {
        if (Object.values(body).some((value) => typeof value !== "string")) return "a param is a text";
      } else if (id === ids.address) {
        if (!["origin", "path", "hash"].every((key) => typeof body[key] === "string"))
          return "an address is its origin, path and hash, each a text";
        if (body.origin !== location.origin) return "leading to another site is a link's to do";
        if (!within(new URL(String(body.path), location.origin)))
          return "this location takes only its page: leading to another path is a link's to do";
      } else if (id === ids.history) {
        if (!navigation) return "this browser lets no move through its history be asked";
        if (canonical(body.entries) !== canonical(holons.get(ids.history)!.body.entries))
          return "the history's entries are the browser's alone";
      } else return "the location holds only its address, params and history";
    }
  }

  async function subscribe(listener: (head: Head | null) => void) {
    await moved();
    if (!listeners.size) follow(true);
    listeners.add(listener);
    listener(head);
    return () => {
      if (listeners.delete(listener) && !listeners.size) follow(false);
    };
  }

  return { read, offer, subscribe };
}

const encoder = new TextEncoder();
const lines = (all: unknown[]) => encoder.encode(all.map((line) => `${JSON.stringify(line)}\n`).join(""));

// Every holon a store of a few holons keeps, as it stands: each named, as the location's
// are, and so found by the facts of their names.
async function shipped(store: Store): Promise<Holon[]> {
  let head: Head | null = null;
  const stop = await store.subscribe((now) => void (head = now));
  stop();
  if (!head) throw new Error("the location's own store is empty");
  const named = linesOf(await store.read(head, { facts: { a: "name" } })) as { e: string }[];
  return linesOf(await store.read(head, { holons: [...new Set(named.map(({ e }) => e))] })) as Holon[];
}

// Whether any of the holons holds the one named.
const heldIn = (holons: ReadonlyMap<string, Holon>, id: string) =>
  [...holons.values()].some((holon) => heldBy(holon).includes(id));

const decoder = new TextDecoder();
const linesOf = (bytes: Uint8Array) =>
  decoder
    .decode(bytes)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
