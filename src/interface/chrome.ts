// A slot's chrome: what can be done with what stands in it, offered where
// the slot is pressed with the secondary button. Each action either does
// what it says, or says why it cannot be done here.

export interface Action {
  label: string;
  run?: () => void;
  why?: string;
}

export function offer(x: number, y: number, title: string, actions: Action[]) {
  document.querySelector(".chrome")?.remove();

  const menu = document.createElement("div");
  menu.className = "chrome";
  menu.setAttribute("role", "menu");
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const heading = document.createElement("div");
  heading.className = "chrome-title";
  heading.textContent = title;
  menu.append(heading);

  for (const action of actions) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.textContent = action.label;
    if (action.run) item.addEventListener("click", () => (close(), action.run!()));
    else {
      item.disabled = true;
      if (action.why) item.title = action.why;
    }
    menu.append(item);
  }

  const close = () => {
    menu.remove();
    removeEventListener("pointerdown", outside, true);
    removeEventListener("keydown", escape, true);
  };
  const outside = (event: Event) => !menu.contains(event.target as Node) && close();
  const escape = (event: KeyboardEvent) => event.key === "Escape" && close();
  addEventListener("pointerdown", outside, true);
  addEventListener("keydown", escape, true);

  document.body.append(menu);
  (menu.querySelector("button:not([disabled])") as HTMLElement | null)?.focus();
}
