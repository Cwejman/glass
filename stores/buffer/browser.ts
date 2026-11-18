// Entry for running a buffer in a browser Worker, as every store the engine mounts is
// started: it holds only the present, in memory, so it is begun again with each page.

import { buffer } from "./buffer.ts";

export default () => buffer();
