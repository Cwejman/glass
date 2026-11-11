import type { HolonRead } from "../engine/reads.ts";
import type { Given, Space } from "../interface/component.ts";
import { print, type Names } from "../language/text.ts";
import { h } from "./jsx.ts";

// A function: what it says, what it takes, and how it gives, natively or by what it is
// written as, said in the language as one would write it. Seen from above, its name,
// what it takes, and what it says.

export const declared = {
  name: "Function",
  says: "A function: what it says and takes, and how it gives, natively or written in the language, said as one would write it.",
  takes: ["function"],
  kinds: ["full", "face"],
  reads: ["holon"],
};

export const style = `
.function .signature {
  font: var(--small) / var(--leading-close) var(--mono);
  color: var(--quiet);
}

.function pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
`;

export default async function draw(given: Given, space: Space) {
  const fn = given.holon!;
  const {
    says,
    takes = [],
    native,
    gives,
  } = fn.body as {
    says?: string;
    takes?: string[];
    native?: string;
    gives?: unknown;
  };
  const signature = `${fn.name}(${takes.join(", ")})`;

  if (given.kind === "face") {
    return (
      <div class="card">
        <strong>{signature}</strong>
        <span class="meta">{says}</span>
      </div>
    );
  }

  return (
    <article class="place function">
      <h1>{fn.name}</h1>
      <p class="signature">{signature}</p>
      {says && <p>{says}</p>}
      {native ? (
        <p class="quiet">Native: worked out by the engine's kernel, as {native}.</p>
      ) : gives !== undefined ? (
        [<h2>Written as</h2>, <pre>{await said(gives, space)}</pre>]
      ) : null}
    </article>
  );
}

// What a function gives, said in the language: the functions it calls by their names.
async function said(gives: unknown, space: Space) {
  const ids = new Set<string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (typeof value === "object" && value !== null) {
      const ref = (value as { $ref?: unknown }).$ref;
      if (typeof ref === "string") ids.add(ref);
      Object.values(value).forEach(collect);
    }
  };
  collect(gives);

  const holons = new Map<string, HolonRead>();
  for (const id of ids) {
    const holon = await space.holon(id).catch(() => null);
    if (holon) holons.set(id, holon);
  }

  const functions = [...holons.values()].filter((holon) => holon.types.includes("function"));
  const names: Names = {
    functions: (name) => functions.filter((holon) => holon.name === name).map(({ id }) => id),
    holons: () => [],
    isFunction: (id) => functions.some((holon) => holon.id === id),
    nameOf: (id) => holons.get(id)?.name,
  };

  try {
    return print(gives as never, names);
  } catch {
    return JSON.stringify(gives, null, 2);
  }
}
