// A holon's identity: given when it is born, never changed. It is a ULID, ten
// characters of the moment of birth and sixteen of randomness in Crockford's
// base 32, so ids sort by birth and their last characters spread evenly.

export type Id = string;

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newId(time = Date.now(), random = crypto.getRandomValues(new Uint8Array(16))): Id {
  let stamp = "";
  for (let rest = time, i = 0; i < 10; i++, rest = Math.floor(rest / 32)) stamp = alphabet[rest % 32] + stamp;
  let tail = "";
  for (let i = 0; i < 16; i++) tail += alphabet[random[i]! % 32];
  return stamp + tail;
}

export function isId(value: unknown): value is Id {
  return typeof value === "string" && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}
