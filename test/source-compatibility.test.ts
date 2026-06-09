import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const sourceRoot = new URL("../ts-src/", import.meta.url);

async function listTypeScriptFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: URL[] = [];

  for (const entry of entries) {
    const child = new URL(entry.name, `${directory.href}/`);
    if (entry.isDirectory()) {
      files.push(...await listTypeScriptFiles(child));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(child);
    }
  }

  return files;
}

test("source files avoid TypeScript syntax unsupported by Node strip-only tests", async () => {
  const files = await listTypeScriptFiles(sourceRoot);
  const offenders: string[] = [];
  const parameterPropertyPattern = /constructor\s*\([^)]*\b(?:private|public|protected)\s+(?:readonly\s+)?\w+/m;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (parameterPropertyPattern.test(source)) {
      offenders.push(file.pathname.replace(/.*\/ts-src\//, "ts-src/"));
    }
  }

  assert.deepEqual(offenders, []);
});
