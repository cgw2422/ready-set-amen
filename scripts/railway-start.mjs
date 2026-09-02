/**
 * Production boot sequence.
 *
 * Plain JavaScript on purpose: this runs on the deployed image, where dev
 * dependencies may have been pruned, so it must not itself need a TypeScript
 * loader to start.
 *
 *   1. Apply pending migrations (safe and idempotent on every boot).
 *   2. Bind the port the platform gave us, on 0.0.0.0.
 *
 * Boot deliberately does not seed anything. The showcase organization is
 * managed on purpose with `npm run demo:seed` / `demo:reset`, not recreated
 * behind your back on every deploy — a restart during a demonstration would
 * otherwise wipe whatever you were showing.
 */
import { spawn } from "node:child_process";

const PORT = process.env.PORT ?? "3000";

function run(command, args, label) {
  return new Promise((resolve, reject) => {
    console.log(`→ ${label}`);
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${label} exited with code ${code}`)),
    );
  });
}

try {
  await run("npx", ["prisma", "migrate", "deploy"], "Applying database migrations");
} catch (error) {
  // A server that cannot reach its database should fail loudly at boot rather
  // than serve a broken app and pass a shallow health check.
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
}

console.log(`→ Starting Ready. Set. Amen. on 0.0.0.0:${PORT}`);
const server = spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", PORT], {
  stdio: "inherit",
  env: process.env,
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
