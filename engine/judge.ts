// The rules a change is judged by. A change comes here landing, its handles given ids
// and where it resides known, beside what of the field it refers to, so judging reads
// no store. Each rule is a small pure function, independent of the others, giving the
// problems it finds as data: which rule, which holon, and what is wrong, said of it.

import { isDerived, isId, type Holon } from "../integrations/glass/store.ts";
import type { Landing } from "./act.ts";
import { isHandle } from "./handles.ts";
import { bodyProblem, mouldProblem, references, type Mould } from "./moulds.ts";

export type Problem = { rule: string; id?: string; says: string };

export type Judged = {
  landing: readonly Landing[];
  gone: readonly string[];
  // The stores keeping each id of the change now, and each that goes.
  kept: ReadonlyMap<string, readonly string[]>;
  readOnly: ReadonlySet<string>;
  // The holons of the field the change refers to, as types or by reference, and those
  // of the field that refer to what goes.
  referred: ReadonlyMap<string, Holon>;
  referring: readonly Holon[];
};

// The rules, in the order their problems are said.
const rules = {
  noHolonTwice,
  idsAreIds,
  refsAreIds,
  idsAreTheEngines,
  goneIsKept,
  typedOrAType,
  mouldsAreSound,
  typesHaveMoulds,
  bodyFits,
  readOnlyRefuses,
  referencesResolve,
  nothingRefersToWhatGoes,
};

// Every problem of a change, rule by rule.
export function judge(judged: Judged): Problem[] {
  const byId = new Map(judged.landing.map(({ holon }) => [holon.id, holon]));
  const seen: Seen = { ...judged, holonIn: (id) => byId.get(id) ?? judged.referred.get(id) };

  return Object.entries(rules).flatMap(([rule, find]) => find(seen).map((found) => ({ rule, ...found })));
}

// A change as a rule sees it: a holon found by id, in the change or else the field.
type Seen = Judged & { holonIn: (id: string) => Holon | undefined };

type Found = { id?: string; says: string };

// Each holon's problems, said of it.
function eachHolon(seen: Seen, problems: (landing: Landing) => (string | undefined)[]): Found[] {
  return seen.landing.flatMap((landing) =>
    problems(landing).flatMap((says) => (says ? [{ id: landing.holon.id, says }] : [])),
  );
}

// ---- The rules

function noHolonTwice({ landing }: Seen): Found[] {
  const once = new Set<string>();
  const twice = new Set<string>();
  for (const { holon } of landing) (once.has(holon.id) ? twice : once).add(holon.id);

  return [...twice].map((id) => ({ id, says: "it is changed twice in one commit" }));
}

function idsAreIds({ landing, gone }: Seen): Found[] {
  return [...landing.map(({ holon }) => holon.id), ...gone]
    .filter((id) => !isId(id))
    .map((id) => ({ id, says: "it is not an id" }));
}

function refsAreIds(seen: Seen) {
  return eachHolon(seen, ({ holon }) =>
    references(holon.body)
      .filter(({ id }) => !isId(id))
      .map(({ id }) =>
        isHandle(id)
          ? `the handle ${id} names nothing this commit brings into being`
          : `it refers to “${id}”, which is not an id`,
      ),
  );
}

// The engine mints every id. A holon new to the field comes under a handle; an id no
// store keeps is one the engine gave, or one derived from what an integration reads.
function idsAreTheEngines(seen: Seen) {
  return eachHolon(seen, ({ holon, handle, was }) => [
    handle === undefined && !was.length && isId(holon.id) && !isDerived(holon.id)
      ? "it is kept in no store, and the engine did not give it: a new holon comes under a handle, as ~1"
      : undefined,
  ]);
}

function goneIsKept({ gone, kept }: Seen): Found[] {
  return gone
    .filter((id) => isId(id) && !kept.has(id))
    .map((id) => ({ id, says: "it is kept in no store, so it cannot go" }));
}

function typedOrAType(seen: Seen) {
  return eachHolon(seen, ({ holon }) => [
    !holon.mould && !holon.instance.length ? "it is an instance of nothing" : undefined,
  ]);
}

function mouldsAreSound(seen: Seen) {
  return eachHolon(seen, ({ holon }) => {
    const problem = holon.mould && mouldProblem(holon.mould);
    return [problem ? `its mould: ${problem}` : undefined];
  });
}

function typesHaveMoulds(seen: Seen) {
  return eachHolon(seen, ({ holon }) =>
    holon.instance
      .filter((type) => !seen.holonIn(type)?.mould)
      .map((type) => `${type} is not a type in the field`),
  );
}

// A body is held against its types where every one of them is a type; where one is
// not, typesHaveMoulds says so.
function bodyFits(seen: Seen) {
  return eachHolon(seen, ({ holon }) => {
    const moulds = holon.instance.map((type) => seen.holonIn(type)?.mould as Mould | undefined);
    if (!moulds.length || moulds.some((mould) => !mould)) return [];

    return [bodyProblem(holon.body, moulds as Mould[])];
  });
}

// A holon kept in a store only read cannot be changed there, nothing new goes into one,
// and nothing is taken out of one.
function readOnlyRefuses({ landing, gone, kept, readOnly }: Seen): Found[] {
  const onlyRead = (keys: readonly string[]) => {
    const read = keys.filter((key) => readOnly.has(key));
    return read.length ? `${read.join(" and ")}, which ${read.length > 1 ? "are" : "is"} only read` : "";
  };
  const belongs = (keys: readonly string[]) => onlyRead(keys) && `it belongs to ${onlyRead(keys)}`;

  return [
    ...landing.map(({ holon, was, stores }) => ({
      id: holon.id,
      says: was.length ? belongs(was) : onlyRead(stores) && `it cannot go into ${onlyRead(stores)}`,
    })),
    ...gone.map((id) => ({ id, says: belongs(kept.get(id) ?? []) })),
  ].filter(({ says }) => says);
}

function referencesResolve(seen: Seen) {
  return eachHolon(seen, ({ holon }) =>
    references(holon.body)
      .filter(({ id }) => isId(id) && !seen.holonIn(id))
      .map(({ id }) => `it references ${id}, which is not in the field`),
  );
}

// What stays, as the change leaves it, refers to nothing that goes, by a reference or
// as an instance of it.
function nothingRefersToWhatGoes({ landing, gone, referring }: Seen): Found[] {
  const going = new Set(gone);
  const changed = new Set(landing.map(({ holon }) => holon.id));
  const staying = [...referring.filter(({ id }) => !changed.has(id)), ...landing.map(({ holon }) => holon)];

  return staying
    .filter(({ id }) => !going.has(id))
    .flatMap((holon) => {
      const lost = [...references(holon.body).map(({ id }) => id), ...holon.instance].find((id) =>
        going.has(id),
      );
      return lost ? [{ id: holon.id, says: `it still refers to ${lost}, which would be gone` }] : [];
    });
}
