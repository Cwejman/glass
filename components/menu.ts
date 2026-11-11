// A menu: what a mount draws where something was pressed with the
// secondary button, laid over the page at the press. What stands in it is
// drawn as anything is; the menu only lays it there and takes it away. One
// menu stands at a time; it closes on an outside press or on Escape, and
// gives the focus back to where it was.

let standing: (() => void) | undefined;

export function overlay(x: number, y: number, content: HTMLElement, from: HTMLElement, closed: () => void) {
  standing?.();
  const returnTo = (document.activeElement as HTMLElement | null) ?? from;

  const menu = document.createElement("div");
  menu.className = "menu";
  menu.setAttribute("role", "dialog");
  menu.append(content);

  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape") return (event.preventDefault(), close());
  };
  const outside = (event: Event) => !menu.contains(event.target as Node) && close();

  // Laid where it was asked for, and moved in from any edge it would cross,
  // as what stands in it grows.
  const lay = () => {
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
  };
  const growing = new ResizeObserver(lay);

  // A menu its mount took away when drawn again is let go of all the same.
  function close() {
    growing.disconnect();
    removeEventListener("pointerdown", outside, true);
    removeEventListener("keydown", keys, true);
    if (standing === close) standing = undefined;
    closed();
    if (!menu.isConnected) return;
    menu.remove();
    returnTo.focus?.();
  }

  addEventListener("pointerdown", outside, true);
  addEventListener("keydown", keys, true);
  standing = close;

  // Within what drew it, so a press in it rises there.
  from.append(menu);
  lay();
  growing.observe(menu);
  return close;
}
