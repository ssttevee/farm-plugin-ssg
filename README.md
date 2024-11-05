# farm-plugin-ssg

This is a static site generation plugin for [farm](https://github.com/farm-fe/farm). It is mainly a wrapper around [website-archiver-lib](https://github.com/ssttevee/website-archiver-lib).

This plugin is designed to be used with builds that generate a standard fetch handler like those used for Cloudflare Workers or `Deno.serve`. Non-conformant builds may be adapted with the `getFetch` option.

Note that this will increase your build time depending on the number of routes to generate and the work being done on each route. Highly IO-bound routes may benefit from an increased `concurrency` value.

WARNING: API stability is not guaranteed, please pin to a specific version in your `package.json`.

## Installation

```sh
npm install farm-plugin-ssg
```

## Usage

```ts
// farm.config.ts
import ssg from 'farm-plugin-ssg';

import { defineConfig } from "@farmfe/core";
import ssg from "farm-plugin-ssg";

export default defineConfig({
  // ...
  plugins: [
    ssg(),
  ],
});
```

## Options

Please refer to the typescript definitions for more in-depth information.

- `entrypoint` - The name of or a predicate to select the entrypoint module to use for the static site generation.
- `removeEntrypoint` - Whether to remove the entrypoint module from the final bundle.
- `baseurl` - The base url passed to the fetch function and used to scope additional fetch calls.
- `entrypaths` - The paths to fetch on the server.
- `concurrency` - The number of concurrent fetches to make.
- `publicdir` - Path to a directory to read public assets from.
- `getFetch` - A callback to get the fetch function from a module.
- `fixextension` - A callback to add missing file extensions to pathnames.
- `scrapelinks` - A callback to discover links from the body of a response to be further generated.
