import type { HolonRead } from "../engine/compat.ts";
import type { Given, Space } from "../interface/component.ts";
import { h } from "./jsx.ts";
import { block, refsOf } from "./prose.tsx";

// A session, read as it was had: when, how much of it was kept, then what was said in
// order, each utterance by its place, how it came and whose voice, in its own words,
// and last the paths it noted, each with where it stands. Seen from above, its name,
// its day and how many utterances it keeps.

export const declared = {
  name: "Session",
  says: "A session read as it was had: its day and what was kept of it, what was said in order, each utterance in its own words by whose voice, and the paths it noted.",
  takes: ["session"],
  kinds: ["full", "face"],
  reads: ["whole", "holon"],
};

export const style = `
.session .said {
  display: grid;
  gap: calc(var(--gap) * 1.5);
  margin-top: var(--gap);
}

.session .utterance header {
  font: var(--small) / var(--leading-close) var(--mono);
  color: var(--quiet);
  margin-bottom: 0.4em;
}

.session .utterance.answer {
  padding-left: var(--gap);
  border-left: 2px solid var(--line);
  color: var(--quiet);
}

.session .path h3 {
  margin-bottom: 0.2em;
}

.session .path .stands {
  font: var(--small) / var(--leading-close) var(--mono);
  color: var(--quiet);
}
`;

export default async function draw(given: Given, space: Space) {
  const session = given.holon!;
  const said = refsOf(session.body.said);

  if (given.kind === "face") {
    return (
      <div class="card">
        <strong>{session.name}</strong>
        <span class="meta">
          {[session.body.on, `${said.length} ${said.length === 1 ? "utterance" : "utterances"}`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
    );
  }

  const { holons } = await space.read({ whole: session.id });
  const voices = new Map<string, HolonRead | null>();
  const voiceOf = async (id: string) => {
    if (!voices.has(id)) voices.set(id, holons[id] ?? (await space.holon(id)));
    return voices.get(id);
  };

  const utterances = await Promise.all(
    said.map(async (id) => {
      const utterance = holons[id];
      if (!utterance) return null;

      const { order, as, flow, voice } = utterance.body;
      const speaker = voice ? await voiceOf(voice.$ref) : null;
      const answered = as === "answered by the session";

      return (
        <section class={`utterance${answered ? " answer" : ""}`} data-location={JSON.stringify([id])}>
          <header>
            {[`${order}.`, answered ? "answered" : as, speaker?.name].filter(Boolean).join(" · ")}
          </header>
          {refsOf(flow).map((part) => block(holons, part))}
        </section>
      );
    }),
  );

  const paths = refsOf(session.body.paths).flatMap((id) => {
    const path = holons[id];
    if (!path) return [];

    return [
      <section class="path" data-location={JSON.stringify([id])}>
        <h3>{path.name}</h3>
        <span class="stands">{path.body.stands}</span>
        <p>{path.body.opens}</p>
      </section>,
    ];
  });

  return (
    <article class="place reader session">
      <h1>{session.name}</h1>
      <p class="meta">{session.body.on}</p>
      {session.body.kept && <p class="quiet">{session.body.kept}</p>}

      <h2>What was said</h2>
      <div class="said">{utterances}</div>

      {paths.length > 0 && [<h2>The paths it noted</h2>, ...paths]}
    </article>
  );
}
