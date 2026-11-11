# The store's format

What a store is, in no language. `format.json` is a small store written out byte for byte by `make.ts`, which imports nothing of Glass's. An implementation that writes these bytes and reads them back is writing glass's store. `store.test.ts` holds `store.ts` to them. The stores were proved into this form on 2026-11-08, by the conversion in commit `830ad46`, kept in git's history with the packs it read.

Text is canonical JSON (RFC 8785), and a hash is the SHA-256 of a text, in hex.

## Files

```
refs/main             "<hash of the last log line> <open volume>"; written last
log/<n>.jsonl         commits, one per line; each volume opens with a checkpoint
blocks/<hash>.jsonl   version lines, about 64 KB each, never touched again
conversion/ids.json   old ULID -> id; written once; no reader needs it
```

Only the ref changes, and only the open volume grows. Each store is such a folder, a `.glass/` standing alone beside what it is about: the main store's at the repository's root, the others in their modules, as `stores.ts` at the root says.

`canonical.json` holds the texts of RFC 8785's examples, and the hash of each.

## Objects

- **Id:** 15 characters of the alphabet `0-9A-HJKMNP-TV-Z`, so ids sort as text. Nine are the commit's moment in milliseconds. Six are a count, which starts at a chance multiple of 32,768 in each commit and goes up by one. So a commit's new holons are its first id and how many there are. A holon's name is another thing: what it is called, beside its id.
- **Version:** `{"body":…,"id":id,"instance":[id],"mould"?:…,"name"?:…,"prev":hash|null}`, one per line. `prev` is the hash of the block holding the version before. A block holds at most one version of an id, and lists a commit's new holons first, in name order.
- **Reference:** `{"$ref":id}`, optionally with `$holds`. An id is unique across stores, so a reference into another store has the same form.
- **Commit:** `{"at","blocks":[{"first":id|null,"hash","moved":[ids],"new":n}],"gone":[ids],"parent":hash|null,"says"}`. `new` counts the block's new holons, from `first`. `moved` lists the holons it holds a new version of. `parent` is the hash of the line before, across volumes.
- **Checkpoint:** the first line of every volume adds `"checkpoint":{"blocks":[[hash,first]],"gone":[ids],"moved":[[id,hash]]}`, the whole latest table after that line. A new volume opens when the lines after the open one's checkpoint reach 64 KB.

## Reading

1. Read the ref.
2. Read the open volume. Check that each line's `parent` is the hash of the line before, up to the line whose hash is the ref. The ref moves last, so a line past it is a commit that never finished: it is ignored, and the next commit writes over it.
3. Take the first line's checkpoint and apply the lines after it: a block with a `first` joins the table, `moved` points those holons at that block, and `gone` takes holons out of the field.
4. To read a holon: use its `moved` block if it has one, else the block whose `first` is the greatest at or below its id. Fetch the whole block, check it against its hash, and find the line by `id`.

These are read only when asked for:

- **An older version:** follow `prev`.
- **The whole log:** every volume from 0, chained up to the ref.
- **The field at a commit:** the latest checkpoint at or before it, and the lines after, up to it.

A cold read costs the ref and one volume. Over HTTP a block is fetched whole, so a host can gzip it. A range request that asks for gzip gets a range of the gzipped bytes, so a range asks for `identity`. The client should keep blocks by hash, and should ask the host to revalidate the ref rather than add a query. GitHub Pages was measured doing this on 2026-11-08: every extension gzipped, `max-age=600`, a weak ETag and 304, any origin allowed, a query ignored by its cache, and a publish giving every file a new ETag.

## Writing

1. Mint ids for the new holons.
2. Write the blocks.
3. Append the log line.
4. Write the ref.

A commit is refused if the ref has moved since the store was read.

## Landing

A copy written apart lands on another by chaining its log lines on again, with its blocks copied as they are, so no id or reference changes. `land()` stops if both copies changed one holon, or if both minted in one moment.

## The conversion

The volumes before the conversion line hold the old commits, each `{"at","blocks":[],"gone":[ids],"held":[[id,place]],"oldHash","parent","says"}`. `held` is what that commit's index held anew, and `place` is a position in the conversion line's `"conversion":{"blocks":[hashes],"ids":hash,"names":{…}}`, which lists every block, the hash of `ids.json`, and the old index's map of names.

At conversion, ids follow place order: the types, then each root down its parts, the lexemes, then what was taken out. Roots keep the order their ULIDs gave them, so routes within a store stand. History comes first in its own blocks, oldest generation first.

## What is not settled

- **The lexicon:** it is still one holon, so a new word rewrites about 100 KB of text. It should grow by its parts. That is an ordinary commit, and no format change.
- **Growth:** past about 5,000 commits the table's block hashes are what grow. Folding small blocks together or checkpointing less often would answer it, and changes no id.
- **Scatter:** edits spread a whole across blocks, and an old version stays beside its neighbours. Re-placing a whole is an ordinary commit.
- **Other hosts:** only GitHub Pages was measured, with synthetic files, from one place. A host that doesn't gzip costs the field's full 11.5 MB.
- **A hostile host:** a client with no memory of an earlier head can't catch a forged store or a rollback. One that remembers its last head can.
