import { describe, expect, test } from "bun:test";
import { contentOf, hashOf, partOf } from "../act.ts";
import type { Act, Head, Holon, Question, Store } from "../store.ts";
import { buffer } from "./buffer.ts";

const id = (n: number) => String(n).padStart(15, "0");
let acts = 0;

// An act as an engine makes it, over a head, for the buffer named here.
async function act(over: Head | null, holons: Holon[], gone: string[] = []): Promise<Act> {
  const part = partOf(holons);
  const said = {
    when: new Date(acts++).toISOString(),
    at: [] as Act["at"],
    says: "typed",
    gone,
    parts: [["here", part && (await hashOf(part))]] as Act["parts"],
  };

  return {
    ...said,
    hash: await hashOf(contentOf(said)),
    own: "here",
    holons,
    born: [],
    over,
    touches: { ids: [...holons.map((holon) => holon.id), ...gone], addresses: [] },
  };
}

const text = (n: number, typed: string): Holon => ({
  id: id(n),
  instance: [],
  name: "query",
  body: { text: typed },
});

async function accepted(store: Store, offered: Act) {
  const reply = await store.offer(offered);
  if (!("accepted" in reply)) throw new Error(`not accepted: ${JSON.stringify(reply)}`);
  return reply.accepted;
}

async function read(store: Store, head: Head, question: Question) {
  const lines = new TextDecoder().decode(await store.read(head, question));
  return lines
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// A buffer holding a root and the text typed into it, one act after another.
async function typedInto(...typing: string[]) {
  const store = buffer();
  const root: Holon = {
    id: id(1),
    instance: [],
    name: "bar",
    body: { contents: [{ $ref: id(2), $holds: true }] },
  };
  const heads = [await accepted(store, await act(null, [root, text(2, "")]))];
  for (const typed of typing) heads.push(await accepted(store, await act(heads.at(-1)!, [text(2, typed)])));
  return { store, heads };
}

describe("a buffer", () => {
  test("holds what an act writes, and gives it as any store would", async () => {
    const { store, heads } = await typedInto("glass");
    const head = heads.at(-1)!;

    expect(await read(store, head, { holon: id(2) })).toEqual([text(2, "glass")]);
    expect(await read(store, head, { address: [id(1), "query"] })).toEqual([text(2, "glass")]);
    expect((await read(store, head, { whole: { id: id(1) } })).map((holon) => holon.id)).toEqual([
      id(1),
      id(2),
    ]);
    expect(await read(store, head, { facts: { a: "text" } })).toEqual([{ e: id(2), a: "text", v: "glass" }]);
    expect(await read(store, head, { said: { a: "text", word: "glass" } })).toEqual([
      { e: id(2), a: "text", v: "glass" },
    ]);
  });

  test("keeps nothing of what was: an earlier head reads as the present", async () => {
    const { store, heads } = await typedInto("g", "gl", "gla");

    for (const head of heads) expect(await read(store, head, { holon: id(2) })).toEqual([text(2, "gla")]);
    expect(await read(store, heads[1]!, { versions: id(2) })).toEqual([text(2, "gla")]);
    expect((await read(store, heads[0]!, { acts: {} })).map(({ hash }) => hash)).toEqual([heads.at(-1)!.act]);
  });

  test("knows every head it has had, and no other", async () => {
    const { store, heads } = await typedInto("g", "gl");

    const present = heads.at(-1)!;
    expect(await read(store, present, { act: present.act })).toEqual([{ act: present.act }]);
    expect(await read(store, present, { act: heads[0]!.act })).toEqual([{ act: heads[0]!.act, kept: false }]);
    expect(await read(store, heads.at(-1)!, { act: "never" })).toEqual([]);
    await expect(store.read({ act: "never", commit: "never" }, { holon: id(2) })).rejects.toThrow();
  });

  test("its head moves with every act, and each move is told", async () => {
    const store = buffer();
    const told: (Head | null)[] = [];
    const stop = await store.subscribe((head) => told.push(head));

    const first = await accepted(store, await act(null, [text(2, "g")]));
    const second = await accepted(store, await act(first, [text(2, "gl")]));
    stop();
    await accepted(store, await act(second, [text(2, "gla")]));

    expect(told).toEqual([null, first, second]);
    expect(first.commit).not.toBe(second.commit);
  });

  test("an act offered twice is taken once", async () => {
    const store = buffer();
    const typed = await act(null, [text(2, "g")]);

    expect(await store.offer(typed)).toEqual(await store.offer(typed));
  });

  test("an act judged against an earlier head is answered changed", async () => {
    const { store, heads } = await typedInto("g", "gl");

    expect(await store.offer(await act(heads[0]!, [text(2, "x")]))).toEqual({ changed: heads.at(-1)! });
  });

  test("of two acts offered at once over one head, the second is answered changed", async () => {
    const { store, heads } = await typedInto("g");
    const over = heads.at(-1)!;
    const [first, second] = await Promise.all([
      store.offer(await act(over, [text(2, "gl")])),
      store.offer(await act(over, [text(2, "gx")])),
    ]);

    expect(first).toHaveProperty("accepted");
    expect(second).toEqual({ changed: (first as { accepted: Head }).accepted });
  });

  test("an act lets go of what it takes out", async () => {
    const { store, heads } = await typedInto("g");
    const head = await accepted(store, await act(heads.at(-1)!, [], [id(2)]));

    expect(await read(store, head, { holon: id(2) })).toEqual([]);
  });

  test("an act whose hash or part is not its own is refused", async () => {
    const store = buffer();
    const typed = await act(null, [text(2, "g")]);

    expect(await store.offer({ ...typed, hash: "wrong" })).toMatchObject({ refused: [{ rule: "hash" }] });
    expect(await store.offer({ ...typed, holons: [text(2, "x")] })).toMatchObject({
      refused: [{ rule: "part" }],
    });
  });
});
