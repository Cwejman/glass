---
under: the rule
kind: brief
---

# The formats considered

Glass's store stands in a lineage: since around 2010 several movements have tried to take data back from the servers that hold it, and most of them build on one old idea, naming data by the hash of what it holds. This brief gives that background, what box glass's store draws inside it, and why the store is made rather than adopted.

*Carried from the session's knowledge and the sources linked, 2026-11-01; checked against the sources only where a source is linked, and the rest not checked.*

## 1. Naming data by what it holds

A name made from the hash of the content proves the content: fetch it from anyone, hash it again, and you know it was not changed. Everything below descends from that.

Ralph Merkle described trees of such hashes in 1979, BitTorrent used them to fetch pieces of files from strangers, and git made them everyday in 2005, where every file, folder and commit is an object named by its hash and a branch is a pointer to a commit.

*Carried, not checked.*

## 2. The families

Each family came at the same problem from its own side, and each has a culture as well as a format.

*Carried, the session's survey of 2026-11-01.*

### 2.a IPFS and IPLD, the content-addressed web

IPFS came from Juan Benet and Protocol Labs around 2015, aiming at a permanent web where content is found by what it is, not where it sits. Its data layer, IPLD, names objects by CIDs, encodes them as DAG-JSON or DAG-CBOR, links them by those names, and bundles them in CAR files. A [trustless gateway](https://specs.ipfs.tech/http-gateways/trustless-gateway/) serves objects over plain HTTP for a client to verify itself.

It is neutral and well specified, with no opinion on what objects mean. Its culture is idealistic and decentralist, and tied to cryptocurrency through Filecoin, which colours its reputation.

*The gateway checked against its spec, 2026-11-01; the rest carried.*

### 2.b The AT Protocol, owner-held repositories

Bluesky's protocol began in 2019 as a Twitter-funded effort to make social media a protocol. Each user has a repository of typed records, each record with a key, every change a signed commit, the records in a Merkle tree, the whole exportable as a CAR file on top of IPLD. Records are typed by Lexicon schemas, and a repository lives on a server its owner chooses and can leave.

It is the closest thing in use to holons with ids, typed and committed and owned. It also brings its own identity system, record layout and server protocol, built for a social network of millions.

*Carried from [library documentation](https://pkg.go.dev/github.com/jcalabro/atmos/repo), not from the spec at atproto.com, which was not read.*

### 2.c Local-first and CRDTs

Local-first software keeps your data on your own devices and merges it with others' when they meet, so no server stands between you and your work.

The 2019 essay [*Local-first software: You own your data, in spite of the cloud*](https://inkandswitch.com/local-first/), by Kleppmann, Wiggins, van Hardenberg and McGranaghan at Ink & Switch, named its ideals: no spinners, work offline, across devices, together, for a long time, privately, with final authority over your data. Its technique is CRDTs, structures that merge edits made apart without conflict, in libraries such as Automerge and Yjs.

Its culture is a research lab's, close to tools for thought and to OpenLight's own. It is strongest at merging two people's work, and what it syncs are documents, between peers and servers, where glass publishes a store anyone can fetch.

*The essay and its authors checked, 2026-11-01; the rest carried.*

### 2.d Logs between peers

Secure Scuttlebutt gossiped between friends, Dat and Hypercore kept signed append-only logs, Nostr passes signed JSON events through relays, and [Willow](https://lwn.net/Articles/1005639), with Earthstar, syncs namespaces of paths with capabilities saying who may read and write. They are built for peers finding each other, small communities and life off the grid, which is further from a client fetching from a host than glass needs.

*Willow checked against LWN's account, 2026-11-01; the rest carried.*

### 2.e Solid, linked data in pods

Tim Berners-Lee's answer, from 2016: your data in a pod, described in RDF, with applications asking the pod for permission. It is the web's inventor's own attempt, and it keeps the data on a server and names it by where it is rather than by what it holds.

*Carried, not checked.*

## 3. The box glass draws

Inside the box: objects named by their hash, never changed, linking to each other by hash; history as commit objects; a store published as plain files any host can serve; and a client that fetches only what it needs and checks every object itself.

Outside it lies what the format does not decide, among them proving who published, merging, finding a store by name, networking between peers and who may read what; those still to be settled are gathered in [the plan](../plan.md#3-what-is-open).

*Reasoned, the session's, 2026-11-01.*

## 4. Why our own

None of the families is a medium for programs and interfaces as well as data, and none has types that govern what may be written. That is what OpenLight adds, and it lives in the object model, so the object model is glass's own: holons with ids, versions, an index, commits and refs.

Beneath the model, glass borrows the smallest standards there are: canonical JSON and SHA-256, readable by hand and needing nothing. IPLD would give an ecosystem glass has no use for yet, at the cost of binding the encoding to it, and an IPLD encoding of the same objects stays possible if that use ever comes.

*Proposed and reasoned by the session, 2026-11-01; agreed by the author, who found nothing in OpenLight's earlier studies against it.*

### 4.1 Where git and SQLite fit

Git versions files that hold no history of their own, and glass's objects carry their history in themselves, so git would hold history about history. Git also knows nothing of types or holons, and running it in a browser takes a library of its own. It remains useful as a way of carrying a store's files.

SQLite is one engine's storage, not a format for a field that travels between engines. A store published as a database file binds every reader to SQLite, while a store of objects lets each engine keep whatever storage suits it, in the browser or on a machine.

*The author's, 2026-11-01: SQLite is not the answer to the object model OpenLight discussed, and glass is not to be based on git.*
