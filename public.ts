import type { Resource } from "@farmfe/core";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

export default function wrapFetch(
  publicdir: string | false,
  resourcesMap: Record<string, Resource>,
  fetch: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return async function (
    input: string | URL | globalThis.Request,
    init?: RequestInit,
  ) {
    const req = new Request(input, init);
    if (req.method === "GET") {
      const url = new URL(req.url);
      if (!url.pathname.endsWith("/")) {
        const filepath = url.pathname.slice(1);
        if (typeof publicdir === "string" && filepath) {
          try {
            const fullpath = path.join(publicdir, filepath);
            const stat = await fs.promises.stat(fullpath);
            return new Response(
              Readable.toWeb(fs.createReadStream(fullpath)) as ReadableStream,
              {
                headers: {
                  "content-length": stat.size.toString(),
                },
              },
            );
          } catch (err) {
            if (err.code !== "ENOENT") {
              throw err;
            }
          }
        }

        if (filepath in resourcesMap) {
          return new Response(Uint8Array.from(resourcesMap[filepath].bytes));
        }
      }
    }

    return fetch(req);
  };
}
