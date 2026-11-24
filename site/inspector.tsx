// What a place in the page is, shown where it is pressed with the other button: the
// component drawing it, a link to its holon; what it was given; the components it was
// reached through from the root, by the uses the chassis walked to it; the holon it
// shows, by name, with its types, store, how the language says it, and its id to copy;
// and, from anywhere, what the whole page is laid out by, the component its root
// applies. All of it is what the chassis knows of the drawing there (drawingsAt), read
// again only for names.
//
// The place is the innermost there is: a holon a drawing draws as one of its items, a row
// or a link, is a place of its own, drawn by the component drawing around it and given
// that holon; else the drawing itself. That place alone is outlined.
//
// The browser's own menu is still there with shift held.

import { hrefTo } from "../components/web/link.ts";
import { h, type Child } from "../components/web/jsx.ts";
import type { Engine, Read } from "../engine/engine.ts";
import { isRecord, isRef, ref, type Value } from "../engine/read/values.ts";
import { applying, applyingEach, type Glass } from "../language/shipped.ts";
import { drawingsAt, isDrawing } from "../chassis/web/chassis.ts";

type Inspecting = {
  engine: Pick<Engine, "read">;
  glass: Glass;
  root: Read;
  names: ReadonlyMap<string, string>;
};

// Shows the inspector for any place pressed with the other button within the element,
// until the function returned is called.
export function inspecting(within: Element, { engine, glass, root, names }: Inspecting): () => void {
  const layout = layoutOf(root);
  let open: { panel: HTMLElement; marked: Element[] } | undefined;
  const read = (asked: Read) => engine.read(asked);

  function close() {
    if (!open) return;
    open.panel.remove();
    document.body.style.paddingBottom = "";
    for (const each of open.marked) each.classList.remove("inspected");
    open = undefined;
  }

  async function inspect(event: MouseEvent) {
    if (event.shiftKey) return;
    const chain = drawingsAt(event.target as Node);
    const here = chain.at(-1);
    if (!here) return;
    event.preventDefault();
    close();

    const target = event.target as Element;
    const item = target.closest?.("[data-ref]") ?? undefined;
    const itemId = item?.getAttribute("data-ref") ?? undefined;
    const placeGiven = itemId ? [ref(itemId)] : here.given;
    const shownId =
      itemId ??
      target.closest?.("[data-holon]")?.getAttribute("data-holon") ??
      (isRef(here.given[0] ?? null) ? (here.given[0] as { $ref: string }).$ref : undefined);

    const [path, given, shown, around] = await Promise.all([
      pathOf(chain, root, glass, read),
      Promise.all(placeGiven.map((each) => givenSaid(each, glass, read))),
      shownId ? holonSaid(shownId, glass, read) : undefined,
      itemId && isRef(here.given[0] ?? null)
        ? holonSaid((here.given[0] as { $ref: string }).$ref, glass, read)
        : undefined,
    ]);
    // The way ends with the drawing around the place: where an item is the place, the
    // drawing it stands in, saying what it draws; else the drawing's own parent.
    const way = itemId
      ? path.map((step, i) =>
          i === path.length - 1 && around ? { ...step, name: `${step.name} · ${around.name}` } : step,
        )
      : path.slice(0, -1);

    const component = here.name ?? "a component";
    const panel = (
      <aside class="inspector" role="dialog" aria-label="This place">
        <header>
          <span class="label">Drawn here by</span>
          <button type="button" class="close" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        <h2>
          <a href={hrefTo(here.component)}>{component}</a>
        </h2>
        {given.length > 0 && (
          <section>
            <h3>Given</h3>
            <ol class="given">
              {given.map((each) => (
                <li>{each}</li>
              ))}
            </ol>
          </section>
        )}
        <section>
          <h3>Reached through</h3>
          <ol class="path">
            {way.map(({ id, name }) => (
              <li>
                <a href={hrefTo(id)}>{name}</a>
              </li>
            ))}
          </ol>
        </section>
        {shown && (
          <section class="shows">
            <h3>Shows</h3>
            <p class="name">
              <a href={hrefTo(shown.id)}>{shown.name}</a>
            </p>
            {shown.kind && <p class="kind">{shown.kind}</p>}
            <dl>
              {shown.said && [
                <dt>Said as</dt>,
                <dd>
                  <code>{shown.said}</code>
                </dd>,
              ]}
              <dt>Id</dt>
              <dd>
                <code>{shown.id}</code>{" "}
                <button type="button" class="copy" onClick={copying(shown.id)}>
                  Copy
                </button>
              </dd>
            </dl>
          </section>
        )}
        <footer>
          {layout && <a href={hrefTo(layout)}>This page is laid out by {names.get(layout) ?? "its root"}</a>}
        </footer>
      </aside>
    ) as HTMLElement;

    panel.addEventListener("click", (clicked) => {
      if ((clicked.target as Element).closest("a[href]")) setTimeout(close);
    });
    document.body.append(panel);
    const marked = item ?? here.node.firstElementChild ?? undefined;
    marked?.classList.add("inspected");
    open = { panel, marked: marked ? [marked] : [] };
    placed(panel, event);
    // On a narrow page the place is kept in sight above the sheet.
    if (marked && panel.classList.contains("sheet")) {
      document.body.style.paddingBottom = `${panel.offsetHeight}px`;
      const hidden = marked.getBoundingClientRect().bottom - (innerHeight - panel.offsetHeight) + 16;
      if (hidden > 0) scrollBy({ top: hidden });
    }
    panel.querySelector<HTMLElement>("h2 a")?.focus({ preventScroll: true });
  }

  const onContext = (event: Event) => void inspect(event as MouseEvent);
  const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
  const onDown = (event: Event) => {
    if (open && !open.panel.contains(event.target as Node)) close();
  };

  within.addEventListener("contextmenu", onContext);
  addEventListener("keydown", onKey);
  addEventListener("pointerdown", onDown, true);
  addEventListener("popstate", close);

  return () => {
    close();
    within.removeEventListener("contextmenu", onContext);
    removeEventListener("keydown", onKey);
    removeEventListener("pointerdown", onDown, true);
    removeEventListener("popstate", close);
  };
}

// The panel put by the place pressed, within the window; on a narrow one, along its foot.
function placed(panel: HTMLElement, { clientX, clientY }: MouseEvent) {
  if (innerWidth < 600) return panel.classList.add("sheet");
  const { width, height } = panel.getBoundingClientRect();
  const margin = 16;
  panel.style.left = `${Math.max(margin, Math.min(clientX + 4, innerWidth - width - margin))}px`;
  panel.style.top = `${Math.max(margin, Math.min(clientY + 4, innerHeight - height - margin))}px`;
}

const copying = (text: string) => (event: Event) => {
  const button = event.currentTarget as HTMLButtonElement;
  void navigator.clipboard?.writeText(text).then(
    () => (button.textContent = "Copied"),
    () => (button.textContent = "Not copied"),
  );
};

type Asking = (asked: Read) => Promise<Awaited<ReturnType<Engine["read"]>>>;

// The components a drawing was reached through, from the root: for each drawing around
// it, outermost first, the components the uses walked to it apply, each use as the root
// read carries it or as a store keeps it, then the component drawing it; the same one
// twice running said once, but for the drawing itself, which ends it.
async function pathOf(chain: ReturnType<typeof drawingsAt>, root: Read, glass: Glass, read: Asking) {
  const carried = new Map((root.holons ?? []).map((holon) => [holon.id, holon]));
  const uses = [...new Set(chain.flatMap(({ at }) => at))];
  const kept = uses.filter((use) => !carried.has(use));
  const answer = kept.length
    ? await read(
        applyingEach(
          glass,
          "holon",
          kept.map((use) => [ref(use)]),
        ),
      )
    : undefined;
  const keptRead = answer && "value" in answer && Array.isArray(answer.value) ? answer.value : [];
  const bodies = new Map(
    kept.map((use, i) => {
      const each = keptRead[i];
      const body = isRecord(each ?? null) ? (each as Record<string, Value>).body : undefined;
      return [use, isRecord(body ?? null) ? (body as Record<string, Value>) : {}];
    }),
  );
  const fnOf = new Map(
    uses.map((use) => {
      const fn = ((carried.get(use)?.body ?? bodies.get(use) ?? {}) as Record<string, Value>).fn ?? null;
      return [use, isRef(fn) ? fn.$ref : undefined];
    }),
  );

  const fns = [...new Set([...fnOf.values()].filter((fn): fn is string => fn !== undefined))];
  const fnsRead = fns.length
    ? await read(
        applyingEach(
          glass,
          "holon",
          fns.map((id) => [ref(id)]),
        ),
      )
    : undefined;
  const each = fnsRead && "value" in fnsRead && Array.isArray(fnsRead.value) ? fnsRead.value : [];
  const components = new Map(
    fns.flatMap((id, i) => {
      const fn = isRecord(each[i] ?? null) ? (each[i] as Record<string, Value>) : undefined;
      if (!fn || !Array.isArray(fn.types) || !fn.types.includes("component")) return [];
      return [[id, typeof fn.name === "string" ? fn.name : "a component"] as const];
    }),
  );

  const path: { id: string; name: string }[] = [];
  const add = (id: string, name: string) => path.at(-1)?.name !== name && path.push({ id, name });
  const seen = new Set<string>();
  for (const [i, { at, component, name }] of chain.entries()) {
    for (const use of at) {
      if (seen.has(use)) continue;
      seen.add(use);
      const fn = fnOf.get(use);
      if (fn && components.has(fn)) add(fn, components.get(fn)!);
    }
    const said = name ?? components.get(component) ?? "a component";
    // The drawing itself ends the way, but where the use it stands for already does.
    if (i === chain.length - 1 && path.at(-1)?.id !== component) path.push({ id: component, name: said });
    else add(component, said);
  }
  return path;
}

// What a drawing was given, said short: a holon by its name, a read as the language says
// it, a drawing by what draws it, any other value as it is or by its shape.
async function givenSaid(given: Value, glass: Glass, read: Asking): Promise<Child> {
  if (given === null) return <span class="meta">nothing</span>;
  if (typeof given === "string") return <code>{clipped(JSON.stringify(given))}</code>;
  if (typeof given === "number" || typeof given === "boolean") return <code>{String(given)}</code>;
  if (isRef(given)) {
    const holon = await holonSaid(given.$ref, glass, read);
    return <a href={hrefTo(given.$ref)}>{holon?.name ?? "a holon"}</a>;
  }
  if (Array.isArray(given)) return <span class="meta">{`a list of ${given.length}`}</span>;
  if (isDrawing(given)) {
    const by = given.$draw ? (await holonSaid(given.$draw.$ref, glass, read))?.name : undefined;
    return <span class="meta">{by ? `drawn by ${by}` : "a drawing, its component found by type"}</span>;
  }
  if (isRecord(given) && "gives" in given) {
    const printed = await read(applying(glass, "print", given));
    if ("value" in printed && typeof printed.value === "string")
      return <code>{clipped(printed.value || "nothing")}</code>;
    return <span class="meta">a read</span>;
  }
  return <span class="meta">{`a record of ${Object.keys(given).join(", ")}`}</span>;
}

const clipped = (text: string) => (text.length > 120 ? `${text.slice(0, 119)}…` : text);

// A holon as the inspector says it: its name, what it is and where, and how the language
// says it.
async function holonSaid(id: string, glass: Glass, read: Asking) {
  const answer = await read(applying(glass, "holon", ref(id)));
  if (!("value" in answer) || !isRecord(answer.value)) return undefined;
  const { name, types, store } = answer.value as Record<string, Value>;
  const kinds = Array.isArray(types) ? types.filter((type) => typeof type === "string") : [];
  const printed = await read(applying(glass, "print", { gives: ref(id) }));
  const said = "value" in printed && typeof printed.value === "string" ? printed.value : undefined;
  return {
    id,
    name: typeof name === "string" ? name : kinds[0] ? `a ${kinds[0]}` : "Unnamed",
    kind: [kinds.join(", "), typeof store === "string" && `in ${store}`].filter(Boolean).join(" · "),
    ...(said && said !== `@${id}` && { said }),
  };
}

// What lays the page out: the function or component the root read's own use applies.
function layoutOf(root: Read): string | undefined {
  const gives = root.gives as { $ref?: string } | null;
  const use = root.holons?.find(({ id }) => id === gives?.$ref);
  const fn = use?.body.fn as { $ref?: string } | undefined;
  return fn?.$ref;
}
