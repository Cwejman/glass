// Laying a render over the one before: what is the same is kept, a drawing's host is
// only ever put in place, and handlers follow the newest render.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { beforeAll, expect, test } from "bun:test";
import { listen, morph, type Hosts } from "./morph.ts";

beforeAll(() => {
  if (!globalThis.document) GlobalRegistrator.register({ url: "https://glass.test/" });
});

// Hosts as the chassis keeps them: the host each stand-in names, and which nodes are hosts.
function hostsOf() {
  const standIns = new WeakMap<Node, Node>();
  const hostNodes = new WeakSet<Node>();
  const hosts: Hosts = { hostOf: (node) => standIns.get(node), isHost: (node) => hostNodes.has(node) };
  const hosting = (host: Node) => {
    hostNodes.add(host);
    const standIn = document.createComment("");
    standIns.set(standIn, host);
    return standIn;
  };
  return { hosts, hosting };
}

const div = (name: string, ...within: (Node | string)[]) => {
  const made = document.createElement("div");
  made.className = name;
  made.append(...within);
  return made;
};

test("what is the same is kept and changed in place, what differs replaced", () => {
  const { hosts } = hostsOf();
  const input = document.createElement("input");
  const before = div("form", div("label", "one"), input);
  const kept = morph(before, div("form", div("label", "two"), document.createElement("input")), hosts);

  expect(kept).toBe(before);
  expect(before.querySelector("input")).toBe(input);
  expect(before.textContent).toBe("two");
  expect(morph(before, document.createElement("p"), hosts)).not.toBe(before);
});

test("a host is put where its stand-in stands, never laid over what stood there", () => {
  const { hosts, hosting } = hostsOf();
  const host = div("drawn", div("value", "drawing"));
  const before = div("shown", div("record", "old record"));

  const shown = morph(before, div("shown", hosting(host)), hosts) as Element;
  expect(shown.firstChild).toBe(host);
  expect(host.textContent).toBe("drawing");
});

test("a host already in place stays, untouched, as what is around it changes", () => {
  const { hosts, hosting } = hostsOf();
  const host = div("drawn", "drawing");
  const before = morph(undefined, div("list", hosting(host)), hosts) as Element;

  morph(before, div("list", div("added"), hosting(host)), hosts);
  expect(before.lastChild).toBe(host);
  expect(before.textContent).toBe("drawing");
});

test("a handler dropped and given again is called once", () => {
  const { hosts } = hostsOf();
  let pressed = 0;
  const button = () => document.createElement("button");
  const first = button();
  listen(first, "click", () => pressed++);
  const shown = morph(first, button(), hosts);
  const again = button();
  listen(again, "click", () => pressed++);
  (morph(shown, again, hosts) as HTMLElement).click();
  expect(pressed).toBe(1);
});
