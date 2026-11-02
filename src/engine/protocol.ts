import type { Json } from "../store/canonical.ts";
import type { Change, Read } from "./engine.ts";

// The one protocol: everything that speaks to the engine sends these, and
// nothing that speaks to it depends on how it is built. Run, await and cancel
// join them when programs are built; until then they are not offered.

export type Request =
  | { op: "attach"; key: string; url: string }
  | { op: "read"; read: Read }
  | { op: "commit"; change: Change }
  | { op: "subscribe"; read: Read }
  | { op: "unsubscribe"; subscription: number };

export type Message = { id: number } & Request;

export type Reply =
  | { id: number; ok: true; value: Json }
  | { id: number; ok: false; error: string }
  | { subscription: number; value: Json };
