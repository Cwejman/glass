// A menu: what can be done where something was pressed with the secondary
// button, offered by whatever took the press. An action closes the menu
// once it is done; one that could not be done says why beneath, and the
// menu stays. One menu stands at a time; it closes on an outside press, on
// Escape or Tab, and gives the focus back to where it was. A menu may hold
// something to fill in before its actions, as a value to change.

export interface Action {
  label: string;
  run: () => void | Promise<void>;
}

let standing: (() => void) | undefined;

// Close the menu that stands, if one does.
export function dismiss() {
  standing?.();
}

export function offer(
  x: number,
  y: number,
  title: string,
  actions: Action[],
  from: HTMLElement,
  before?: HTMLElement,
) {
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
  if (before) menu.append(before);

  const said = document.createElement("div");
  said.className = "menu-said";
  said.setAttribute("role", "status");
  for (const action of actions) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.textContent = action.label;
    item.addEventListener("click", () =>
      Promise.resolve()
        .then(action.run)
        .then(close, (error: unknown) => {
          said.textContent = error instanceof Error ? error.message : String(error);
        }),
    );
    menu.append(item);
  }
  menu.append(said);

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

  // An action that opened another menu in this one's place has closed it
  // already.
  function close() {
    if (!menu.isConnected) return;
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
  (before ?? items()[0])?.focus();
}

// Words asked for in a menu: a value to change, kept when Keep is pressed.
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
  offer(x, y, title, [{ label: "Keep", run: () => keep(area.value) }], from, area);
}
