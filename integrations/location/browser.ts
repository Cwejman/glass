// The location started in a browser, on the page's own thread, where the address and the
// history are: it comes with its own store, as the site publishes it, read by strata in
// a worker of its own; whoever starts it gives only its scope.

import { workers } from "../../runtime/runtime.ts";
import type { Store } from "../../stores/store.ts";
import { locationStore, type Scope } from "./location.ts";

const strataCode = new URL("../../stores/strata/browser.ts", import.meta.url);

export default async ({ scope }: { scope?: Scope } = {}) =>
  locationStore(
    await workers().run<Store>(strataCode, {
      folder: "location",
      from: new URL("/strata/location/", globalThis.location.origin).href,
      whole: true,
    }),
    scope,
  );
