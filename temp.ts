import path from "node:path";
import fs from "node:fs";

export class TempFileManager implements AsyncDisposable {
  #dirname: string;
  #files: string[] = [];
  constructor(dirname: string) {
    this.#dirname = path.resolve(dirname);
  }

  async create(name: string): Promise<string> {
    const ext = path.extname(name);
    name =
      name.slice(0, -ext.length) +
      "." +
      Math.random().toString(36).slice(2) +
      ext;
    const fullpath = path.join(this.#dirname, name);
    await fs.promises.mkdir(path.dirname(fullpath), { recursive: true });
    this.#files.push(name);
    return fullpath;
  }

  async [Symbol.asyncDispose]() {
    for (const file of this.#files) {
      try {
        await fs.promises.unlink(path.join(this.#dirname, file));
      } catch {
        // ignore
      }

      const segments = file.split("/").slice(0, -1);
      while (true) {
        try {
          await fs.promises.rmdir(path.join(this.#dirname, ...segments));
        } catch {
          break;
        }

        if (!segments.length) {
          break;
        }

        segments.pop();
      }
    }
  }
}
