// What the engine asks of a store it reads, whatever keeps it: whether it may hold an
// id, known without fetching; a holon as it stands now; everything it holds; its history;
// and a holon's versions. Glass's own store gives these, and so would an integration
// reading another source. A store the engine writes is glass's own, for now.

import type { Latest, LogEntry, Version } from "../integrations/glass/store.ts";

export type Source = {
  mayHold(id: string): boolean;
  read(id: string): Promise<Latest | null>;
  all(): Promise<ReadonlyMap<string, Latest>>;
  log(): Promise<LogEntry[]>;
  versions(id: string): Promise<Version[]>;
};
