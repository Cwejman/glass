// An object for the wire's tests. echo returns its arguments with the bytes reversed;
// fail throws; count calls a listener with 1, 2 and 3, and stops says how many times
// it was stopped; use calls echo on another object it is passed.

export function thing() {
  let stopped = 0;

  async function echo(value: unknown, bytes?: Uint8Array) {
    return { value, bytes: bytes?.slice().reverse() };
  }

  async function fail(): Promise<never> {
    throw new Error("it failed");
  }

  async function count(listener: (n: number) => void) {
    [1, 2, 3].forEach((n) => listener(n));
    return () => void stopped++;
  }

  async function stops() {
    return stopped;
  }

  async function use(other: ReturnType<typeof thing>, value: unknown) {
    return other.echo(value);
  }

  return { echo, fail, count, stops, use };
}

export default () => thing();
