// The location started on a machine, as under a test's DOM: it comes with its own store,
// the .glass beside this file; whoever starts it gives only its scope.

import { join } from "node:path";
import { open } from "../../stores.ts";
import { locationStore, type Scope } from "./location.ts";

export default ({ scope }: { scope?: Scope } = {}) =>
  locationStore(open(join(import.meta.dir, ".glass")), scope);
