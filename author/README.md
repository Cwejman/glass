# The author's

What the author has said and explored, kept in this folder's store, `.glass/`, the author's: the author's voice, As it was said, the sessions, the measures, and the statistics and their board. Beside it, the wiki, at `wiki/`, holds Knowledge, the threads raised, and the wiki as it stood.

The tools here write the author's words into those two stores, each change committed through the engine here, as `stores.ts` gives it (`field.ts`), which judges what they write against its types as it judges any commit. Run them from the repository root; reading is done through the same engine, `bun engine/ask.ts`, as the root README says.

- `session.ts`: adds a session as one commit: its voice, its utterances, the paths it noted and those it let go.
- `append.ts`: adds one utterance to a session already kept, with any paths it notes.
- `thread.ts`: raises threads, and moves where they stand.
- `rewrite.ts`: rewrites briefs of the wiki as one commit, each keeping its id and its history; it also places, moves, mounts and lets go of briefs.
- `prose.ts`: the prose writer the others share, marked text into paragraphs, sentences and words, of glass's prose types.

Beside them stand two stores of the author's exploring: `paper/`, a paper on holonic systems as published with its licence, and as holons one to one, and `paper-readings/`, the readings built upon it. Each keeps its store in its own `.glass/`.
