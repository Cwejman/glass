// A slot's chrome: what can be done with what stands in it, offered where
// the slot is pressed with the secondary button. Each action either does
// what it says, or says, in words beside it, why it cannot be done here.
// One menu stands at a time; it closes on an outside press, on Escape or
// Tab, when the page is drawn again, and gives the focus back to where it
// was.

export interface Action {
  label: string;
  run?: () => void;
  why?: string;
}

let standing: (() => void) | undefined;

// Close the menu that stands, if one does.
export function dismiss() {
  standing?.();
}

export function offer(x: number, y: number, title: string, actions: Action[], from: HTMLElement) {
  dismiss();
  const returnTo = (document.activeElement as HTMLElement | null) ?? from;

  const menu = document.createElement("div");
  menu.className = "chrome";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", title);

  const heading = document.createElement("div");
  heading.className = "chrome-title";
  heading.textContent = title;
  menu.append(heading);

  for (const [i, action] of actions.entries()) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.textContent = action.label;
    if (action.run) item.addEventListener("click", () => (close(), action.run!()));
    else item.setAttribute("aria-disabled", "true");
    menu.append(item);

    if (!action.run && action.why) {
      const why = document.createElement("div");
      why.className = "chrome-why";
      why.id = `chrome-why-${i}`;
      why.textContent = action.why;
      item.setAttribute("aria-describedby", why.id);
      menu.append(why);
    }
  }

  const items = () => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const step = (by: number) => {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[(at + by + all.length) % all.length]?.focus();
  };

  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") return (event.preventDefault(), close());
    if (event.key === "ArrowDown") return (event.preventDefault(), step(1));
    if (event.key === "ArrowUp") return (event.preventDefault(), step(-1));
  };
  const outside = (event: Event) => !menu.contains(event.target as Node) && close();

  function close() {
    menu.remove();
    removeEventListener("pointerdown", outside, true);
    removeEventListener("keydown", keys, true);
    standing = undefined;
    returnTo.focus?.();
  }

  addEventListener("pointerdown", outside, true);
  addEventListener("keydown", keys, true);
  standing = close;

  // Laid where it was asked for, then moved in from any edge it would cross.
  document.body.append(menu);
  const { width, height } = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
  items()[0]?.focus();
}
