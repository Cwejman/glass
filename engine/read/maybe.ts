// A value now, or a promise of it where it waits on a store. Working an expression out
// waits only where a holon is not yet held, so what is held is used at once and the
// work stays in one turn of the event loop, where every promise would have put it off.

export type Maybe<T> = T | Promise<T>;

export const waits = <T>(value: Maybe<T>): value is Promise<T> => value instanceof Promise;

// What follows from a value, at once if it is here, else when it comes.
export const after = <T, U>(value: Maybe<T>, then: (value: T) => Maybe<U>): Maybe<U> =>
  waits(value) ? value.then(then) : then(value);

// Every value of a list, at once if all are here.
export const all = <T>(values: Maybe<T>[]): Maybe<T[]> =>
  values.some(waits) ? Promise.all(values) : (values as T[]);

// A fold over a list, waiting only on the steps that wait.
export function each<T, A>(items: readonly T[], start: A, step: (acc: A, item: T) => Maybe<A>): Maybe<A> {
  let i = 0;
  const go = (acc: A): Maybe<A> => {
    while (i < items.length) {
      const next = step(acc, items[i++]!);
      if (waits(next)) return next.then(go);
      acc = next;
    }
    return acc;
  };
  return go(start);
}
