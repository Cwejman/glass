// An id is nine characters of a commit's moment and six of a count. The count starts at
// a chance place in each commit and only goes up, so a commit's new holons are its first
// id and how many, and their ids sort as they sit. A holon's name is another thing: what
// it is called, beside its id.
//
// An id derived from what an integration reads, not minted, has the top bit set, which no
// moment glass mints reaches before the year 2527.

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encode(n: number, width: number) {
  let text = "";

  for (let i = 0; i < width; i++) {
    text = alphabet[n % 32] + text;
    n = Math.floor(n / 32);
  }

  return text;
}

const decode = (text: string) => [...text].reduce((n, char) => n * 32 + alphabet.indexOf(char), 0);

export const idAt = (ms: number, count = 0) => encode(ms, 9) + encode(count, 6);

export const nextId = (id: string) => id.slice(0, 9) + encode(decode(id.slice(9)) + 1, 6);

export const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9A-HJKMNP-TV-Z]{15}$/.test(value);

const valueOf = (id: string) => [...id].reduce((n, char) => n * 32n + BigInt(alphabet.indexOf(char)), 0n);

export const isDerived = (id: string) => isId(id) && valueOf(id) >> 74n === 1n;
