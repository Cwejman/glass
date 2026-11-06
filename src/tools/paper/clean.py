"""Cleans pdftotext output of the paper into sections of paragraphs, as JSON.

Usage: python3 -I clean.py paper.txt out.json
Sections: the abstract, then each numbered heading up to the end of the conclusion.
Figures and the table become blocks of their own kind, kept as their caption.
"""
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
lines = open(src, encoding="utf-8").read().split("\n")

HEAD = re.compile(r"^(\d+(?:\.\d+)*)\s+(\S.*)$")
# Headings found by reading the text; a heading may run onto a second line.
heading_lines = [59,127,128,170,198,240,268,315,394,422,440,454,472,482,507,519,527,553,566,576,597,608,619,645,659,668,689,699,892,924,967,1047,1143,1177,1260,1293,1340,1348,1362,1390,1471,1526,1561]
JUNK = re.compile(r"^(Vol\.:\(0123456789\)|Human-Centric Intelligent Systems|\d{1,3}|Page \d+ of \d+|\(\d{4}\) \d+:\d+.*)$")

start_abstract = next(i for i, l in enumerate(lines) if l.strip() == "Abstract")
end_body = next(i for i, l in enumerate(lines) if l.startswith("Author Contributions"))
skip = set()
# The affiliations block set in the middle of the introduction.
a = next(i for i, l in enumerate(lines) if l.startswith("* Leonardo Daou"))
b = next(i for i, l in enumerate(lines) if l.strip() == "University of Ottawa, Ottawa, ON, Canada")
skip.update(range(a, b + 1))
# The table: from its caption to the next heading after it.
t = next(i for i, l in enumerate(lines) if l.startswith("Table 1"))
skip.update(range(t + 1, 891))

sections, figures = [], []
cur = {"number": "", "title": "Abstract", "level": 1, "lines": []}
i = start_abstract + 1
keywords = None
while i < end_body:
    n = i + 1  # 1-based
    l = lines[i].rstrip()
    s = l.strip()
    if i in skip:
        i += 1; continue
    if n in heading_lines:
        m = HEAD.match(s)
        num, title = m.group(1), m.group(2)
        nxt = lines[i + 1].strip()
        if nxt and len(nxt) < 40 and not nxt.endswith(".") and (i + 2) not in heading_lines and not HEAD.match(nxt) and nxt[0].isupper() and len(s) > 35:
            title += " " + nxt; skip.add(i + 1)
        sections.append(cur)
        cur = {"number": num, "title": title.replace("‑", "-"), "level": num.count(".") + 1, "lines": []}
        i += 1; continue
    if s.startswith("Keywords"):
        keywords = s[len("Keywords"):].strip()
        while not lines[i + 1].strip().startswith("1 Introduction") and lines[i + 1].strip():
            i += 1; keywords += " " + lines[i].strip()
        i += 1; continue
    if re.match(r"^(Fig\.|Table) \d+\s\s", s):
        cap = s
        while lines[i + 1].strip() and not lines[i + 1].strip()[0].isupper() and len(lines[i + 1].strip()) < 60:
            i += 1; cap += " " + lines[i].strip()
        cur["lines"].append({"figure": re.sub(r"\s+", " ", cap)})
        i += 1; continue
    if not s or JUNK.match(s):
        cur["lines"].append(None)
        i += 1; continue
    cur["lines"].append(s)
    i += 1
sections.append(cur)

def paragraphs(seq):
    """Join wrapped lines; a short line ending a sentence ends a paragraph."""
    widths = sorted(len(x) for x in seq if isinstance(x, str))
    wide = widths[int(len(widths) * 0.5)] if widths else 60
    out, buf = [], []
    def flush():
        if buf:
            text = ""
            for part in buf:
                if text.endswith("-") and not text.endswith(" -") and part[:1].islower():
                    text = text[:-1] + part
                else:
                    text = (text + " " + part).strip()
            out.append({"text": text})
            buf.clear()
    for x in seq:
        if x is None:
            continue
        if isinstance(x, dict):
            flush(); out.append(x); continue
        buf.append(x)
        if re.search(r"[.:?]$", x) and len(x) < wide * 0.8:
            flush()
    flush()
    return out

# One heading runs onto a second line the heuristic misses; mend it by hand.
for s_ in sections:
    if s_["number"] == "5.3" and s_["title"].endswith("Connecting"):
        s_["title"] += " the Holons Together"
        first = next(x for x in s_["lines"] if isinstance(x, str))
        i_ = s_["lines"].index(first)
        if first.startswith("the Holons Together"):
            s_["lines"][i_] = first[len("the Holons Together"):].strip()
            if not s_["lines"][i_]: s_["lines"].pop(i_)

doc = {
    "title": "Advancing Holonic Systems in the Era of Artificial Intelligence and Digital Twins for Trustworthy and Effective Human-Centric Intelligent Systems",
    "authors": ["Leonardo Daou", "Tuncer Ören", "Eva Petitdemange", "Gregory Zacharewicz", "Nicolas Daclin", "Severine Durieux"],
    "published": "Human-Centric Intelligent Systems, 2026, 6, pp. 163-185",
    "doi": "10.1007/s44230-026-00140-x",
    "source": "https://hal.science/hal-05549178v1/file/s44230-026-00140-x.pdf",
    "licence": "CC BY-NC-ND 4.0",
    "keywords": keywords,
    "sections": [{"number": s["number"], "title": s["title"], "level": s["level"], "flow": paragraphs(s["lines"])} for s in sections if s["lines"] or s["number"]],
}
json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(doc["sections"]), "sections;", sum(len(s["flow"]) for s in doc["sections"]), "blocks;", sum(len(p.get("text", "").split()) for s in doc["sections"] for p in s["flow"]), "words")
