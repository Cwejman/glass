// The rules a change is judged by. A change comes here with its handles given ids and
// its residence known, beside what of the field it names, so judging reads no store.
// Each rule is a small pure function answering in words what is wrong, or nothing, and
// the change is held to them in order: the first wrong is the answer.

import { isDerived, isId, type Holon } from "../integrations/glass/store.ts";
import { bodyProblem, mouldProblem, references, type Mould } from "./moulds.ts";

export type Judged = {
  // The holons as they land, every handle given its id.
  holons: readonly Holon[];
  gone: readonly string[];
  // Each id the engine gave, with the handle it was given for.
  minted: ReadonlyMap<string, string>;
  // The stores that keep each holon of the change already, and each that goes.
  kept: ReadonlyMap<string, readonly string[]>;
  // The stores each holon lands in, and each that goes leaves.
  reaches: ReadonlyMap<string, readonly string[]>;
  readOnly: ReadonlySet<string>;
  // The holons of the field the change names, as types or references, and those of the
  // field that refer to what goes.
  named: ReadonlyMap<string, Holon>;
  referring: readonly Holon[];
};

type Rule = (change: Judged) => string | undefined;

// A holon as a refusal names it: by its name, or the handle it came under, or its id.
const said = ({ holons, minted }: Judged, id: string) =>
  holons.find((holon) => holon.id === id)?.name ?? minted.get(id) ?? id;

// The first of each holon's own problems, said with whose it is.
const eachHolon =
  (problem: (holon: Holon, change: Judged) => string | undefined): Rule =>
  (change) => {
    for (const holon of change.holons) {
      const wrong = problem(holon, change);
      if (wrong) return `${said(change, holon.id)}: ${wrong}`;
    }

    return undefined;
  };

// A holon as the change has it, or else as the field does.
const holonIn = ({ holons, named }: Judged, id: string) =>
  holons.find((holon) => holon.id === id) ?? named.get(id);

const noHolonTwice: Rule = ({ holons }) =>
  new Set(holons.map(({ id }) => id)).size === holons.length
    ? undefined
    : "one holon is changed twice in one commit";

const idsAreIds: Rule = ({ holons, gone }) => {
  const wrong = [...holons.map(({ id }) => id), ...gone].find((id) => !isId(id));
  return wrong === undefined ? undefined : `${wrong} is not an id`;
};

// The engine mints every id. A holon new to the field comes under a handle; an id no
// store keeps is one the engine gave, or one derived from what an integration reads.
const idsAreTheEngines: Rule = ({ holons, minted, kept }) => {
  const wrong = holons.find(({ id }) => !kept.has(id) && !minted.has(id) && !isDerived(id));
  return wrong
    ? `${wrong.id} is kept in no store, and the engine did not give it: a new holon comes under a handle, as ~1`
    : undefined;
};

const typedOrAType = eachHolon((holon) => {
  if (holon.mould) {
    const problem = mouldProblem(holon.mould);
    return problem ? `its mould: ${problem}` : undefined;
  }

  return holon.instance.length === 0 ? "it is an instance of nothing" : undefined;
});

const typesHaveMoulds = eachHolon((holon, change) => {
  const untyped = holon.instance.find((type) => !holonIn(change, type)?.mould);
  return untyped === undefined ? undefined : `${untyped} is not a type in the field`;
});

const bodyFits = eachHolon((holon, change) => {
  const moulds = holon.instance.map((type) => holonIn(change, type)!.mould as Mould);
  return moulds.length ? bodyProblem(holon.body, moulds) : undefined;
});

// A holon kept in a store only read cannot be changed there, and nothing new goes into one.
const readOnlyRefuses: Rule = (change) => {
  for (const [id, keys] of change.reaches) {
    const only = keys.filter((key) => change.readOnly.has(key)).join(" and ");
    if (!only) continue;

    const is = only.includes(" and ") ? "are" : "is";
    return change.minted.has(id)
      ? `${said(change, id)} cannot go into ${only}, which ${is} only read`
      : `${id} belongs to ${only}, which ${is} only read`;
  }

  return undefined;
};

const referencesResolve = eachHolon((holon, change) => {
  const lost = references(holon.body).find(({ id }) => !holonIn(change, id));
  return lost ? `it references ${lost.id}, which is not in the field` : undefined;
});

// What stays, as the change leaves it, refers to nothing that goes, by a reference or as
// an instance of it.
const nothingRefersToWhatGoes: Rule = ({ holons, gone, referring }) => {
  const going = new Set(gone);
  const landing = new Map(holons.map((holon) => [holon.id, holon]));
  const staying = [...referring.filter(({ id }) => !landing.has(id)), ...holons].filter(
    ({ id }) => !going.has(id),
  );

  for (const holon of staying) {
    const lost = [...references(holon.body).map(({ id }) => id), ...holon.instance].find((id) =>
      going.has(id),
    );
    if (lost) return `${holon.id} still refers to ${lost}, which would be gone`;
  }

  return undefined;
};

const rules: Rule[] = [
  noHolonTwice,
  idsAreIds,
  idsAreTheEngines,
  typedOrAType,
  typesHaveMoulds,
  bodyFits,
  readOnlyRefuses,
  referencesResolve,
  nothingRefersToWhatGoes,
];

// What is wrong with a change, if anything: the first rule it breaks.
export function judge(change: Judged): string | undefined {
  for (const rule of rules) {
    const problem = rule(change);
    if (problem) return problem;
  }

  return undefined;
}
