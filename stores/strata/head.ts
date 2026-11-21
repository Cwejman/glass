// A store's history and where it stands now.
//
// A commit is one small blob of JSON: the act whole, as every store it touches keeps it
// ({when, says, by, at, gone, parts}), which store this is (own), the commit before it, and its
// number, counting from 1. Its name, the hash of its bytes, is its history hash; the hash
// of its act's canonical JSON is the act's content hash. Commits are history and nothing
// else: they name no index, so nothing but an act ever writes one.
//
// The history's head is the name of the latest commit, and only an act moves it. The
// index's head is a short text: the name of the commit the index is up to on its first
// line, then one line for each run, newest first, saying the run's blob, how many entries
// it holds, where its index lies, and, for a run one act wrote, that act's number, which
// stands as the stamp of every entry in it. Indexing a commit moves it to that commit with
// its run added; compaction moves it to the same commit with runs merged.

import { contentOf, hashOf } from "../act.ts";
import type { Act, Head } from "../store.ts";
import { keyBytes, keyOf } from "./entries.ts";
import { entriesFor, type Run } from "./run.ts";
import type { Storage, Storages } from "./storage/storage.ts";

export type Commit = {
  act: Pick<Act, "when" | "says" | "by" | "at" | "gone" | "parts">;
  own: string;
  predecessors: string[];
  number: number;
};

// The index's head: the commit it is up to, and its runs.
export type State = { commit: string; runs: Run[] };

// The index as of a head: the runs the store has now, and the number of the head's commit.
export type View = { runs: Run[]; upTo: number };

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function commitAt(history: Storage, name: string): Promise<Commit> {
  return history.read(name).then((bytes) => JSON.parse(decoder.decode(bytes)));
}

export const commitBytes = (commit: Commit) => encoder.encode(JSON.stringify(commit));

// The head a commit stands for: its act's content hash, and the commit's name.
export async function headAt(history: Storage, commit: string): Promise<Head> {
  return { act: await hashOf(contentOf((await commitAt(history, commit)).act)), commit };
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

// The name of the latest commit, or null for a store never written.
export const latestCommit = (history: Storage) => history.head();

// The index's head as it stands now, or null for an index never written.
export async function indexNow(index: Storage): Promise<State | null> {
  const text = await index.head();
  return text === null ? null : stateOf(text);
}

// The index as of a head, read through the runs the store has now.
export async function viewAt({ history, index }: Storages, head: Head | null): Promise<View | null> {
  if (!head) return null;
  const now = await indexNow(index);
  return { runs: now?.runs ?? [], upTo: (await commitAt(history, head.commit)).number };
}

// The head of the commit that took an act, named by its content hash, if the store took
// it: the index stamps the act with its number, and the commit of that number is found by
// walking back from the head.
export async function takenAt({ history, index }: Storages, now: State, act: string): Promise<Head | null> {
  const upTo = (await commitAt(history, now.commit)).number;
  const key = keyBytes("acts", keyOf([act]));
  const stamps = (await Promise.all(now.runs.map((run) => entriesFor(index, run, key, upTo)))).flat();
  if (!stamps.length) return null;

  const number = stamps[0]!.act;
  let commit = now.commit;
  for (let at = await commitAt(history, commit); at.number > number; at = await commitAt(history, commit))
    commit = at.predecessors[0]!;
  return headAt(history, commit);
}

// Every blob the heads reach: of the history, every commit back to the first and the part
// each names as this store's own; of the index, the runs its head names.
export async function blobsOf({ history, index }: Storages) {
  const blobs = {
    history: [] as string[],
    index: (await indexNow(index))?.runs.map(({ blob }) => blob) ?? [],
  };

  for (let name = await latestCommit(history); name; ) {
    const { act, own, predecessors }: Commit = await commitAt(history, name);
    blobs.history.push(name, ...act.parts.flatMap(([store, part]) => (store === own && part ? [part] : [])));
    name = predecessors[0] ?? null;
  }
  return blobs;
}
