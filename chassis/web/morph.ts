// What a component renders again, laid over what it rendered before: the nodes on the
// page are kept wherever the new render has the same thing at the same place, and only
// what differs is changed, so what the browser keeps in a node, focus, a caret, a
// scroll, stays.
//
// A node is the same as one before it where it is the same kind of node with the same
// key, data-key or else data-ref, the first such left among its siblings. A drawing the
// chassis hosts is never laid over nor laid over another: the render names it by a
// stand-in, and the host itself is put there, moved only where it moved.
//
// Handlers are listened to through listen(), never addEventListener, so that a node kept
// takes the handlers of the render laid over it.

const handlers = new WeakMap<Element, Map<string, EventListener>>();

// Listens on an element for an event, the handler the element's last render gave.
export function listen(element: Element, event: string, handler: EventListener) {
  let own = handlers.get(element);
  if (!own) handlers.set(element, (own = new Map()));
  if (!own.has(event))
    element.addEventListener(event, (happened) => handlers.get(element)?.get(event)?.call(element, happened));
  own.set(event, handler);
}

// An event no longer listened to: its handler gone, the element still listening once.
const unlisten = (element: Element, event: string) =>
  handlers.get(element)?.set(event, undefined as unknown as EventListener);

// How a render names the drawings the chassis hosts: the host a stand-in stands for,
// and whether a node is a host.
export type Hosts = { hostOf(node: Node): Node | undefined; isHost(node: Node): boolean };

// The next render laid over the one before: the node to keep in place, the one before
// changed to match, or the next one where they are not the same.
export function morph(before: Node | undefined, next: Node, hosts: Hosts): Node {
  next = hosts.hostOf(next) ?? next;
  if (!before || before === next || !alike(before, next) || hosts.isHost(before) || hosts.isHost(next))
    return settled(next, hosts);

  if (!(before instanceof Element) || !(next instanceof Element)) {
    if (before.nodeValue !== next.nodeValue) before.nodeValue = next.nodeValue;
    return before;
  }

  for (const { name } of [...before.attributes]) if (!next.hasAttribute(name)) before.removeAttribute(name);
  for (const { name, value } of [...next.attributes])
    if (before.getAttribute(name) !== value) before.setAttribute(name, value);

  const given = handlers.get(next);
  const had = handlers.get(before);
  for (const event of had?.keys() ?? []) if (!given?.get(event)) unlisten(before, event);
  for (const [event, handler] of given ?? []) if (handler) listen(before, event, handler);

  children(before, next, hosts);
  return before;
}

// The children of the next render laid over those before, in its order.
function children(parent: Element, next: Element, hosts: Hosts) {
  const wanted = [...next.childNodes].map((each) => hosts.hostOf(each) ?? each);
  const before: Node[] = [...parent.childNodes];

  const placed = wanted.map((want) => {
    const at = before.indexOf(want);
    if (at >= 0) return before.splice(at, 1)[0]!;
    if (hosts.isHost(want)) return want;
    const key = keyOf(want);
    const same = before.findIndex(
      (each) => !hosts.isHost(each) && keyOf(each) === key && each.nodeName === want.nodeName,
    );
    if (same < 0) return settled(want, hosts);
    return morph(before.splice(same, 1)[0]!, want, hosts);
  });

  for (const gone of before) gone.parentNode === parent && parent.removeChild(gone);
  let after: Node | null = null;
  for (const node of placed.toReversed()) {
    if (node.parentNode !== parent || node.nextSibling !== after) parent.insertBefore(node, after);
    after = node;
  }
}

const alike = (one: Node, other: Node) =>
  one.nodeType === other.nodeType && one.nodeName === other.nodeName && keyOf(one) === keyOf(other);

const keyOf = (node: Node) =>
  node instanceof Element
    ? (node.getAttribute("data-key") ?? node.getAttribute("data-ref") ?? undefined)
    : undefined;

// A render new to the page, each stand-in within it replaced by the host it stands for.
function settled(node: Node, hosts: Hosts): Node {
  if (hosts.isHost(node)) return node;
  for (const child of [...node.childNodes]) {
    const host = hosts.hostOf(child);
    if (host) node.replaceChild(host, child);
    else settled(child, hosts);
  }
  return node;
}
