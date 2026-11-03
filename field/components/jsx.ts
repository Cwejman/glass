// TSX for components: markup that becomes the page's own elements, with no
// framework between. A tag is an element or a component, a function of its
// props; `class` and every other attribute are set as written, `on…` props
// listen, and `html` sets markup already made safe, as rendered prose is.
// Children are nodes, text, numbers, lists of them, or nothing.

export type Child = Node | string | number | boolean | null | undefined | Child[];

export type Props = { [key: string]: unknown; children?: Child };

export function h(tag: string | ((props: Props) => Node), props: Props | null, ...children: Child[]): Node {
  if (typeof tag === "function") return tag({ ...props, children });

  const made = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "html") made.innerHTML = String(value);
    else if (key.startsWith("on") && typeof value === "function")
      made.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else made.setAttribute(key === "className" ? "class" : key, value === true ? "" : String(value));
  }
  made.append(...nodesOf(children));
  return made;
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
