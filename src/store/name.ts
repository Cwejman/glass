import { canonical } from "./canonical.ts";

// An object is named by the SHA-256 of its canonical text. The prefix says how
// the name was made, so the hash can change one day without names becoming
// ambiguous.

export type Name = `sha256-${string}`;

export async function nameOfText(text: string): Promise<Name> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256-${hex}`;
}

export async function nameOf(value: unknown): Promise<Name> {
  return nameOfText(canonical(value));
}

export function isName(value: unknown): value is Name {
  return typeof value === "string" && /^sha256-[0-9a-f]{64}$/.test(value);
}
