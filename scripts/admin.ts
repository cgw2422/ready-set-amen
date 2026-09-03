/**
 * Platform-admin access, granted from a shell.
 *
 *   npm run admin:grant  -- cgw2422@gmail.com
 *   npm run admin:revoke -- cgw2422@gmail.com
 *   npm run admin:list
 *
 * There is no HTTP route and no self-service for this: the role is what guards
 * the platform analytics, so it is only ever changed by someone with shell
 * access to the deployment. No password is set, read or printed here — the
 * account signs in through the ordinary login with its own password.
 */
import { prisma } from "../src/lib/db";

const command = process.argv[2] ?? "";
const rawEmail = process.argv[3] ?? "";

/** Matched the same way login does, so case and spacing never matter. */
function normalize(email: string): string {
  return email.trim().toLowerCase();
}

async function findUser(email: string) {
  if (!email) throw new Error("Pass an email address.");
  const user = await prisma.user.findUnique({
    where: { email: normalize(email) },
    select: { id: true, email: true, firstName: true, lastName: true, platformRole: true },
  });
  if (!user) {
    throw new Error(
      `No account for ${normalize(email)}. Create it through the normal signup first, then run this again.`,
    );
  }
  return user;
}

async function main() {
  switch (command) {
    case "grant": {
      const user = await findUser(rawEmail);
      if (user.platformRole === "PLATFORM_ADMIN") {
        console.log(`\n  ${user.email} is already a platform admin.\n`);
        return;
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { platformRole: "PLATFORM_ADMIN" },
      });
      // Identity and outcome only — never a password, token or session.
      console.log(`\n  Granted PLATFORM_ADMIN`);
      console.log(`  ${user.firstName} ${user.lastName} <${user.email}>`);
      console.log(`  at ${new Date().toISOString()}`);
      console.log(`\n  They can now sign in normally and open /admin.\n`);
      return;
    }

    case "revoke": {
      const user = await findUser(rawEmail);
      if (user.platformRole !== "PLATFORM_ADMIN") {
        console.log(`\n  ${user.email} is not a platform admin. Nothing to do.\n`);
        return;
      }
      await prisma.user.update({ where: { id: user.id }, data: { platformRole: "USER" } });
      console.log(`\n  Revoked PLATFORM_ADMIN`);
      console.log(`  ${user.firstName} ${user.lastName} <${user.email}>`);
      console.log(`  at ${new Date().toISOString()}`);
      console.log(`\n  Their ordinary account and church access are unchanged.\n`);
      return;
    }

    case "list": {
      const admins = await prisma.user.findMany({
        where: { platformRole: "PLATFORM_ADMIN" },
        select: { email: true, firstName: true, lastName: true, lastSignInAt: true },
        orderBy: { email: "asc" },
      });
      console.log("");
      if (admins.length === 0) console.log("  No platform admins.");
      for (const admin of admins) {
        const seen = admin.lastSignInAt ? admin.lastSignInAt.toISOString() : "never signed in";
        console.log(`  ${admin.firstName} ${admin.lastName} <${admin.email}> — ${seen}`);
      }
      console.log("");
      return;
    }

    default:
      console.error("\n  Use: grant | revoke | list");
      console.error("  e.g. npm run admin:grant -- you@example.com\n");
      process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
