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

/**
 * A React event object is emptied as soon as its handler returns, so reading
 * `event.currentTarget` from inside a `setState` updater — which runs later —
 * throws "Cannot read properties of null". In a client component that is an
 * uncaught exception, which means the error page. It happened three times in
 * the waiver builder: the drawn-signature checkbox and both header fields.
 *
 * Reading the value into a variable first is the fix, and this keeps it fixed.
 */
test("no event target is read inside a state updater", () => {
  const updater = /set[A-Z]\w*\(\s*\([^)]*\)\s*=>/g;
  const offenders: string[] = [];

  for (const path of sourceFiles("src").filter((p) => p.endsWith(".tsx"))) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(updater)) {
      // Walk to the closing paren of the updater call to get just its body.
      let depth = 1;
      let index = match.index + match[0].length;
      while (index < source.length && depth > 0) {
        const char = source[index];
        if (char === "(" || char === "[" || char === "{") depth += 1;
        else if (char === ")" || char === "]" || char === "}") depth -= 1;
        index += 1;
      }
      const body = source.slice(match.index + match[0].length, index);
      if (body.includes("currentTarget")) {
        offenders.push(`${path}:${source.slice(0, match.index).split("\n").length}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `read the value before calling setState — the event is empty by the time an updater runs:\n${offenders.join("\n")}`,
  );
});
