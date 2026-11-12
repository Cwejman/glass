// The host on this machine: it serves the built site and each store live from its
// folder, as a static host would, and runs one engine over those same stores that every
// page it serves mounts to, over a socket, so nothing is polled. The stores are attached
// only to be read, each taken again when its ref moves, whoever wrote it; the home is a
// folder of the host's own, the one store written here, and held by one host at a time.
// A page is told the engine is here by the host, so the same build published elsewhere
// starts an engine of its own.

import { mkdirSync, watch } from "node:fs";
import { join, normalize } from "node:path";
import { startEngine } from "../engine/compat.ts";
import type { Message } from "../engine/serve/protocol.ts";
import { serving } from "../engine/serve/serving.ts";
import { folderFiles, lockAt } from "../integrations/glass/folder.ts";
import { openStore, type Store } from "../integrations/glass/store.ts";

type Hosting = {
  port: number;
  // Each store by the name it is attached and served by, and the folder that keeps it.
  stores: Record<string, string>;
  home: string;
  site: string;
};

// Where a page finds its engine, and what the host calls the store written here.
const enginePath = "/engine";
const homeKey = "home";

// A store opened from its folder, keeping the blocks read before: a block is named by its
// hash, so one read is never wrong, and a store renewed after a commit reads only the new.
function opener() {
  const read = new Map<string, Store["blocks"]>();

  return (folder: string) => {
    const blocks = read.get(folder) ?? new Map();
    read.set(folder, blocks);
    return openStore(folderFiles(folder), blocks);
  };
}

// Only the host's own pages may speak to its engine: any page on the web could open a
// socket to this machine otherwise.
const ownHosts = (port: number) => [`127.0.0.1:${port}`, `localhost:${port}`];
const ownOrigins = (port: number) => ownHosts(port).map((host) => `http://${host}`);

// The home held by this host alone, for as long as it runs: two engines writing one
// store would each write over what the other wrote. Its lock is a store's own kind, so
// one left by a host no longer running is taken over.
function holdHome(home: string) {
  try {
    return lockAt(join(home, "host.lock"));
  } catch (error) {
    throw new Error(`another host holds ${home}: ${(error as Error).message}`);
  }
}

// A store taken again a moment after its ref moves, so a commit's several writes are one.
// Its refs folder is made if the store was never written, so its first write is heard.
function whenMoved(folder: string, moved: () => void) {
  const refs = join(folder, "refs");
  let waiting: Timer | undefined;
  let watcher: ReturnType<typeof watch> | undefined;

  const arm = () => {
    mkdirSync(refs, { recursive: true });
    watcher = watch(refs, () => {
      clearTimeout(waiting);
      waiting = setTimeout(moved, 50);
    });

    // A watch that fails is armed again, and the store read again in case it moved.
    watcher.on("error", (error) => {
      console.error(`${refs} is no longer watched, and is watched again:`, error);
      watcher?.close();
      setTimeout(() => (arm(), moved()), 1000);
    });
  };
  arm();

  return () => {
    clearTimeout(waiting);
    watcher?.close();
  };
}

// The moves of one store taken in turn, each reading the store as it stands when its turn
// comes, so an older read never lands after a newer one; one that fails is tried again.
function inTurns(renew: () => Promise<void>, key: string) {
  let turns = Promise.resolve();

  return () => {
    turns = turns.then(() =>
      renew().catch(() =>
        Bun.sleep(200)
          .then(renew)
          .catch((error) => console.error(`${key} could not be taken again:`, error)),
      ),
    );
  };
}

// A socket's text as a message, or a refusal saying why it is none.
function messageOf(text: string): Message {
  let message: unknown;

  try {
    message = JSON.parse(text);
  } catch {
    throw new Error(`${text.slice(0, 60)} is not a message`);
  }

  const { id, op } = (message ?? {}) as { id?: unknown; op?: unknown };
  if (typeof id !== "number" || typeof op !== "string")
    throw new Error(`${text.slice(0, 60)} is not a message: it says no id and no op`);

  return message as Message;
}

export async function host({ port, stores, home, site }: Hosting) {
  if (Object.hasOwn(stores, homeKey))
    throw new Error(`no store may be called ${homeKey}: home is the host's own`);

  const letHomeGo = holdHome(home);
  const open = opener();
  const engine = await startEngine([
    ...(await Promise.all(
      Object.entries(stores).map(async ([key, folder]) => ({ key, store: await open(folder) })),
    )),
    { key: homeKey, store: await open(home), write: true as const },
  ]);

  const unwatch = Object.entries(stores).map(([key, folder]) =>
    whenMoved(
      folder,
      inTurns(async () => engine.renew(key, await open(folder)), key),
    ),
  );

  // Where a path is kept: a store's files in its folder, anything else in what was built.
  function fileOf(path: string) {
    const [, first, name, ...rest] = path.split("/");

    if (first === "stores" && name && Object.hasOwn(stores, name))
      return Bun.file(join(stores[name]!, ...rest));

    return Bun.file(join(site, path.endsWith("/") ? `${path}index.html` : path));
  }

  // The page, told its engine is here; a page that names no site is no page to start.
  async function pageOf(file: Bun.BunFile) {
    const page = await file.text();
    if (!page.includes("data-site=")) throw new Error(`${file.name} names no site to start from`);
    return page.replace("data-site=", `data-engine="${enginePath}" data-site=`);
  }

  const headers = { "access-control-allow-origin": "*", "cache-control": "no-cache" };

  const server = Bun.serve<{ serve?: ReturnType<typeof serving> }, never>({
    port,
    hostname: "127.0.0.1",

    async fetch(request, server) {
      const path = normalize(decodeURIComponent(new URL(request.url).pathname));

      if (path === enginePath) {
        const ours =
          ownHosts(server.port!).includes(request.headers.get("host") ?? "") &&
          ownOrigins(server.port!).includes(request.headers.get("origin") ?? "");
        if (!ours) return new Response("this engine answers only its own pages", { status: 403 });

        return server.upgrade(request, { data: {} })
          ? undefined
          : new Response("a socket was asked for", { status: 400 });
      }

      const file = fileOf(path);
      if (!path.startsWith("/") || path.includes("..") || !(await file.exists()))
        return new Response("not here", { status: 404 });

      if (file.name?.endsWith("index.html"))
        return new Response(await pageOf(file), {
          headers: { ...headers, "content-type": "text/html; charset=utf-8" },
        });

      return new Response(file, { headers });
    },

    websocket: {
      // Each page its own serving: what it subscribes to, told to it alone.
      open(socket) {
        socket.data.serve = serving(engine, {
          attach: async () => {
            throw new Error("this engine attaches only the stores its host serves");
          },
          send: (reply) => socket.send(JSON.stringify(reply)),
        });
      },

      // What is no message is answered as id 0, which no message is ever given.
      message(socket, text) {
        try {
          void socket.data.serve?.receive(messageOf(String(text)));
        } catch (error) {
          socket.send(JSON.stringify({ id: 0, ok: false, error: (error as Error).message }));
        }
      },

      close: (socket) => socket.data.serve?.close(),
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}/`,
    engine,
    stop() {
      unwatch.forEach((stop) => stop());
      server.stop(true);
      void letHomeGo();
    },
  };
}
