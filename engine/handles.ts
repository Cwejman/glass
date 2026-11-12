// A change brings holons into being under handles of its own, "~1" for one, used
// wherever an id goes; the engine gives them their ids as it plans the act.

export const isHandle = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("~");

// Handles in order, "~1", "~2", for a writer bringing holons into being.
export function handles() {
  let count = 0;
  return () => `~${++count}`;
}
