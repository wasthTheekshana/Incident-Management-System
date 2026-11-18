/**
 * Idempotent bootstrap data: the two SRS companies, FR-17 SLA defaults, default root causes and (optionally) a
 * Super Admin. Plain JavaScript on purpose so it runs inside the production image, which has no TypeScript tooling:
 *
 *   node prisma/seed.js                                   # reference data only
 *   SEED_ADMIN_EMAIL=you@company.com node prisma/seed.js # also create the first Super Admin
 *
 * The Super Admin password comes from SEED_ADMIN_PASSWORD; if unset a random one is generated and printed once.
 * Either way the account must change it at first login.
 */
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const { randomBytes } = require('crypto');

const prisma = new PrismaClient();

const SLA = [
  { priority: 'P1', responseMinutes: 15, resolutionMinutes: 240 },
  { priority: 'P2', responseMinutes: 30, resolutionMinutes: 480 },
  { priority: 'P3', responseMinutes: 120, resolutionMinutes: 2880 },
  { priority: 'P4', responseMinutes: 240, resolutionMinutes: 7200 },
];

const COMPANIES = [
  { name: 'AB Securitas (Pvt) Ltd', code: 'ABS' },
  { name: 'DOK Solutions Lanka (Pvt) Ltd', code: 'DOK' },
];

const ROOT_CAUSES = ['Hardware failure', 'Software defect', 'Configuration error', 'Network issue', 'User error', 'Third-party / vendor'];

async function main() {
  for (const row of SLA) {
    await prisma.prioritySLA.upsert({ where: { priority: row.priority }, update: {}, create: row });
  }
  for (const company of COMPANIES) {
    await prisma.company.upsert({ where: { code: company.code }, update: {}, create: company });
  }
  if ((await prisma.rootCause.count()) === 0) {
    await prisma.rootCause.createMany({ data: ROOT_CAUSES.map((name) => ({ name })) });
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!email) {
    console.log('SEED_ADMIN_EMAIL not set: skipped Super Admin creation.');
    return;
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log('Super Admin already exists.');
    return;
  }

  // `||` not `??`: an empty SEED_ADMIN_PASSWORD (as in .env.example) must never become the password.
  const provided = (process.env.SEED_ADMIN_PASSWORD ?? '').trim();
  // The generated one satisfies the password policy (lowercase, capital, number, special character, 10+ characters).
  const password = provided || `${randomBytes(9).toString('base64url')}aA1!`;
  const companies = await prisma.company.findMany({ select: { id: true } });
  await prisma.user.create({
    data: {
      name: 'Super Admin',
      email,
      role: 'SUPER_ADMIN',
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      mustChangePassword: true,
      companies: { create: companies.map((c) => ({ companyId: c.id })) },
    },
  });
  console.log(`Super Admin created: ${email}`);
  if (!provided) console.log(`Temporary password (shown once): ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
