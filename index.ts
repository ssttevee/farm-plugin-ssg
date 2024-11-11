import type {
  JsPlugin,
  PluginFinalizeResourcesHookParams,
  Resource,
} from "@farmfe/core";
import type { FixExtensionHook, ScrapeLinksHook } from "website-archiver-lib";
import path from "node:path";
import fs from "node:fs";
import { TempFileManager } from "./temp.js";
import publicWrapFetch from "./public.js";
import downloadResources from "website-archiver-lib/download";

export interface GetFetchHook {
  (
    module: any,
    resourcesMap: Record<string, Resource>,
  ): typeof globalThis.fetch;
}

function defaultGetFetch(module: any): typeof globalThis.fetch {
  return (input, init) => module.default.fetch(input, init);
}

export interface EntrypointMatcher {
  (resource: Resource): boolean;
}

function makeDefaultEntrypointMatcher(name?: string): EntrypointMatcher {
  return (r) =>
    r.resourceType === "js" &&
    r.info?.data?.isEntry === true &&
    (!name || r.name === name);
}

export interface SSGOptions {
  /**
   * The name of or a predicate to select the entrypoint module to use for the
   * static site generation.
   *
   * If no entrypoint is matched, no static site generation is performed.
   *
   * By default, the first encountered entrypoint module is used.
   */
  entrypoint?: string | EntrypointMatcher;

  /**
   * Whether to remove the entrypoint module from the final bundle.
   *
   * This is useful when the entrypoint module is only used for static site
   * generation and is not needed thereafter.
   *
   * Defaults to `false`.
   */
  removeEntrypoint?: boolean;

  /**
   * The base url passed to the fetch function and used to scope additional
   * fetch calls.
   *
   * This does not need to be set for most cases, unless the fetch handler is
   * multi-tenant and returns different content based on origin or hostname.
   *
   * Defaults to "http://localhost/".
   */
  baseurl?: string;

  /**
   * The paths to fetch on the server.
   *
   * Always includes the pathname from the `baseurl`.
   */
  entrypaths?: string[];

  /**
   * The number of concurrent fetches to make.
   *
   * Note that this is not the number of threads or workers. Performance changes
   * from changing this number are subject to regular javascript event loop
   * considerations. That is to say, IO-bound routes will likely see greater
   * benefit than CPU-bound routes.
   *
   * Defaults to 2.
   */
  concurrency?: number;

  /**
   * Path to a directory to read public assets from.
   *
   * If set to `false`, public directory is not used.
   *
   * Defaults to "public".
   */
  publicdir?: string | false;

  /**
   * A callback to get the fetch function from a module.
   *
   * It is possible to wrap the fetch function inject SSG specific fetch logic
   * here. This is the same technique used to access to the build resources
   * before they are written to disk.
   *
   * The default behaviour is to use the fetch property of the default export
   * from the entrypoint module. That mirrors the interface for Cloudflare
   * Workers ES Modules.
   */
  getFetch?: GetFetchHook;

  /**
   * A callback to add missing file extensions to pathnames.
   *
   * This can be overridden with a custom function or a simple mapping of
   * content types to file extensions. Extensions are expected to exclude the
   * leading dot.
   *
   * By default, only "text/html" content is handled.
   */
  fixextension?: FixExtensionHook | Record<string, string>;

  /**
   * A callback to discover links from the body of a response to be further
   * generated.
   *
   * This can be overridden with a single function or a mapping of content types
   * to functions that return an iterable of links.
   *
   * Note that discovered links are still subject to filtering by the `baseurl`.
   *
   * By default, only html and css content is searched for links. See
   * [website-archiver-lib](https://github.com/ssttevee/website-archiver-lib/tree/trunk/links)
   * for more information.
   */
  scrapelinks?:
    | ScrapeLinksHook
    | Record<
        string,
        (body: ReadableStream<Uint8Array>) => Promise<Iterable<string>>
      >;
}

/**
 * A Farm plugin to perform static site generation.
 *
 * This plugin is designed to be used with builds that generate a standard fetch
 * handler like those used for Cloudflare Workers or `Deno.serve`.
 */
export default function ssg(options?: SSGOptions): JsPlugin {
  const publicdir =
    options?.publicdir !== false
      ? path.resolve(options?.publicdir ?? "public")
      : false;
  return {
    name: "farm-plugin-ssg",

    priority: 90, // lower than the default 100

    finalizeResources: {
      async executor({ resourcesMap }) {
        const entry = Object.values(resourcesMap).find(
          typeof options?.entrypoint === "function"
            ? options.entrypoint
            : makeDefaultEntrypointMatcher(options?.entrypoint),
        );
        if (entry) {
          await using tmp = new TempFileManager("node_modules/.farm/ssg");

          const appjs = await tmp.create("app.mjs");
          await fs.promises.writeFile(appjs, Uint8Array.from(entry.bytes));

          await downloadResources("http://localhost", {
            entrypaths: options?.entrypaths,
            onfetch: publicWrapFetch(
              publicdir,
              resourcesMap,
              (options?.getFetch ?? defaultGetFetch)(
                await import(appjs),
                resourcesMap,
              ),
            ),
            dest: {
              async createWritableStream(pathname) {
                const chunks: Uint8Array[] = [];
                return new WritableStream({
                  write(chunk) {
                    chunks.push(chunk);
                  },
                  close() {
                    const name = pathname.slice(1);
                    resourcesMap[name] = {
                      name,
                      bytes: Array.from(Buffer.concat(chunks)),
                      emitted: false,
                      resourceType: name.split(".").slice(-1)[0],
                      origin: entry.origin,
                    };
                  },
                });
              },
            },
          });

          if (options?.removeEntrypoint) {
            delete resourcesMap[entry.name];
          }
        }

        return resourcesMap;
      },
    },
  };
}
