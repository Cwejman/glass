import { newId, type Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { Body } from "../store/objects.ts";
import type { HolonRead } from "../engine/engine.ts";
import type { Connection } from "./connection.ts";

// Where the reader stands, kept in the field: the arrangement is a layout in
// the home, the reader's own copy of the entry once they first move, and
// every move is a commit to it, so its commits are the reader's history.

export interface Mount {
  component: { $ref: Id };
  reads: { $ref: Id };
}

export async function arrangement(engine: Connection): Promise<HolonRead> {
  const id = ((await engine.read({ name: "arrangement" })) ?? (await engine.read({ name: "entry" }))) as Id | null;
  const layout = id && (await engine.holon(id));
  if (!layout) throw new Error("the field has no entry to boot into");
  return layout;
}

export const mountsOf = (layout: HolonRead) => layout.body.mounts as unknown as Mount[];

// Placing a mount on another holon, if it does not already read it. Whether
// the reader moved is the answer.
export async function place(engine: Connection, mount: number, id: Id): Promise<boolean> {
  const layout = await arrangement(engine);
  const mounts = mountsOf(layout);
  if (mounts[mount]?.reads.$ref === id) return false;
  await arrange(engine, layout, { ...layout.body, mounts: mounts.map((each, i) => (i === mount ? { ...each, reads: { $ref: id } } : each)) as never });
  return true;
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
  await engine.commit({ holons: [{ id, instance: layout.instance, body: { ...arranged, title: "Arrangement" } }], names: { arrangement: id } });
}
