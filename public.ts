import type { Resource } from "@farmfe/core";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

function createResponseWithInferredContentType(
  reversedExtensionsMap: Record<string, string>,
  pathname: string,
  body: BodyInit,
  otherHeaders: Record<string, string> = {},
): Response {
  const headers = { ...otherHeaders };
  const ext = path.extname(pathname).split(".").pop() ?? "";
  if (ext in reversedExtensionsMap) {
    headers["content-type"] = reversedExtensionsMap[ext];
  }

  return new Response(body, { headers });
}

export default function wrapFetch(
  publicdir: string | false,
  resourcesMap: Record<string, Resource>,
  extensionsMap: Record<string, string>,
  fetch: typeof globalThis.fetch,
): typeof globalThis.fetch {
  const reversedExtensionsMap = Object.fromEntries(
    Object.entries(extensionsMap).map(([k, v]) => [v, k]),
  );
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
            return createResponseWithInferredContentType(
              reversedExtensionsMap,
              filepath,
              Readable.toWeb(fs.createReadStream(fullpath)) as ReadableStream,
              {
                "content-length": stat.size.toString(),
              },
            );
          } catch (err) {
            if (err.code !== "ENOENT") {
              throw err;
            }
          }
        }

        if (filepath in resourcesMap) {
          return createResponseWithInferredContentType(
            reversedExtensionsMap,
            filepath,
            Uint8Array.from(resourcesMap[filepath].bytes),
            {},
          );
        }
      }
    }

    return fetch(req);
  };
}
