// TSX for components: markup that becomes the page's own elements, with no
// framework between. A tag is an element or a component, a function of its
// props. `on…` props given a function listen, named as the browser names
// the event; `style` given a set of properties sets them; `html` sets markup
// already made safe, as rendered prose is; every other attribute is set as
// written, `false` leaving it off except where the attribute speaks of
// truth, as `aria-` ones do. Children are nodes, text, numbers, lists of
// them, or nothing.

export type Child = Node | string | number | boolean | null | undefined | Child[];

export type Props = { [key: string]: unknown; children?: Child };

export function h(tag: string | ((props: Props) => Node), props: Props | null, ...children: Child[]): Node {
  if (typeof tag === "function") return tag({ ...props, children });

  const made = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) set(made, key, value);
  made.append(...nodesOf(children));
  return made;
}

const events: Record<string, string> = { doubleclick: "dblclick" };

function set(made: HTMLElement, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (key.startsWith("on")) {
    const event = key.slice(2).toLowerCase();
    if (typeof value === "function") made.addEventListener(events[event] ?? event, value as EventListener);
    return;
  }
  if (key === "html") made.innerHTML = String(value);
  else if (key === "style" && typeof value === "object") Object.assign(made.style, value);
  else if (value === false) {
    if (key.startsWith("aria-")) made.setAttribute(key, "false");
  } else made.setAttribute(key === "className" ? "class" : key, value === true ? "" : String(value));
}

export function Fragment({ children }: Props): Node {
  const fragment = document.createDocumentFragment();
  fragment.append(...nodesOf([children]));
  return fragment;
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
