// What is wrong with something, said in words, or nothing. Checks are asked
// in order and the first that finds something answers; the rest are never
// asked.

export type Problem = string | undefined;

export const first = (...checks: (() => Problem)[]): Problem =>
  checks.reduce<Problem>((found, check) => found ?? check(), undefined);

export const firstOf = <T>(items: Iterable<T>, check: (item: T) => Problem): Problem =>
  [...items].reduce<Problem>((found, item) => found ?? check(item), undefined);

export const firstAsync = (...checks: (() => Problem | Promise<Problem>)[]): Promise<Problem> =>
  checks.reduce<Promise<Problem>>(async (found, check) => (await found) ?? check(), Promise.resolve(undefined));

export const firstOfAsync = <T>(items: Iterable<T>, check: (item: T) => Problem | Promise<Problem>): Promise<Problem> =>
  [...items].reduce<Promise<Problem>>(async (found, item) => (await found) ?? check(item), Promise.resolve(undefined));
