/**
 * Production boot sequence.
 *
 * Plain JavaScript on purpose: this runs on the deployed image, where dev
 * dependencies may have been pruned, so it must not itself need a TypeScript
 * loader to start.
 *
 *   1. Apply pending migrations (safe and idempotent on every boot).
 *   2. Optionally load demo data, only when SEED_DEMO_DATA is explicitly set.
 *   3. Bind the port the platform gave us, on 0.0.0.0.
 *
 * Step 2 is opt-in because seeding rebuilds the demo organization. Leave the
 * variable unset — or remove it after your first look around — and real data is
 * never touched.
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

const seedRequested = ["1", "true", "yes"].includes(
  (process.env.SEED_DEMO_DATA ?? "").trim().toLowerCase(),
);

try {
  await run("npx", ["prisma", "migrate", "deploy"], "Applying database migrations");

  if (seedRequested) {
    await run("npx", ["--yes", "tsx", "prisma/seed.ts"], "Loading demo data (SEED_DEMO_DATA is set)");
    console.log("→ Demo data loaded. Unset SEED_DEMO_DATA to stop reloading it on every deploy.");
  }
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
