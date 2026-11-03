---
under: the rule
kind: brief
---

# The interface as a mirror of the field

The interface draws the field as it is. Every place in it is a holon called by a mount: a component given what it reads. Whatever a holon holds that points further is mounted in turn, by what it is, so the interface's holarchy is the field's, read through its types, and nothing in a component's code decides the shape of what another draws.

*The author's, [2026-11-03](../said/2026-11-03.md#10-the-interface-as-a-mirror): the interface truly becomes a mirror of the field; carried from OpenLight's view, read again the same day. Built the same day: a brief's parts are a list of mounts, and the wildcard draws whatever nothing closer does.*

## 1. The root is a mount

The field has no single hierarchy. In the store every holon stands flat, an id and its version; order and nesting live only in bodies, in a brief's parts, a lone link. So the root is no holon of the field's own making but a mount: what the reader is looking at, held as data. Glass ships one as its entry, giving everything the field names, and a holarchy such as this wiki is entered from there, like anything else.

The primitives themselves are still: they hold no state, take no press and move nowhere. Looking around is something built on them, and the one thing it needs to stand still to be changed is the root mount, so that is where it lives, as [§8](#8-moving-is-a-new-version-of-the-root) tells.

*The author's, [2026-11-03](../said/2026-11-03.md#17-the-root-as-a-mount): there is no state, no interaction and no navigation in the primitives, and that is something to birth upon them; the root should be an actual reading, not a custom component. That the entry once stood at the field itself as a projection, drawn by a component of its own, is let go in it.*

## 2. A mount is a call

A mount is a component and what it is given, its argument: a selection, holons in order. One holon is drawn as itself; several, which truly are a list, are drawn as a list, by the list component. An expression given in an argument is a holon too, of the type Expression, so a mount can give a way of looking as easily as a thing looked at, and what draws an expression shows its words or what it gathers. A component says what it is given, one holon, a list, or a selection, either, so the list component is found for a list.

```ts
holon The root : Mount {
  component: ref(Reader)
  argument:  [ ref(Everything named) ]
}

holon Everything named : Expression {
  gathers: { named: true }
}
```

*The author's, 2026-11-03: for the location of a brief it is always just one brief, unless it truly is an array, and then naturally a list; a mount sets an expression or a set, a location, and the component to render it, and that's it. The mount as a call, its argument as a selection, and expressions given as holons, OpenLight's.*

## 3. Each value is mounted by what it is

A component draws its holon's own values, and opens a space for each value that points further: a reference is a mount of the holon it points at, and a list of references is a mount of the list component, whose every item is a mount in turn. What a value is, the holon's type says, since every connector has a shape, so the interface reads the type to know what to mount and where.

A component is made of code, or of data. As data it is a template: mounts held in order, each giving `$`, what the component itself is given, in the kind of slot it says. The reader is such a component: what it is given, drawn in full, the ground where more ways of looking can stand beside it.

```ts
holon Reader : Component {
  takes:    []
  argument: "selection"
  template: [
    { argument: "$" }
  ]
}
```

A component made of code may also compose by code, using other components inside its own, as OpenLight allows; only what it places as mounts are mounts. Where a holon's holarchy is meant to be seen and changed, its parts are mounts.

*The author's, 2026-11-03: dissect the brief before plotting it out; mounts are made, and what renders within them depends; the reader probably not as code, preferably as layout, as data. Mounting by a connector's shape the session's reading; composition by code and by data, and the template's `$`, OpenLight's, where a template's arguments may be whole expressions over `$`; glass takes `$` alone until more is wanted. As built, each component still knows which of its values to mount, as the brief knows its parts; reading it from the type is not yet done.*

## 4. Which component draws a mount

A mount can name its component, and then that one draws, whatever else would. Otherwise one is found for it: one whose types the holon is an instance of, or else the wildcard, which takes any holon and draws it as its values, so nothing in the field is ever left undrawn. Switching to another available component is a change to the root mount, a new version of it like every move.

A component is code, and runs in the page with everything the page can reach, so for now only the components of the home and of glass's own store are run; another store's components wait until what they draw can run apart, as [the client](client.md#5-a-full-client-preloaded) asks.

How a component is found is not settled. Glass now matches by type each time it draws. OpenLight ruled instead that the engine never infers a component: the one composing picks, from a table of defaults held in the field with the wildcard last, and the pick is recorded in the mount, so what is seen never depends on a table changing underneath. Mounts that are derived, such as a brief's parts, would be drawn through the table. Whatever is built on how a component is found is built knowing it may change, so finding a component is one function of the interface, the one place that would change.

*Switching is offered from the root mount's menu, as "look here with" each component that takes the place, for that one look. The override, the wildcard and switching the author's, 2026-11-03; the recorded pick OpenLight's ruling of 2026-08-23. Which glass takes the author does not know yet: "if we do good code and good knowledge around these things, it's easy to switch later."*

## 5. A slot and the kind it is

Anything a component opens for something it holds is a slot, a lone link in prose and a brief's sections as much as a list's items: a slot is a mount, opened where what it reads stands, one holon by its id, or several by theirs; what an expression gathers is opened as those holons. Whether what stands in it is drawn whole or as its face is settled by a contract between the one that holds and the one held, which share only a small vocabulary, the kinds of slot, held in the field as holons: *full* and *face* to begin with.

The kind travels as an offer, as OpenLight's offers do: a holder offers it to the slot it opens and to everything beneath, the nearest offer shadowing the farther, and where nothing offers, a holon shows its face. The page offers full to the root mount, and a mount to what it gives; a brief offers face to everything it holds, so its fullness never trickles into its parts; a list offers face to its items. Each component says which kinds it draws, and the slot is drawn by the component for its holon's type that draws its kind, else by the wildcard, which draws every kind. Neither looks at the other: the holder never inside what it holds, the held never at what holds it.

A slot's own word comes before any offer: a template's mount says its kind, and in prose a lone link titled `full` says so for itself.

*The contract the author's requirement, 2026-11-03: the held cannot decide for itself, for it would have to know everything that exists, so it must be a contract for that kind of communication; the vocabulary of kinds the session's; the kind as an offer, face unless offered full, the author's, the same day. Taken provisionally: "we might be able to do with it for now", the second decision whose rightness is not known, so anything built that depends on it is flagged before it is built.*

As built: the kinds full and face are holons the field names; each component lists the kinds it draws, and a brief's one component draws itself both ways; the page offers full to the root mount, which offers full to what it gives.

*Built by the session, 2026-11-03, on the author's go. A slot's chrome, which turned a face into full or chose another component and kept it in the slot, was let go with the arrangement it wrote into; changing how a place is drawn is now changing the root mount, [§8](#8-moving-is-a-new-version-of-the-root). Where a change to a slot inside a brief would be kept is still open, with the reader's own branch of a pulled store.*

## 6. Looking from many angles

A slot can read more than one holon: what an expression gathers. An expression is data, a value held in a body like any other, and the engine evaluates it to the holons it gathers, in the field's order: the instances of a type, every type, what points at a holon, every named holon, and what all or any of several gather. Held as a holon of its own, an expression can be given to a mount, and a component may gather in what it reads, so the same field can be looked at from as many angles as there are expressions, each drawn by whatever takes it. This is the ground the reader grows on: its collations are such looks, through the primitives and not beside them.

*The author's, 2026-11-03: expressions are just data, so no language is invented; open the power to look upon data from different angles, which is what the reader will become. The forms the session's. A form for what a holon holds, by key, was let go the same day as convoluted: a holon's parts are its own to open, and nothing needed to look into them from outside.*

## 7. What a component may do

A component declares itself in its own module, beside its code: what it is, the types it takes and the kinds of slot it draws in, by their names, what it is given, the settings it takes, each said in prose with its shape as a type declares its fields, and the reads it makes beyond what it is handed. The birth checks every name and that the declaration is well formed; the engine checks that each declared setting is said as a field; and what a slot gives is checked against the settings before the component draws. A component is then given what its slot reads, typed as its type declares, the bodies made by the build from the field's own types with each field's prose as its comment, and its reads answered with the shape their form gives.

It is told what it may do, as OpenLight delivers reach facts rather than have a component work them out: whether it may write the holon it was given. That one act, a new version of its own holon, in one commit with any new holons it comes to point at, born in the home, is all a component may do so far; what it brings into being is never a component, since a component in the home is run, and a holon may be written where it is the reader's, in the home, or the entry while it is still the root, which the first write makes the reader's own; once the reader has a root of their own, the entry is only shown.

Its reach is a ceiling: it reaches what it was handed, what that references and is an instance of, and what its own declared reads give back; reading a holon it was handed opens nothing further. It reads only by the forms it declares, each read one form and nothing beside it, and opens slots only for what it reaches, each held to the same ceiling; a template's mounts give only what the template was given, so they reach nothing new. A drawing that has been overtaken or closed can neither read nor open anything more. Anything else is refused by name, and every query and every list it opens is copied before it is judged, so what is judged is what is used. The reach is each slot's own: unlike OpenLight's, which narrows from parent to child with grants, a child's starts again from what its slot reads. This is a ceiling among components in one page, which keeps each honest about what it looks at; it is not isolation, for code in the page can reach everything the page can, which is why only glass's own components and the home's are run until components can run apart.

A component is a pure function of what it is given and of the field: it draws again whole when what it read changes. What must last across a drawing lives in the slot's host, which stays while what is in it is drawn again.

A list says nothing of what its items are, so a component that takes a type for its items, such as a timeline of a day's words, draws there only where a slot names it; otherwise one that takes nothing in particular is found. A full slot never draws in full a holon that a slot around it already draws in full; there it shows its face, so nothing stands inside itself without end. And a component a slot names that is not run, or cannot draw there, is said to be so in the slot, as OpenLight's "not admitted here", rather than quietly replaced, except where the nesting guard, not the slot, changed what was asked.

*Reach, settings and typed bodies from OpenLight's view, read the same day; the session's reading of where glass went against it, mended after three fresh readings. The nesting guard adds to the slot contract, which is provisional; a template draws nothing of its own, so it adds nothing to the guard. Not yet built, having no use yet: acts beyond a component's own holon, and launching programs; offers carry only the kind of slot so far. Keeping a component's own state between drawings, as OpenLight's update does, is held open.*

## 8. Moving is a new version of the root

A holon keeps every state it has had, each version pointing back at the one before, so the root mount's versions are already the reader's history, and nothing else is needed to hold one. To look somewhere else is to give the root mount another argument: a new version of it. Back is the version before, and the browser's own back and forward walk the versions, translated by the interface; walking writes the old version again, so history only ever grows.

A press does not need catching from above. Every slot says where it is: its element carries the holons it reads as its location, and a link in prose carries the one it mentions. A press rises through the page from where it landed, past those locations, to whatever holds them and cares. The mount component cares, where it may write its mount: a press inside it gives the innermost location it passed, and the mount gives that instead, drawn again by the component the entry calls, the reader. The brief that was pressed never knows it was read; a mount that may not be written lets a press rise on.

Where one is looking is said above it: the mount's location, in words, a way of looking by what it gathers, as "Every brief: the instances of Brief", anything else by its title and what it is, as "Glass · Brief". It is the mount's own data, so it is the mount that says it, not what it gives, and pressed it opens to be changed where it stands: to one of the ways of looking the field holds, to a holon by the name the field gives it, or to an expression written as data, its holons by their names, as `{ "instances": "brief" }`, which is born in the home as a way of looking of its own and can be chosen again. Escape leaves it as it was.

The secondary press rises the same way, and the mount offers what can be done there: to look there; to look there with each component that takes what is there, found by its type, for that one look; and to change what the mount gives by hand, its component and argument as data, judged by the engine as any write is.

```ts
holon The root : Mount {          // the reader's own, in the home
  component: ref(Reader)
  argument:  [ ref(The primitives) ]   // a press on a part's face, and this is new
}
```

*The author's, 2026-11-03: navigation needs a kind of history and is based on locations; the reader needs a way to see the actual location you are looking at and to be able to update it, for a face of it is not that helpful; the root holds the expression for what you are seeing, and changing it from the context menu's WYSIWYG is fine; the context menu has actual actions, made available by type matching; the history stack and the URL as an integration. Bubbling the session's proposal, which the author was open to; catching every press at the root was OpenLight's answer, not taken for granted. History as the root's versions the session's, as OpenLight's collation cited its predecessor. Programs, once they run, are where more of the menu's actions will come from; the URL is not yet written.*

