import { newId, type Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { Body } from "../store/objects.ts";
import type { HolonRead } from "../engine/engine.ts";
import type { Reading, Target } from "./component.ts";
import type { Connection } from "./connection.ts";

// Where the reader stands, kept in the field: the arrangement is a layout in
// the home, the reader's own copy of the entry once they first move, and
// every move is a commit to it, so its commits are the reader's history.

// A mount as a layout holds it: the holon it reads, or the field it
// projects, and, where it says so, the kind of slot it is and the component
// it calls.
export interface Mount {
  component?: { $ref: Id };
  kind?: { $ref: Id };
  reads?: { $ref: Id };
  projects?: "field";
}

// What a mount reads: the holon it names, or else the field it projects,
// which is also where a mount that names neither stands.
export const readingOf = (mount: Mount): Reading =>
  mount.reads ? { holon: mount.reads.$ref } : { field: true };

const mountOn = (to: Target): Mount => (to === "field" ? { projects: "field" } : { reads: { $ref: to } });

export async function arrangement(engine: Connection): Promise<HolonRead> {
  const id = ((await engine.read({ name: "arrangement" })) ??
    (await engine.read({ name: "entry" }))) as Id | null;
  const layout = id && (await engine.holon(id));
  if (!layout) throw new Error("the field has no entry to boot into");
  return layout;
}

export const mountsOf = (layout: HolonRead) => layout.body.mounts as unknown as Mount[];

// Placing a mount on a holon or at the field. A mount never stands on the
// arrangement that holds it; one already there that shows a face opens it
// in full; otherwise it moves, and calls whichever component is found for
// what it now reads. Whether the reader moved is the answer.
export async function place(engine: Connection, mount: number, to: Target): Promise<boolean> {
  const layout = await arrangement(engine);
  if (to === layout.id) return false;
  const mounts = mountsOf(layout);
  const here = mounts[mount] && readingOf(mounts[mount]);
  const there = readingOf(mountOn(to));
  if (JSON.stringify(here) === JSON.stringify(there)) {
    if (!mounts[mount]?.kind) return false;
    const { kind: _, ...full } = mounts[mount]!;
    await arrange(engine, layout, { ...layout.body, mounts: mounts.map((each, i) => (i === mount ? full : each)) as never });
    return true;
  }

  const moved = mounts.map((each, i) => (i === mount ? mountOn(to) : each));
  await arrange(engine, layout, { ...layout.body, mounts: moved as never });
  return true;
}

// A slot of the arrangement given another kind or another component, from
// its chrome; a change like any move, kept in the arrangement.
export async function restyle(
  engine: Connection,
  mount: number,
  change: { kind?: Id; component?: Id | null },
) {
  const layout = await arrangement(engine);
  const mounts = await Promise.all(
    mountsOf(layout).map(async (each, i) => {
      if (i !== mount) return each;
      const { component: named, kind: was, ...rest } = each;

      // What the slot named that is no longer in the field is let go.
      const stays = async (ref?: { $ref: Id }) => (ref && (await engine.holon(ref.$ref)) ? ref : undefined);
      const component =
        change.component === undefined ? await stays(named) : change.component ? { $ref: change.component } : undefined;
      const kind = change.kind ? { $ref: change.kind } : await stays(was);
      return { ...rest, ...(component ? { component } : {}), ...(kind ? { kind } : {}) };
    }),
  );
  await arrange(engine, layout, { ...layout.body, mounts: mounts as never });
}

// Walking back or forward to a commit of the home: the arrangement as it
// stood then is committed again, so history only ever grows. Before the
// reader's first move it stood as the entry.
export async function walk(engine: Connection, commit: Name | null) {
  const layout = await arrangement(engine);
  const then = commit && layout.store === "home" ? await engine.holon(layout.id, commit) : null;
  const entry = await engine.holon((await engine.read({ name: "entry" })) as Id);
  await arrange(engine, layout, (then ?? entry!).body);
}

async function arrange(engine: Connection, layout: HolonRead, body: Body) {
  const { from: _, ...arranged } = body;
  if (layout.store === "home") {
    await engine.commit({ holons: [{ id: layout.id, instance: layout.instance, body: arranged }] });
    return;
  }
  const id = newId();
  await engine.commit({
    holons: [{ id, instance: layout.instance, body: { ...arranged, title: "Arrangement" } }],
    names: { arrangement: id },
  });
}
