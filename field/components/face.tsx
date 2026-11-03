import type { Given, Space } from "../../src/interface/component.ts";
import { h } from "./jsx.ts";
import { faceOf } from "./prose.ts";
import { Card } from "./way.tsx";

// A brief seen from above: its number, its title and its first paragraph,
// which is its face, and how many briefs stand beneath it. Pressing it
// places the reader there.

export const style = `
.face-card h2 {
  font-size: var(--heading);
  line-height: var(--leading-tight);
  margin: 0 0 0.35em;
  font-weight: 600;
}

.face-card h2 .number {
  color: var(--quiet);
  font-weight: 400;
  margin-right: 0.45em;
}

.face-card p {
  margin: 0;
  color: var(--quiet);
  font-size: var(--aside);
  line-height: var(--leading-close);
}
`;

export default function draw(given: Given, space: Space) {
  const holon = given.holon!;
  const number = (given.with as { number?: string } | null)?.number;
  const first = faceOf(String(holon.body.prose ?? ""));
  const beneath = ((holon.body.parts ?? []) as unknown[]).length;

  return (
    <Card to={holon.id} space={space} class="face-card">
      <h2>
        {number && <span class="number">{number}</span>}
        {String(holon.body.title ?? "")}
      </h2>
      {first && <p html={first} />}
      {beneath > 0 && <span class="meta">{beneath} beneath</span>}
    </Card>
  );
}
