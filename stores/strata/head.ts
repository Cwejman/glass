// A store's history and where it stands now.
//
// A commit is one small blob of JSON: the act whole, as every store it touches keeps it
// ({when, says, by, at, gone, parts}), which store this is (own), the commit before it, and its
// number, counting from 1. Its name, the hash of its bytes, is its history hash; the hash
// of its act's canonical JSON is the act's content hash. Commits are history and nothing
// else: they name no index, so nothing but an act ever writes one.
//
// The head is a short text: the name of the latest commit on its first line, then one
// line for each run of the index, newest first, saying the run's blob, how many entries
// it holds, where its index lies, and, for a run one act wrote, that act's number, which
// stands as the stamp of every entry in it. An act moves the head to its commit and its
// run added; compaction moves it to the same commit with runs merged.

import { contentOf, hashOf } from "../act.ts";
import type { Act, Head } from "../store.ts";
import { keyBytes, keyOf } from "./entries.ts";
import { entriesFor, type Run } from "./run.ts";
import type { Storage } from "./storage/storage.ts";

export type Commit = {
  act: Pick<Act, "when" | "says" | "by" | "at" | "gone" | "parts">;
  own: string;
  predecessors: string[];
  number: number;
};

// The head as it stands: the latest commit, and the runs of the index.
export type State = { commit: string; runs: Run[] };

// The index as of a head: the runs the store has now, and the number of the head's commit.
export type View = { runs: Run[]; upTo: number };

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function commitAt(storage: Storage, name: string): Promise<Commit> {
  return storage.read(name).then((bytes) => JSON.parse(decoder.decode(bytes)));
}

export const commitBytes = (commit: Commit) => encoder.encode(JSON.stringify(commit));

// The head a commit stands for: its act's content hash, and the commit's name.
export async function headAt(storage: Storage, commit: string): Promise<Head> {
  return { act: await hashOf(contentOf((await commitAt(storage, commit)).act)), commit };
}

export function stateOf(text: string): State {
  const [commit, ...runs] = text.split("\n");

  return {
    commit: commit!,
    runs: runs.map((line) => {
      const [blob, count, offset, length, act] = line.split(" ");
      const run: Run = { blob: blob!, count: Number(count), index: [Number(offset), Number(length)] };
      return act === undefined ? run : { ...run, act: Number(act) };
    }),
  };
}

export function stateText({ commit, runs }: State): string {
  const lines = runs.map(({ blob, count, index: [offset, length], act }) =>
    [blob, count, offset, length, ...(act === undefined ? [] : [act])].join(" "),
  );
  return [commit, ...lines].join("\n");
}

// The head as it stands now, or null for a store never written.
export async function stateNow(storage: Storage): Promise<State | null> {
  const text = await storage.head();
  return text === null ? null : stateOf(text);
}

// The index as of a head, read through the runs the store has now.
export async function viewAt(storage: Storage, head: Head | null): Promise<View | null> {
  if (!head) return null;
  const now = await stateNow(storage);
  return { runs: now?.runs ?? [], upTo: (await commitAt(storage, head.commit)).number };
}

// The head of the commit that took an act, named by its content hash, if the store took
// it: the index stamps the act with its number, and the commit of that number is found by
// walking back from the head.
export async function takenAt(storage: Storage, now: State, act: string): Promise<Head | null> {
  const upTo = (await commitAt(storage, now.commit)).number;
  const key = keyBytes("acts", keyOf([act]));
  const stamps = (await Promise.all(now.runs.map((run) => entriesFor(storage, run, key, upTo)))).flat();
  if (!stamps.length) return null;

  const number = stamps[0]!.act;
  let commit = now.commit;
  for (let at = await commitAt(storage, commit); at.number > number; at = await commitAt(storage, commit))
    commit = at.predecessors[0]!;
  return headAt(storage, commit);
}

// Every blob the head reaches: the runs it names, every commit back to the first, and the
// part each commit names as this store's own.
export async function blobsOf(storage: Storage): Promise<string[]> {
  const now = await stateNow(storage);
  if (!now) return [];

  const blobs = now.runs.map(({ blob }) => blob);
  for (let name: string | undefined = now.commit; name; ) {
    const { act, own, predecessors } = await commitAt(storage, name);
    blobs.push(name, ...act.parts.flatMap(([store, part]) => (store === own && part ? [part] : [])));
    name = predecessors[0];
  }
  return blobs;
}
