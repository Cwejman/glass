// The rules a change is judged by. A change comes here landing, its handles given ids
// and where it resides known, beside what of the field it refers to (known.ts), so the
// rules read no store. Each rule is a small pure function, independent of the others, giving the
// problems it finds as data: which rule, which holon, and what is wrong, said of it.

import { isDerived, isId } from "../../../integrations/glass/store.ts";
import type { Holon, Problem } from "../../../stores/store.ts";
import { bodyProblem, isRef, mouldProblem, references, type Mould } from "../../moulds.ts";
import {
  fits,
  inputOf,
  kindsAmong,
  knownAs,
  matched,
  placeAs,
  type Kinds,
  type Known,
  type Matched,
  type Place,
} from "../read/input.ts";
import { isHandle } from "./change.ts";
import type { Landing } from "./plan.ts";

export type Judged = {
  landing: readonly Landing[];
  gone: readonly string[];
  // The stores keeping each id of the change now, and each that goes.
  kept: ReadonlyMap<string, readonly string[]>;
  readOnly: ReadonlySet<string>;
  // The types each store admits, where its shape names any.
  admits: ReadonlyMap<string, ReadonlySet<string>>;
  // The holons of the field the change refers to, as types or by reference, and what
  // judging its uses reads; those of the field holding what it writes; and those that
  // refer to what goes.
  referred: ReadonlyMap<string, Holon>;
  // The kinds of value a placeholder may take, as the field has them.
  kinds: Kinds;
  holding: readonly Holon[];
  referring: readonly Holon[];
};

// The rules, in the order their problems are said.
const rules = {
  noHolonTwice,
  idsAreIds,
  refsAreIds,
  idsAreTheEngines,
  goneIsKept,
  mouldsAreSound,
  typesHaveMoulds,
  bodyFits,
  placeholdersAreHoles,
  optionalOnlyInInput,
  argsFitInput,
  readOnlyRefuses,
  storesAdmit,
  referencesResolve,
  nothingRefersToWhatGoes,
};

// Every problem of a change, rule by rule.
export function judge(judged: Judged): Problem[] {
  const byId = new Map(judged.landing.map(({ holon }) => [holon.id, holon]));
  const holonIn = (id: string) => byId.get(id) ?? judged.referred.get(id);
  const holders = [...byId.values(), ...judged.holding.filter(({ id }) => !byId.has(id))];
  const holes = holders.flatMap(({ body }) =>
    references(body).flatMap(({ id, key, holds }) => (key === "input" && holds ? [id] : [])),
  );
  const known = (id: string) => {
    const holon = holonIn(id);
    return holon
      ? knownAs(
          holon,
          holon.instance.flatMap((type) => holonIn(type) ?? []),
        )
      : null;
  };
  // The kinds of the field, and those the change ships.
  const kinds = new Map([...judged.kinds, ...kindsAmong(byId.values())]);
  const seen: Seen = { ...judged, kinds, holonIn, known, holes: new Set(holes) };

  return Object.entries(rules).flatMap(([rule, find]) => find(seen).map((found) => ({ rule, ...found })));
}

// A change as a rule sees it: a holon found by id, in the change or else the field, and
// with its types; and the placeholders, those held at input, as the change leaves them.
type Seen = Judged & {
  holonIn: (id: string) => Holon | undefined;
  known: (id: string) => Known | null;
  holes: ReadonlySet<string>;
};

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
// not, typesHaveMoulds says so. A placeholder is not: it is a hole of its types.
function bodyFits(seen: Seen) {
  return eachHolon(seen, ({ holon }) => {
    if (seen.holes.has(holon.id)) return [];

    const moulds = holon.instance.map((type) => seen.holonIn(type)?.mould as Mould | undefined);
    if (!moulds.length || moulds.some((mould) => !mould)) return [];

    return [bodyProblem(holon.body, moulds as Mould[])];
  });
}

// A placeholder stands for what its function is given, so it holds nothing of its own.
function placeholdersAreHoles(seen: Seen) {
  return eachHolon(seen, ({ holon }) => [
    seen.holes.has(holon.id) && Object.keys(holon.body).length
      ? "it is a placeholder, a hole of its type, so its body is empty"
      : undefined,
  ]);
}

// A function may be given nothing for a placeholder its input marks $optional, so the
// mark stands only on an entry of the list at input.
function optionalOnlyInInput(seen: Seen) {
  return eachHolon(seen, ({ holon }) => {
    const input = holon.body.input;
    const marked = Array.isArray(input)
      ? input.filter((entry) => isRef(entry) && entry.$optional === true)
      : [];
    const optional = references(holon.body).filter(({ optional }) => optional);

    return [
      optional.length > marked.length ? "$optional stands only on an entry of the list at input" : undefined,
    ];
  });
}

// A use fits the function it applies: it is a function, given no fewer args than its
// input requires and no more than it has placeholders, each fitting the type of the one
// it is matched to as a read binds them. A function declaring no input takes any args;
// a use naming no fn is found one by what shows it. What a use gives, and a placeholder
// of the kind value or holon, is known only as it is read, so fits anything.
function argsFitInput(seen: Seen) {
  const { known, kinds } = seen;
  const kindOf = (type: Holon) => kinds.get(type.id);
  const unread = (found: Known) =>
    found.use || found.types.some((type) => ["value", "holon"].includes(kindOf(type)!));

  const fit = (place: Place, arg: unknown) => {
    const found = isRef(arg) ? known(arg.$ref) : null;
    if (isRef(arg) && (!found || unread(found))) return true;
    // A placeholder of another kind stands for a value of that kind.
    if (found?.types.some(kindOf))
      return (
        !place.types.length ||
        place.types.some((type) => kindOf(type) === "value" || found.types.some(({ id }) => id === type.id))
      );

    return fits(place.types, { written: arg, value: () => arg as never }, known, kinds) as boolean;
  };

  return eachHolon(seen, ({ holon }) => {
    const { fn, args: written } = holon.body;
    const applying = known(holon.id)!.use && isRef(fn) ? known(fn.$ref) : null;
    if (!applying || unread(applying)) return [];

    const name = said(applying);
    if (!applying.applicable) return [`it applies ${name}, which is not a function`];

    const input = inputOf(applying.holon)?.map((link) => {
      const place = known(link.$ref);
      return place && placeAs(link, place);
    });
    if (!input || input.some((place) => !place)) return [];

    const places = input as Place[];
    const args = Array.isArray(written) ? written : [];
    const required = places.filter(({ optional }) => !optional).length;
    if (args.length < required)
      return [`it gives ${name} ${counted(args.length)}, and ${name} takes at least ${required}`];
    if (args.length > places.length)
      return [`it gives ${name} ${counted(args.length)}, and ${name} takes at most ${places.length}`];

    const { taking, taken } = matched(places, args, fit) as Matched;
    return [
      ...places.map((place, i) => {
        const at = taking[i];
        const placeName = said(known(place.id)!);
        if (at === undefined) return place.optional ? undefined : `it gives ${name} nothing for ${placeName}`;
        if (place.optional || fit(place, args[at])) return undefined;

        const types = place.types.map((type) => type.name ?? type.id).join(" or ");
        return `it gives ${name} ${shown(args[at])} for ${placeName}, which takes ${article(types)} ${types}`;
      }),
      taken < args.length
        ? `it gives ${name} ${shown(args[taken])}, which no placeholder is left to take`
        : undefined,
    ];
  });

  function shown(arg: unknown) {
    const found = isRef(arg) && known(arg.$ref);
    return found ? `@${said(found)}` : JSON.stringify(arg).slice(0, 60);
  }
}

const said = ({ holon }: Known) => holon.name ?? holon.id;
const counted = (n: number) => (n === 1 ? "1 arg" : `${n} args`);
const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

// A holon kept in a store only read cannot be changed there, nothing new goes into one,
// and nothing is taken out of one.
// A store whose shape names the types it admits takes no holon of another type.
function storesAdmit({ landing, admits }: Seen): Found[] {
  return landing.flatMap(({ holon, stores }) =>
    stores.flatMap((key) => {
      const admitted = admits.get(key);
      const other = admitted && holon.instance.find((type) => !admitted.has(type));
      return other
        ? [{ id: holon.id, says: `${key} admits only the types its shape names, and not ${other}` }]
        : [];
    }),
  );
}

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
