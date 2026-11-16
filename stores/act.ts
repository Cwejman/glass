// What an act is, the same in every store it touches and for every kind of store: its
// parts, written the one way, and its content hash. The engine makes both before it offers
// the act; each store checks its own part and the hash before taking it.
//
// A part is the holons one store keeps of an act, one line of canonical JSON (RFC 8785)
// each, in the order of their ids, joined by newlines. It says nothing of the versions
// before, which differ from store to store, so a part follows from the act alone.
//
// The content hash is the SHA-256 of the canonical JSON of {when, says, by, at, gone,
// parts}: what happened, what its maker had read, every store's share of it by hash, and
// nothing of where it stands in any store's history.

import { canonical } from "../integrations/glass/canonical.ts";
import type { Act, Holon } from "./store.ts";

const encoder = new TextEncoder();

// Holons in the order a part holds them, by id.
export const byId = (a: Holon, b: Holon) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// A holon's line in a part.
export const lineOf = (holon: Holon) => canonical(holon);

// A part's bytes, or null where a store keeps none of the act's holons.
export function partOf(holons: Holon[]): Uint8Array | null {
  return holons.length ? encoder.encode([...holons].sort(byId).map(lineOf).join("\n")) : null;
}

// What an act says, which its content hash is the hash of.
export function contentOf({
  when,
  says,
  by,
  at,
  gone,
  parts,
}: Pick<Act, "when" | "says" | "by" | "at" | "gone" | "parts">) {
  return canonical({ when, says, by, at, gone, parts });
}

// The hex SHA-256 of bytes or text.
export async function hashOf(content: Uint8Array | string): Promise<string> {
  const bytes = typeof content === "string" ? encoder.encode(content) : content;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
