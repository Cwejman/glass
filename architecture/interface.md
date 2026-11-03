---
under: the rule
kind: brief
---

# The interface as a mirror of the field

The interface draws the field as it is. Its root is the field itself, its stores, names and types, and every place in it is a holon called by a mount: a component given what it reads. Whatever a holon holds that points further is mounted in turn, by what it is, so the interface's holarchy is the field's, read through its types, and nothing in a component's code decides the shape of what another draws.

*The author's, [2026-11-03](../said/2026-11-03.md#10-the-interface-as-a-mirror): the interface truly becomes a mirror of the field; carried from OpenLight's view, read again the same day. Built the same day: the entry stands at the field, a brief's parts are a list of mounts, and the wildcard draws whatever nothing closer does.*

## 1. The root is the field

The field has no single hierarchy. In the store every holon stands flat, an id and its version; order and nesting live only in bodies, in a brief's parts, a lone link, a layout's mounts. So the root is not any one holon but the field as a place: the stores attached, the names they give, and the types, each with its instances. A holarchy such as this wiki is entered from there, like anything else.

The root is a projection, as [the home](home.md#3-some-places-are-projections) calls such places: the engine shows what the field holds, and holds nothing of its own to do it.

*The author's, 2026-11-03: the reading experience is entered only when one goes into it, not at the root. The root as a projection carried from the home and OpenLight's desktop.*

## 2. A mount is a call

A mount is a component and what it is given, its argument: one holon, a list of them, or the field itself. At the place of a brief it is always one brief; only a value that truly is a list is drawn as a list, by the list component. A component says what it is given, a holon unless it says otherwise, so the list component is found for a list and the field's for the field.

*The author's, 2026-11-03: for the location of a brief it is always just one brief, unless it truly is an array, and then naturally a list. The mount as a call OpenLight's.*

## 3. Each value is mounted by what it is

A component draws its holon's own values, and opens a space for each value that points further: a reference is a mount of the holon it points at, and a list of references is a mount of the list component, whose every item is a mount in turn. What a value is, the holon's type says, since every connector has a shape, so the interface reads the type to know what to mount and where.

A component may also compose by code, using other components inside its own, as OpenLight allows; only what it places as mounts are mounts. Where a holon's holarchy is meant to be seen and changed, its parts are mounts.

*The author's, 2026-11-03: dissect the brief before plotting it out; mounts are made, and what renders within them depends. Mounting by a connector's shape the session's reading; composition by code and by data OpenLight's. As built, each component still knows which of its values to mount, as the reader knows a brief's parts; reading it from the type is not yet done.*

## 4. Which component draws a mount

A mount can name its component, and then that one draws, whatever else would. Otherwise one is found for it: one whose types the holon is an instance of, or else the wildcard, which takes any holon and draws it as its values, so nothing in the field is ever left undrawn. Switching to another available component is a change to the layout, a commit like every move.

A component is code, and runs in the page with everything the page can reach, so for now only the components of the home and of glass's own store are run; another store's components wait until what they draw can run apart, as [the client](client.md#5-a-full-client-preloaded) asks.

How a component is found is not settled. Glass now matches by type each time it draws. OpenLight ruled instead that the engine never infers a component: the one composing picks, from a table of defaults held in the field with the wildcard last, and the pick is recorded in the mount, so what is seen never depends on a table changing underneath. Mounts that are derived, such as a brief's parts, would be drawn through the table. Whatever is built on how a component is found is built knowing it may change, so finding a component is one function of the interface, the one place that would change.

*Switching is not yet offered in the interface. The override, the wildcard and switching the author's, 2026-11-03; the recorded pick OpenLight's ruling of 2026-08-23. Which glass takes the author does not know yet: "if we do good code and good knowledge around these things, it's easy to switch later."*

## 5. A slot and the kind it is

Anything a component opens for something it holds is a slot, a lone link in prose and a brief's sections as much as a list's items: a slot is a mount. Whether what stands in it is drawn whole or as its face is settled by a contract between the one that holds and the one held, which share only a small vocabulary, the kinds of slot, held in the field as holons: *full* and *face* to begin with. The holder says which kind each slot it opens is, a pane full, a brief's parts and a list's items face; each component says which kinds it draws; and the slot is drawn by the component for its holon's type that draws its kind, else by the wildcard, which draws every kind. Neither looks at the other: the holder never inside what it holds, the held never at what holds it.

A slot's own data comes first. Turning a face into full, or choosing another component, from the slot's chrome writes it into the slot, so what is seen is what is stored; the kind its holder gave it is only the default.

*The contract the author's requirement, 2026-11-03: the held cannot decide for itself, for it would have to know everything that exists, so it must be a contract for that kind of communication; the vocabulary of kinds the session's. Taken provisionally: "we might be able to do with it for now", the second decision whose rightness is not known, so anything built that depends on it is flagged before it is built.*

As built: the kinds full and face are holons the field names; each component lists the kinds it draws, and a brief's one component draws itself both ways; the arrangement is drawn whole in the page's one slot by the layout's component, which sets its mounts side by side as panes; and every slot answers the secondary press with its chrome, to open what it holds as the place, to show it in the other kind, or to draw it with another component that takes it. A change from the chrome is kept where the slot's own data can be written, the arrangement's panes; in a slot that is part of a brief in glass's store, which is only read, the chrome says so and keeps nothing.

*Built by the session, 2026-11-03, on the author's go. Where a change to such a slot would be kept is still open, with the reader's own branch of a pulled store.*

## 6. Looking from many angles

A slot can read more than one holon: what an expression gathers. An expression is data, a value held in a body like any other, and the engine evaluates it to the holons it gathers, in the field's order: the instances of a type, every type, what points at a holon, every named holon, and what all or any of several gather. A layout's mount may gather instead of point, and a component may gather in what it reads, so the same field can be looked at from as many angles as there are expressions, each drawn by the list or by whatever takes it. This is the ground the reader grows on: its collations are such looks, through the primitives and not beside them.

*The author's, 2026-11-03: expressions are just data, so no language is invented; open the power to look upon data from different angles, which is what the reader will become. The forms the session's; grouping, and a template's `$` into what it is given, wait for their use.*

## 7. What a component may do

A component is given what its slot reads, the kind of slot, and its settings, and works through its space. Three things keep that honest. Its settings are declared, each said in prose with its shape, as a type declares its fields, and what a slot gives it is checked against them before it draws. Its reads beyond what it is handed are declared too, by their forms, and any other read is refused by name, so what a component looks at is said where it can be seen, as OpenLight's reach asks. And the bodies it draws are typed from the field's own types, each field's prose its comment, made by the build from the types and checked to be current.

A component is a pure function of what it is given and of the field: it draws again whole when what it read changes. What must last across a drawing, as where a pane is scrolled, lives in the slot's host, which stays while what is in it is drawn again; a pane scrolls within itself, its top fading once scrolled.

*Reach, settings and typed bodies from OpenLight's view, read the same day; the session's reading of where glass went against it. Not yet built, having no use yet: acts, a component committing or launching with the reach facts that say what it may write; and offers, what a holder gives everything beneath it to bind by type, which wait for something that must trickle. Keeping a component's own state between drawings, as OpenLight's update does, is held open.*

