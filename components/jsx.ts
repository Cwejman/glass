// TSX for components: markup that becomes the page's own elements, with no framework
// between. A tag is an element or a function of its props. `on…` props given a function
// listen, named as the browser names the event. Every other attribute is set as written,
// `false` leaving it off except where the attribute speaks of truth, as `aria-` ones do.
// Children are nodes, text, numbers, lists of them, or nothing, and text is only ever text.

export type Child = Node | string | number | boolean | null | undefined | Child[];

export type Props = { [key: string]: unknown; children?: Child };

export function h(tag: string | ((props: Props) => Node), props: Props | null, ...children: Child[]): Node {
  if (typeof tag === "function") return tag({ ...props, children });

  const made = document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) set(made, key, value);
  made.append(...nodesOf(children));

  return made;
}

function set(made: HTMLElement, key: string, value: unknown) {
  if (value === undefined || value === null) return;

  if (key.startsWith("on")) {
    if (typeof value === "function")
      made.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
  } else if (value === false) {
    if (key.startsWith("aria-")) made.setAttribute(key, "false");
  } else {
    made.setAttribute(key, value === true ? "" : String(value));
  }
}

function nodesOf(children: Child[]): (Node | string)[] {
  return children.flatMap((child): (Node | string)[] => {
    if (Array.isArray(child)) return nodesOf(child);
    if (child === null || child === undefined || typeof child === "boolean") return [];

    return [typeof child === "number" ? String(child) : child];
  });
}

declare global {
  namespace JSX {
    type Element = Node;

    interface IntrinsicElements {
      [tag: string]: { [attribute: string]: unknown; children?: Child };
    }
  }
}
