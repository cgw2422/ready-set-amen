/**
 * A "use server" module may export nothing but async functions. Next.js only
 * notices a violation at runtime, and when it does, *every* action in that file
 * throws — so exporting one stray constant takes down whichever page happens to
 * import an action from it, with an error that names neither the export nor the
 * page. This walks the source instead, so the violation is caught here.
 *
 *   npm test
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** Files whose first statement is "use server" — the whole module is actions. */
function serverActionModules(): string[] {
  return sourceFiles("src").filter((path) =>
    /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*["']use server["']/.test(readFileSync(path, "utf8")),
  );
}

test("every \"use server\" module exports only async functions", () => {
  const offences: string[] = [];

  for (const path of serverActionModules()) {
    const source = readFileSync(path, "utf8");
    for (const [index, line] of source.split("\n").entries()) {
      const at = `${path}:${index + 1}`;
      // `export type` and `export interface` are erased before runtime.
      if (/^export\s+(type|interface)\b/.test(line)) continue;

      if (/^export\s+(const|let|var|class|enum)\b/.test(line)) {
        offences.push(`${at} — exports a value, not an async function: ${line.trim()}`);
      }
      if (/^export\s+function\b/.test(line)) {
        offences.push(`${at} — exported function is not async: ${line.trim()}`);
      }
      if (/^export\s*\{/.test(line)) {
        offences.push(`${at} — re-export cannot be verified as async: ${line.trim()}`);
      }
      if (/^export\s+default\s+(?!async\b)/.test(line)) {
        offences.push(`${at} — default export is not an async function: ${line.trim()}`);
      }
    }
  }

  assert.deepEqual(offences, [], `\n${offences.join("\n")}\n`);
});

test("there are server action modules to check in the first place", () => {
  // Guards the detector itself: a broken regex would silently pass the test above.
  assert.ok(serverActionModules().length >= 5);
});
