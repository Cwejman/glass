---
under: the rule
kind: brief
---

# Knowledge in the store

The first thing glass's store holds is knowledge, starting with this wiki, so the first thing glass must do well is present it: along the gradient, the biggest understanding first and the rest beneath, never flat. The rule already says what knowledge is made of, and glass takes it as it stands.

*The author's, 2026-11-01: knowledge has to be presented, not in a flat manner, but along the gradient.*

## 1. The rule's knowledge, held as holons

Under [the rule](https://github.com/Cwejman/the-rule/blob/main/rule.md#3-what-knowledge-is-made-of) a brief is one piece of prose giving one understanding, and a brief with everything beneath it is a holon, so in the store a brief is a holon.

What stands beneath it is ordered, each brief standing on those before it. Links are its free relations, and in the store a link points at a holon's identity, so it survives the holon moving. Some briefs keep their parts by time rather than by importance, like the author's words kept by day, and say so; the rule calls such a file a record, and glass reads it as a brief kept by time, its parts not numbered. Time-ordered knowledge is in time better held as typed holons with their time as a value, gathered and ordered by expression, as the relations say.

*Carried from the rule and its practice; the link by identity the session's, 2026-11-01.*

### 1.1 A brief may be a dimension

Some wholes carry an ontological weight that what stands beneath them shares: a domain, the workflows of an application, an audience. Such a brief says so in its own body, with a look of its own, an icon and a colour, and everything it holds, and everything beneath that, shows the look of each such whole above it, so a reader sees what a holon belongs to. A brief that does not say it is only a whole.

This is the brief's schema, not the substrate's: the substrate gives holding, and reads belonging upward through it, and the Brief type says what it is for a brief to mark what it holds, drawn by the components made for briefs. The brief is glass's own way of holding knowledge, a proposal and never fixed, so whoever holds knowledge otherwise may say it otherwise. A way of looking kept as a function is not a dimension but a favorite, the session's reading of the author's remark that such views are not strictly dimensions; whether it may carry a look as well is left until it is wanted.

*The author's, 2026-11-04 and [2026-11-05](said/2026-11-05.md#2-knowledge-schema-and-the-next-question): in the holon for workflow, for domain, I want to say this is a dimension, all briefs under it part of it, with an icon, a colour; and really what we're doing is schema, the primitives are the primitives; the brief is the pilot's way, a proposal, meaning glass's own first way, and if someone wants to do something else, that's fine. Being a dimension said in the body rather than by a type or a second holon the session's, since unmarked a brief is still the same brief. How far a mark reaches is no question of the data: belonging is read upward through holding, as far as the expression that reads it says, the author's of 2026-11-05. Whether what is beneath may refuse a mark is open.*

## 2. Prose made native

The prose of a brief is kept today as one piece of markdown, its parts placed by a link standing alone in a paragraph, a reading convention the store does not know. Prose is to be made native: holons the store holds, each typed, the links among them references the store sees. Native prose supersedes markdown: any markdown can be read into it, and it cannot be written back to markdown without loss. The birth can read today's files into it first; the files go once glass can show its own files and history, and briefs are written in glass. None of it is built.

*The author's, 2026-11-04 and 2026-11-05: Markdown is probably going to be replaced, and when it is, we're going native again; a standard native format for prose is what is truly agnostic, and the brief holds it and gives it its structure; native prose is not markdown and supersedes it, all markdown can be converted to native prose, but native prose would not be lossless in conversion to markdown. The files dropped once glass can show the files and their relation to the field, the author's, 2026-11-04; the first build's markdown the session's, 2026-11-01.*

### 2.1 A brief holds its prose

A brief's prose is a list of references that hold, each to a holon: a Paragraph, a List, a Quote, an Image, Code, or a holon of a kind no one has thought of yet, drawn by the component its type finds, so whoever adds a kind adds what draws it and nothing else changes. A reference that only points stands among them too, a holon shown from its own tree and not made a part, so Brief's mould leaves holding unsaid for its prose and each reference says it for itself, by `$holds`. The rule's practice has three links: one in a sentence, which mentions; a lone link, standing in a paragraph of its own, which places a part; and a quoted lone link, which shows a brief from its own tree. So the practice's lone link is a reference that holds, its quoted lone link one that points, and the brief's parts are what its prose holds, in the order they stand.

Within a holon of prose is what is not typed: its text, a string, or a list of strings and the references among words, a link to where they lead or a Term. A List holds its items, each a Paragraph or another List, so lists nest as holons hold holons. Code is a string, and a real file is a holon from an integration, placed like any other.

*The author's, 2026-11-05: you can place anything, any holon, and by placing it you place the reference, and it becomes a mount; a list of anything means any JSON can be typed and things can't be matched, so it has to say its contents are interior holons, which is a new primitive, a critique that led to prose as holons; the list has to contain a holon, and that holon may take another list; nesting of bullet points, there's nothing wrong with that; for code we start with a string, and real files are another component you mount anyway. Part and Card as one reference that holds or points his too: it is just a mount that either holds or points. Prose held as holons, and the parts read from the flow, the session's.*

### 2.2 Words carry meaning by reference

A word may be only characters, its meaning left to be inferred, or a symbol, standing for something in the field. One that stands for something is a Term, a holon holding a reference to what it means, and is then a link of its own kind. Emphasis and its like are no reserved words either: an emphasised phrase is a holon whose type is Emphasis, and the material says how it looks.

*The author's, 2026-11-05: words carry such meaning, words may be symbols; sometimes prose is just characters put together, and the meaning is to be inferred; when you want true ontological mapping, that very word is a word with a reference; bolding and the like are just reserved strings, whilst holons and types would be different. Term and Emphasis as types the session's, not yet ratified.*

### 2.3 The types of prose

The types prose is made of are to be confirmed whole before any of it is built. As drafted, each holding its text unless said otherwise:

```
Paragraph    text                         one point, as the rule has it
List         items: Paragraphs or Lists   ordered or not
Quote        text                         a passage from elsewhere
Image        source: a holon or an address; alt; caption
Code         text, a string; its language
Term         text; means: a holon
Emphasis     text
Strong       text
```

The author wondered whether a paragraph is only spacing in a list; Paragraph is kept for what the rule makes it, one point, so a paragraph is a thing of its own and not the space between. Where the confidence line stands is open: a holon in the flow, of a type Ground, which allows a ground after each claim as this wiki writes them, or a field of the brief, prose too, which allows one, as the rule's practice asks.

*The author's, 2026-11-05: we need to confirm the spec of the types we declare for prose before we can let it go for implementation; ground, I thought it is per brief. Drafted by the session; the question of the ground, between the practice's one line and this wiki's many, the session's.*

## 3. The first reader component

The reader is what is wanted, as OpenLight held: a component that draws whatever a selection reaches, in every place it stands. The first build needs something smaller, enough to read this wiki from the store: one brief whole, then the briefs beneath it in order, each by its title and first paragraph, entered to read deeper, with links followed in place.

*The reader as what is wanted, and settling something small as the first goal, the author's, 2026-11-01; the small reader's shape the session's proposal.*

Built, it is one component drawing a brief two ways: in full, with the way down to it numbered as the rule numbers it, its prose with each part it places drawn as a face, and its parts beneath; and as a face, by its number, title and first paragraph. The parts of a brief kept by time are not numbered. A link into the field places the reader there; a link to the web stays a link; one to where the field cannot reach, such as a git commit, is shown as text, and so is an image, which is never fetched, since fetching it would tell whoever serves it who reads.

*Built by the session, 2026-11-03; the record type let go the same day for a brief kept by time, the author finding "record" a bad name and time-ordered knowledge likely superseded by typed holons.*

## 4. How knowledge enters the store

The spec could go straight into a store, but nothing could read it yet; that was the author's catch-22. The rule names a folder with its entry file as a lawful form of a holarchy, so this wiki is written that way now, and the first commit of glass's store will be born from it. From then on the store holds the wiki, born again from the files whenever they change, and the files are its source and git its history, as they are for glass's code.

*The catch-22 and the wish to put the spec in the store the author's, 2026-11-01; birthing it from the files the session's proposal, agreed in the outline. The files kept as the source the author's, 2026-11-02: no need to move from markdown and git prematurely.*
