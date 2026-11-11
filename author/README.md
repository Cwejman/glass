# The author's

What the author has said and explored, and the tools that write it into the main store, each through the engine here, `engine/local.ts`, which judges what they write against its types as it judges any commit. Run them from the repository root; the store's format is `integrations/glass/vectors/README.md`, and reading is done through the same engine, `bun engine/ask.ts`, as the root README says.

- `session.ts`: adds a session as one commit: its voice, its utterances, the paths it noted and those it let go.
- `append.ts`: adds one utterance to a session already kept, with any paths it notes.
- `rewrite.ts`: rewrites briefs of the wiki as one commit, each keeping its id and its history; it also places, moves, mounts and lets go of briefs.
- `prose.ts`: the prose writer the others share, marked text into paragraphs, sentences and words.

Beside them stand two stores of the author's exploring: `paper/`, a paper on holonic systems as published with its licence, and as holons one to one, and `paper-readings/`, the readings built upon it. Each keeps its store in its own `.glass/`.

For now the main store, at the repository's root, holds the author's words and the sessions beside the wiki; they come here when a store can be cut with its history whole.
