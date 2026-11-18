/**
 * Unlocks a user account from the command line. Accounts lock after repeated wrong passwords and stay locked until an
 * administrator unlocks them (docs/password-policy.md). Admins do that from the Users screen; this script is for the
 * case where nobody can sign in, for example when the only Super Admin is locked. Plain JavaScript on purpose so it
 * runs inside the production image:
 *
 *   docker compose -f docker-compose.prod.yml run --rm api node prisma/unlock.js you@company.com
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: node prisma/unlock.js <email>');
    process.exitCode = 2;
    return;
  }
  const result = await prisma.user.updateMany({
    where: { email },
    data: { lockedUntil: null, failedLoginAttempts: 0, lastFailedLoginAt: null },
  });
  console.log(result.count ? `Unlocked ${email}` : `No user found with email ${email}`);
  if (!result.count) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
