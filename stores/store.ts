// What every kind of store gives an engine: the contract the engine stands on.
//
// A store is whole in itself. It keeps its holons, their history and its index under a
// head, and each head names the act that made it and the head before it. Everything it
// is rests where it is kept. To an engine a store is three functions: read the store as
// of a head, offer an act, and subscribe to be told whenever its head moves, whoever
// moved it. Each is asynchronous, none blocking.

// A holon: its id, what it is an instance of, its name, its mould if it is a type, and
// its body, where {"$ref": id} refers to another and says whether it holds it.
export type Holon = {
  id: string;
  instance: string[];
  name?: string;
  mould?: Record<string, unknown>;
  body: Record<string, unknown>;
};

// Where a store stands: the act it last took, and the page reading it starts from. A
// store can be read as of any head it has stood at; its latest is where it stands now.
export type Head = { act: string; page: string };

// ---- Reading

// A fact: one thing a holon says, under a key; a clause asks for facts with any of the
// three known.
export type Value = string | number | boolean | { $ref: string };
export type Fact = { e: string; a: string; v: Value };
export type Clause = { e?: string; a?: string; v?: Value };

// What may be read as of a head: a holon by its id, or by its address, a whole and a
// name; the facts a clause asks for, or the holons saying a word under a key; a holon's
// versions; and the acts that came before the head.
export type Question =
  | { holon: string }
  | { address: [whole: string, name: string] }
  | { facts: Clause }
  | { said: { a: string; word: string } }
  | { versions: string }
  | { acts: { since?: string } };

// ---- Writing

// One rule broken, naming the holon in the caller's words.
export type Problem = { rule: string; id?: string; says: string };

// What an act touches: the holons it writes and lets go, and the addresses it places, a
// whole and a name. Two acts meet where these meet, and only there.
export type Touches = { ids: string[]; addresses: [whole: string, name: string][] };

// An act, as it is offered to one store: judged over a head, its ids minted, each
// reference saying whether it holds. An act across stores is one act in each, sharing
// its hash and naming the others.
export type Act = {
  hash: string;
  at: string;
  says: string;
  over: Head | null;
  holons: Holon[];
  gone: string[];
  touches: Touches;
  alongside: string[];
};

// What a store says to an act: accepted, at its new head; refused, every problem at
// once; or changed, since what it touches changed after it was judged, so it is judged
// again.
export type Reply = { accepted: Head } | { refused: Problem[] } | { changed: Head };

// ---- A store

// A store, as an engine is given it: three functions, whatever keeps it and wherever it
// runs. Whoever starts a store makes these and hands them on.
export type Store = {
  read(head: Head, question: Question): Promise<unknown>;
  offer(act: Act): Promise<Reply>;
  // Subscribed to: the listener is given where the store stands now, then every later
  // move of its head; what comes back is how to stop.
  subscribe(listener: (head: Head | null) => void): Promise<() => void>;
};
