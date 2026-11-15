// The contract every kind of store gives an engine.
//
// A store is mounted by an engine, which calls it; it never calls the engine. It may run
// in the same thread or elsewhere, reached over the wire (wire/wire.ts), and the engine
// uses it the same way.
//
// A store is whole in itself: it keeps its holons, their history and their index under
// a head. Its history is its commits, one for each act it took, each naming the commit
// before it. It has three
// methods: read as of a head, offer an act, and subscribe to moves of its head, whoever
// moves it. All are async.

// A holon: its id, the types it is an instance of, its name, its mould if it is a type,
// and its body. In a body, {"$ref": id} refers to another holon and says whether it
// holds it.
export type Holon = {
  id: string;
  instance: string[];
  name?: string;
  mould?: Record<string, unknown>;
  body: Record<string, unknown>;
};

// A point in a store's history: the act that made it, by its content hash, and the
// commit that keeps it here, by its history hash. A store can be read at any head it has
// had; the latest is its current state.
export type Head = { act: string; commit: string };

// ---- Reading

// A fact: one value a holon has under a key. A clause asks for facts by any of the three.
export type Value = string | number | boolean | { $ref: string };
export type Fact = { e: string; a: string; v: Value };
export type Clause = { e?: string; a?: string; v?: Value };

// What a read can ask, as of a head: a holon by id, or by address, a whole and a name;
// the facts matching a clause; the holons containing a word under a key; a holon's
// versions; the acts before the head; or whether the store took an act, named by its
// content hash, and where in its history.
export type Question =
  | { holon: string }
  | { address: [whole: string, name: string] }
  | { facts: Clause }
  | { said: { a: string; word: string } }
  | { versions: string }
  | { acts: { since?: string } }
  | { act: string };

// ---- Writing

// One broken rule, naming the holon as the caller named it.
export type Problem = { rule: string; id?: string; says: string };

// What an act touches: the holons it writes or removes, and the addresses, a whole and
// a name, it places. Two acts conflict only where these overlap.
export type Touches = { ids: string[]; addresses: [whole: string, name: string][] };

// An act as offered to one store: judged against a head, its ids minted, each reference
// saying whether it holds. An act is one in every store it touches, and the same: each
// store keeps a commit of it whole, and its own part.
//
// A store's part is the holons it keeps of the act, as partOf in act.ts writes them.
// parts names every store the act touches, by the id of its root, with the hash of its
// part, or null for a store the act only lets go in; own says which is this store. The
// act's hash is its content hash, of what it says, as contentOf in act.ts gives it, the
// same in every store. gone takes a holon out of every store that keeps it; born names the
// holons this store has never kept, so their versions before need not be looked for.
export type Act = {
  hash: string;
  at: string;
  says: string;
  by?: string;
  gone: string[];
  parts: [store: string, part: string | null][];
  own: string;
  holons: Holon[];
  born: string[];
  over: Head | null;
  touches: Touches;
};

// A store's reply to an offer: accepted, with the new head; refused, with every problem;
// or changed, because something it touches changed after it was judged, so it must be
// judged again.
export type Reply = { accepted: Head } | { refused: Problem[] } | { changed: Head };

// ---- A store

// A store's methods, implemented by each kind of store, such as strata(storage). A read
// returns bytes in the store's own format, lines of JSON, one per holon, fact, version or
// act, decoded only by whoever uses them.
export type Store = {
  read(head: Head, question: Question): Promise<Uint8Array>;
  offer(act: Act): Promise<Reply>;
  // The listener is called with the current head, then with every later one. Returns the
  // function that unsubscribes.
  subscribe(listener: (head: Head | null) => void): Promise<() => void>;
};
