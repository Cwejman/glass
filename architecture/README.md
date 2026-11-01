---
under: the rule
kind: brief
---

# The architecture

A working application, a site among them, needs state, and state needs a field to hold it, an engine to govern it, and an interface connected to the engine. Glass keeps the field in a store anyone can serve as plain files, and puts the engine and the interface in a client that pulls the store and runs over it, in the reader's own browser.

The store comes first, since everything else moves it or reads it.

[The store](store.md)

The client holds the engine and the interface, and it is the whole application, as capable as one on your own machine.

[The client](client.md)

The engine in the client has a field of its own, its home, where everything the reader does is kept, apart from the stores it pulled.

[The home](home.md)

Holding the client and its home, publishing is simple: a store is put on a static host as files, and a site is such a store with a client that comes pointed at it.

[Remotes and publishing](remotes.md)

Last comes the address bar, which OpenLight never had: what a URL carries when the client is the whole application.

[The URL](url.md)

*The author's, 2026-11-01, from reading glass's first iteration against OpenLight; the parts and their order the session's.*
