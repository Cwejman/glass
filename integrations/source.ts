// What every integration gives, whatever keeps the source it reads: whether it may hold
// an id, known without fetching; a holon as it stands now; everything it holds; its
// history; and a holon's versions. Glass's own store gives these, and so does git's
// reader; the engine asks every store it reads for these alone. A store the engine
// writes is glass's own, for now.

import type { Latest, LogEntry, Version } from "./glass/store.ts";

export type Source = {
  mayHold(id: string): boolean;
  read(id: string): Promise<Latest | null>;
  all(): Promise<ReadonlyMap<string, Latest>>;
  log(): Promise<LogEntry[]>;
  versions(id: string): Promise<Version[]>;
};
