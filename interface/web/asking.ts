// Whether the reader is asking: the bar's input shown and typed into, in place of where
// the reader stands, its breadcrumb. At rest the page shows the breadcrumb alone; the
// breadcrumb's expression button, a press on its line, or / outside any field opens the
// input; Enter, Escape in the empty input, or a press anywhere outside the bar closes it.
// Taking a pill out is a press within the bar, so it stays open.

const open = "asking";

export function asking(on: boolean, focus = on) {
  document.body.classList.toggle(open, on);
  if (focus) document.querySelector<HTMLInputElement>(".expression-input input")?.focus();
}

export const isAsking = () => document.body.classList.contains(open);

// The bar: the row the input stands in, with the pills beside it, however it is laid out.
const barOf = (within: Document) => within.querySelector(".expression-input")?.closest(".list.row");

// / opens the input from anywhere but a field; a press outside the bar closes it.
export function askingByKey(within: Document) {
  within.addEventListener("pointerdown", (event) => {
    const target = event.target as Element | null;
    if (!isAsking() || !target || target.closest(".trail") || barOf(within)?.contains(target)) return;
    asking(false, false);
  });
  within.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (target?.closest("input, textarea, [contenteditable]")) return;
    event.preventDefault();
    asking(true);
  });
}
