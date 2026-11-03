// A menu: what can be done where something was pressed with the secondary
// button, offered by whatever took the press. Each action either does what
// it says, or says, in words beside it, why it cannot be done here. One
// menu stands at a time; it closes on an outside press, on Escape or Tab,
// and gives the focus back to where it was. An action may ask for words
// before it is done, as a value to change, in the menu's place.

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
  menu.className = "menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", title);

  const heading = document.createElement("div");
  heading.className = "menu-title";
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
      why.className = "menu-why";
      why.id = `menu-why-${i}`;
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

// Words asked for in a menu's place: a value to change, kept when Keep is
// pressed, and what was wrong with it said beneath if it could not be.
export function ask(
  x: number,
  y: number,
  title: string,
  value: string,
  keep: (value: string) => Promise<void>,
  from: HTMLElement,
) {
  const area = document.createElement("textarea");
  area.className = "menu-value";
  area.value = value;
  area.rows = Math.min(12, value.split("\n").length + 1);
  const said = document.createElement("div");
  said.className = "menu-why";

  offer(x, y, title, [{ label: "Keep", run: () => undefined }], from);
  const menu = document.querySelector<HTMLElement>(".menu")!;
  const button = menu.querySelector<HTMLElement>('[role="menuitem"]')!;
  menu.insertBefore(area, button);
  menu.append(said);
  const kept = button.cloneNode(true) as HTMLElement;
  button.replaceWith(kept);
  kept.addEventListener("click", () => {
    keep(area.value).then(dismiss, (error: unknown) => {
      said.textContent = error instanceof Error ? error.message : String(error);
    });
  });
  area.focus();
}
