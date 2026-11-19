// The interface shipped in glass: its components and natives, steps and chain a pair,
// and the search bar as data, drawn, and walked back from a pill taken out to the text.

import { afterAll, describe, expect, test } from "bun:test";
import type { Engine, Read } from "../engine.ts";
import type { Value } from "../read/values.ts";
import { cleanUp, id, notes, shipped } from "./fixture.ts";
import { shipInterface } from "./interface.ts";

afterAll(cleanUp);

const held = ($ref: string) => ({ $ref, $holds: true });
const use = (handle: string, fn: string, args: unknown[]) => ({
  id: handle,
  instance: [id(2)],
  body: { fn: { $ref: fn }, args },
});

// What a text in the language gives, read into uses by the native parse.
async function asking(engine: Engine, text: string) {
  const parsed = await engine.read({ gives: held("~asked"), holons: [use("~asked", id(21), [text])] });
  if (!("value" in parsed)) throw new Error(parsed.problem);
  return {
    read: parsed.value as unknown as Read,
    answer: await engine.read(parsed.value as unknown as Read),
  };
}

const valueOf = async (engine: Engine, text: string) => {
  const { answer } = await asking(engine, text);
  if (!("value" in answer)) throw new Error(answer.problem);
  return answer.value;
};

type Drawing = { $draw: { $ref: string }; given: Value[]; at: string[] };

describe("the interface shipped", () => {
  test("its components and natives are written once", async () => {
    const { engine, stores } = await shipped();
    expect((await shipInterface(engine, stores)).commits).toEqual([]);

    expect(await valueOf(engine, 'get(@glass:components/Pill, "named")')).toBe(true);
    expect(await valueOf(engine, 'size(get(@glass:components/List, "input"))')).toBe(2);
    expect(await valueOf(engine, 'get(@glass:types/row, "says")')).toContain("Side by side");
  });

  test("steps and chain are a pair, and chain(steps(r)) says what r says", async () => {
    const { engine } = await shipped();
    const [steps, chain] = [
      await valueOf(engine, "@glass:functions/steps"),
      await valueOf(engine, "@glass:functions/chain"),
    ];
    expect(await valueOf(engine, 'get(@glass:functions/steps, "reverse")')).toEqual(chain);
    expect(await valueOf(engine, 'get(@glass:functions/chain, "reverse")')).toEqual(steps);

    const text = "1 | add(2) | add(3)";
    expect(await valueOf(engine, `map(steps(parse("${text}")), print)`)).toEqual(["1", "add(2)", "add(3)"]);
    expect(await valueOf(engine, `print(chain(steps(parse("${text}"))))`)).toBe("add(add(1, 2), 3)");
  });

  test("Search draws a text's steps as pills beside the input; one taken out is walked back to the text", async () => {
    const { engine } = await shipped();
    const { read, answer } = await asking(engine, 'Reader(get(@query, "text"))');
    if (!("value" in answer)) throw new Error(answer.problem);

    // Reader: a list of Search and Answer; Search: a list of the pills and the input.
    const reader = answer.value as Drawing;
    const search = (reader.given[0] as Drawing[])[0]!;
    const [pills, input] = search.given[0] as Drawing[];
    const pill = await valueOf(engine, "@glass:components/Pill");
    expect((pills!.given[0] as Drawing[]).map(({ $draw }) => $draw as Value)).toEqual([pill, pill, pill]);
    expect(input!.given).toEqual(["1 | add(2) | add(3)"]);

    // The second pill taken out: back proposes the text without it.
    const back = await valueOf(engine, "@glass:functions/back");
    const quote = await valueOf(engine, "@glass:functions/quote");
    const kept = (pills!.given[0] as Drawing[]).toSpliced(1, 1);
    const proposed = await engine.read({
      gives: held("~proposed"),
      holons: [
        ...(read.holons ?? []),
        use("~proposed", (back as { $ref: string }).$ref, [pills!.at, 0, held("~kept")]),
        use("~kept", (quote as { $ref: string }).$ref, [kept]),
      ],
    });
    expect(proposed).toMatchObject({
      value: { holons: [{ id: notes.query, body: { text: "add(1, 3)" } }] },
    });
  });
});
