# Tools for the paper's branches

These scripts read the paper into holons and draw branches over it. Everything they write is local, by the paper's licence (see `../licence.json`).

1. `python3 -I clean.py <pdftotext output> paper.json` cleans the text into sections of paragraphs.
2. `bun base.ts "$PWD" paper.json references/s44230-026-00140-x` writes `branches/base.json`, `reading.txt` and `keys.json`.
3. Each reader gets the brief in `brief.md` and writes its raw branch. The raw branches are kept in `branches/raw/`.
4. `bun branches.ts "$PWD" references/s44230-026-00140-x references/s44230-026-00140-x/branches/raw` turns raw branches into holons (ids kept for branches already born) and prints the digest.
