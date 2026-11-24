// TSX for components on the web: markup that becomes the page's own elements, with no
// framework between. A tag is an element or a function of its props. `on…` props given a
// function listen, named as the browser names the event, through the chassis, so a
// render laid over another hands its handlers to the nodes kept (morph.ts). Every other
// attribute is set as written, `false` leaving it off except where the attribute speaks
// of truth, as `aria-` ones do. Children are nodes, text, numbers, lists of them, or
// nothing, and text is only ever text.

import { listen } from "../../chassis/web/morph.ts";

export type Child = Node | string | number | boolean | null | undefined | Child[];

export type Props = { [key: string]: unknown; children?: Child };

export function h(
  tag: string | ((props: Props) => HTMLElement),
  props: Props | null,
  ...children: Child[]
): HTMLElement {
  if (typeof tag === "function") return tag({ ...props, children });

  const made = document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (key.startsWith("on")) {
      if (typeof value === "function") listen(made, key.slice(2).toLowerCase(), value as EventListener);
    } else if (value === false) {
      if (key.startsWith("aria-")) made.setAttribute(key, "false");
    } else if (value !== undefined && value !== null) {
      made.setAttribute(key, value === true ? "" : String(value));
    }
  }
  made.append(...nodesOf(children));

  return made;
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
    type Element = HTMLElement;

    interface IntrinsicElements {
      [tag: string]: { [attribute: string]: unknown; children?: Child };
    }
  }
}
