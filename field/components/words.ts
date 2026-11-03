import type { Expression } from "../../src/engine/engine.ts";

// What a way of looking gathers, said in words, each holon it names by its
// title, as `titleOf` gives it, or else by its id.
export async function words(
  expression: Expression,
  titleOf: (id: string) => Promise<string>,
): Promise<string> {
  // A holon that cannot be read here is said by its id.
  const named = (given: string | { $ref: string }) => {
    const id = typeof given === "string" ? given : given.$ref;
    return titleOf(id).catch(() => id);
  };
  if ("instances" in expression) return `the instances of ${await named(expression.instances)}`;
  if ("types" in expression) return "every type";
  if ("pointing" in expression) return `what points at ${await named(expression.pointing)}`;
  if ("named" in expression) return "every holon a store names";
  const parts = await Promise.all(
    ("all" in expression ? expression.all : expression.any).map((inner) => words(inner, titleOf)),
  );
  return parts.join("all" in expression ? " which are also " : ", or ");
}
