# Tools for the paper's branches

These scripts read the paper into holons and draw branches over it. Everything they write is local, by the paper's licence (see `store/paper/licence.json`).

1. `python3 -I src/tools/paper/clean.py <pdftotext output> paper.json` cleans the text into sections of paragraphs.
2. `bun src/tools/paper/base.ts "$PWD" paper.json store/paper` writes `base.json`, `reading.txt` and `keys.json`.
3. Each reader gets the brief in `brief.md` and writes its raw branch. The raw branches are kept in `readings/raw/`.
4. `bun src/tools/paper/branches.ts "$PWD" store/paper store/paper/readings/raw` turns raw branches into holons (ids kept for branches already born) and prints the digest.
