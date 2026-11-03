import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { declarations, declared } from "./declare.ts";

test("the bodies the components draw with are declared as the types now stand", async () => {
  expect(await readFile(declared, "utf8")).toBe(await declarations());
});
