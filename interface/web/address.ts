// The address and the buffer, kept as one. What ?q= asks is typed into the buffer's text
// when the page opens and whenever the browser moves through its history; each change to
// the text is written back into the address, in place of where it stands, or as a step
// of its own after a deliberate one: Enter in a form, or following a link to another
// address of this page, which is followed here rather than loaded again.
//
// Visits are the browser's own history: nothing of them is kept in the field.

import type { Engine } from "../../engine/next/engine.ts";
import { ref } from "../../engine/next/read/values.ts";
import { typed } from "../../stores/buffer/string.ts";
import { applying } from "./carried.ts";

// What the address asks.
export const asked = (at: string = location.href) => new URL(at).searchParams.get("q") ?? "";

// The address asking a text, its holons' @ and the language's punctuation left readable.
export const addressOf = (text: string) =>
  text
    ? `?q=${encodeURIComponent(text).replace(/%(40|3A|2C|28|29|7C|2F)/gi, (code) => decodeURIComponent(code))}`
    : location.pathname;

// Keeps the address and the text held in a buffer as one, within the element the page
// draws in, until the function returned is called.
export async function addressed(
  engine: Pick<Engine, "subscribe" | "commit">,
  text: string,
  within: Element,
): Promise<() => void> {
  const type = (asking: string) => engine.commit(typed(text, asking));
  // The text a deliberate step was taken from: the first other text after it is a step
  // of its own, while the text itself, still landing, keeps its place.
  let steppedFrom: string | undefined;

  await type(asked());

  const unsubscribe = await engine.subscribe(applying("get", ref(text), "text"), (answer) => {
    if (!("value" in answer) || typeof answer.value !== "string") return;

    const now = answer.value;
    document.title = now ? `${now} · Glass` : "Glass";
    if (now === asked()) return;

    if (steppedFrom === undefined || steppedFrom === now) history.replaceState(null, "", addressOf(now));
    else {
      history.pushState(null, "", addressOf(now));
      steppedFrom = undefined;
    }
  });

  const moved = () => void type(asked());

  const submitted = (event: Event) => {
    event.preventDefault();
    const field = (event.target as HTMLFormElement).elements.namedItem("q");
    steppedFrom = field instanceof HTMLInputElement ? field.value : asked();
  };

  const followed = (event: MouseEvent) => {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.defaultPrevented || event.button !== 0 || modified) return;

    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    const to = link && new URL(link.href, location.href);
    if (!to || to.origin !== location.origin || to.pathname !== location.pathname) return;
    if (!to.searchParams.has("q")) return;

    event.preventDefault();
    steppedFrom = asked();
    void type(asked(to.href));
  };

  addEventListener("popstate", moved);
  within.addEventListener("submit", submitted);
  within.addEventListener("click", followed as EventListener);

  return () => {
    unsubscribe();
    removeEventListener("popstate", moved);
    within.removeEventListener("submit", submitted);
    within.removeEventListener("click", followed as EventListener);
  };
}
