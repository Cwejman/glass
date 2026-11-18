// A buffer: holons whose changes are never kept, such as the characters being typed. It
// keeps the store contract in memory, in any runtime, a browser's page or Bun, and holds
// only the present: an act it takes replaces the holons it writes and lets go of those it
// takes out, and moves its head, so whoever subscribed and the engine's kept reads run
// again; nothing of what was there before is kept.
//
// What each question answers, without a past:
//   - read at a head the buffer has had answers the present, whichever head it names,
//     since no earlier state is kept to answer from; at a head it never had, it refuses.
//   - versions gives the present version alone, and acts the latest act alone.
//   - act says whether the buffer took an act. It keeps the name of every head it has
//     had, and nothing of what they held, so a change's at is checked as for any store;
//     of an act before the present it says kept: false, as what it left is not kept.
//
// So the engine's checks hold as they can. A change made from an earlier head is taken,
// its at a head the buffer has had; strict, it is refused as moved, for the buffer cannot
// say what moved since its at, and so does not say nothing did. An act judged against a
// head that is no longer the present is answered changed, whatever it touches, and the
// engine judges it again.

import { canonical } from "../../integrations/glass/canonical.ts";
import { hashOf, lineOf } from "../act.ts";
import type { Act, Clause, Fact, Head, Holon, Question, Reply, Store } from "../store.ts";
import { factsOf, heldBy, wordsOf } from "../strata/entries.ts";
import { refusals } from "../strata/refusals.ts";

const encoder = new TextEncoder();

type Whole = { id: string; depth?: number; stop?: string[] };

export function buffer(): Store {
  // The present: every holon by id, the head, the latest act as acts lists it, and the
  // name of every head the buffer has had, by its act's content hash.
  const holons = new Map<string, Holon>();
  let head: Head | null = null;
  let latest: Record<string, unknown> | null = null;
  const had = new Map<string, Head>();
  const listeners = new Set<(head: Head | null) => void>();

  async function read(asked: Head, question: Question) {
    if (had.get(asked.act)?.commit !== asked.commit)
      throw new Error(`a head this buffer never had: ${asked.commit}`);

    if ("holon" in question) return lines(kept([question.holon]).map(lineOf));
    if ("holons" in question) return lines(kept(question.holons).map(lineOf));
    if ("address" in question) return lines(kept([addressed(...question.address)]).map(lineOf));
    if ("whole" in question) return lines(whole(question.whole).map(lineOf));
    if ("facts" in question) return lines(facts(question.facts).map(json));
    if ("said" in question) return lines(said(question.said).map(json));
    if ("versions" in question) return lines(kept([question.versions]).map(lineOf));
    if ("act" in question) {
      const present = question.act === head?.act;
      return lines(
        had.has(question.act) ? [json({ act: question.act, ...(!present && { kept: false }) })] : [],
      );
    }

    const since = question.acts.since;
    return lines(latest && latest.hash !== since ? [json(latest)] : []);
  }

  // Takes the act over the present, unless it was judged against another head. The head
  // it moves to is named, as in any store, by the act and the head before it. Acts are
  // taken one at a time, in the order offered, so none is laid over a head it never saw.
  let taking: Promise<unknown> = Promise.resolve();
  function offer(act: Act): Promise<Reply> {
    const reply = taking.then(() => take(act));
    taking = reply.catch(() => {});
    return reply;
  }

  async function take(act: Act): Promise<Reply> {
    const refused = await refusals(act);
    if (refused.length) return { refused };

    const taken = had.get(act.hash);
    if (taken) return { accepted: taken };
    if ((act.over?.commit ?? null) !== (head?.commit ?? null))
      return head
        ? { changed: head }
        : { refused: [{ rule: "over", says: "judged against a head this buffer never had" }] };

    for (const id of act.gone) holons.delete(id);
    for (const holon of act.holons) holons.set(holon.id, holon);

    const { hash, when, says, by, at, gone, parts } = act;
    head = { act: hash, commit: await hashOf(canonical({ act: hash, before: head?.commit ?? null })) };
    latest = { hash, when, says, ...(by !== undefined && { by }), at, gone, parts };
    had.set(hash, head);

    for (const listener of listeners) listener(head);
    return { accepted: head };
  }

  async function subscribe(listener: (head: Head | null) => void) {
    listeners.add(listener);
    listener(head);
    return () => void listeners.delete(listener);
  }

  // ---- The present, asked

  // The holons kept by these ids, in the order given, those not kept left out.
  const kept = (ids: readonly (string | undefined)[]) =>
    ids.flatMap((id) => (id !== undefined && holons.has(id) ? [holons.get(id)!] : []));

  // The holon a whole holds under a name.
  function addressed(whole: string, name: string) {
    const held = holons.has(whole) ? heldBy(holons.get(whole)!) : [];
    return kept(held).find((part) => part.name === name)?.id;
  }

  // The holon, then what it holds, a layer at a time, each once, to the depth asked,
  // entering nothing of a type stop names but the holon asked for.
  function whole({ id, depth = Number.POSITIVE_INFINITY, stop = [] }: Whole) {
    const seen = new Set<string>();
    const found: Holon[] = [];

    for (let layer = [id], down = 0; layer.length && down <= depth; down++) {
      const fresh = kept([...new Set(layer)].filter((each) => !seen.has(each)));
      fresh.forEach(({ id }) => seen.add(id));
      found.push(...fresh);
      layer = fresh
        .filter((holon) => holon.id === id || !holon.instance.some((type) => stop.includes(type)))
        .flatMap(heldBy);
    }

    return found;
  }

  function facts({ e, a, v }: Clause): Fact[] {
    if (e === undefined && a === undefined && v === undefined)
      throw new Error("a clause needs a holon, an attribute or a reference");

    const among = e === undefined ? [...holons.values()] : kept([e]);
    return among
      .flatMap(factsOf)
      .filter(
        (fact) =>
          (a === undefined || fact.a === a) && (v === undefined || canonical(fact.v) === canonical(v)),
      );
  }

  // The holons whose text under a key has the word, in the order of their ids.
  function said({ a, word }: { a: string; word: string }): Fact[] {
    return facts({ a })
      .filter(({ v }) => typeof v === "string" && wordsOf(v).includes(word))
      .map(({ e }) => ({ e, a, v: word }))
      .sort((x, y) => (x.e < y.e ? -1 : x.e > y.e ? 1 : 0))
      .filter((fact, i, all) => i === 0 || all[i - 1]!.e !== fact.e);
  }

  return { read, offer, subscribe };
}

const json = (value: unknown) => JSON.stringify(value);

// Lines of JSON, one a line, as every store answers.
const lines = (all: string[]) => encoder.encode(all.map((line) => `${line}\n`).join(""));
