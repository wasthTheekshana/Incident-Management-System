/**
 * End-to-end API suite. Runs against an already-running API and its database:
 *
 *   npm run start            # in one terminal (or CI step) with a migrated + seeded database
 *   npm run test:e2e         # in another
 *
 * It prepares its own Super Admin password through Prisma, so no credentials are passed in. All records it
 * creates use unique names, so it can be re-run against the same database.
 *
 * Env: E2E_BASE_URL (default http://localhost:3000/api), E2E_ADMIN_EMAIL (default admin@cims.local; must exist
 *      - `npm run seed` with SEED_ADMIN_EMAIL creates it).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000/api';
const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? 'admin@cims.local').toLowerCase();
const PASSWORD = 'E2e-Passw0rd-x';
const TEMP_PASSWORD = 'E2e-Temp-Passw0rd-x';
const AUTH_THROTTLE_WINDOW_MS = 62_000; // login routes allow 10 requests per minute per client

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
};

class Client {
  cookie = '';

  async call(method, path, body, { form, raw } = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie?.startsWith('cims_sid=') && !setCookie.startsWith('cims_sid=;')) this.cookie = setCookie.split(';')[0];
    const text = await res.text();
    if (raw) return { status: res.status, res, text };
    let json;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
    return { status: res.status, body: json };
  }
}

const setPassword = async (email, password, mustChangePassword = false) =>
  prisma.user.update({
    where: { email },
    data: {
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      mustChangePassword,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

async function run() {
  if (!(await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } }))) {
    throw new Error(`Super Admin ${ADMIN_EMAIL} not found. Seed it first (SEED_ADMIN_EMAIL=${ADMIN_EMAIL} npm run seed).`);
  }

  // ---------- authentication ----------
  await setPassword(ADMIN_EMAIL, TEMP_PASSWORD, true);
  const admin = new Client();
  let r = await admin.call('POST', '/auth/login', { email: ADMIN_EMAIL, password: 'wrong-password1' });
  check('bad password rejected with a generic message', r.status === 401 && r.body.message === 'Invalid email or password', JSON.stringify(r));

  const loginRes = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ADMIN_EMAIL, password: TEMP_PASSWORD }) });
  const cookieHeader = loginRes.headers.get('set-cookie') ?? '';
  check('session cookie is HttpOnly + SameSite=Strict', /HttpOnly/i.test(cookieHeader) && /SameSite=Strict/i.test(cookieHeader), cookieHeader);
  r = await admin.call('POST', '/auth/login', { email: ADMIN_EMAIL, password: TEMP_PASSWORD });
  check('login with the temporary password succeeds', r.status === 200, JSON.stringify(r));
  r = await admin.call('GET', '/companies');
  check('forced password change blocks other routes (403)', r.status === 403, JSON.stringify(r));
  r = await admin.call('POST', '/auth/change-password', { currentPassword: TEMP_PASSWORD, newPassword: 'short' });
  check('weak new password rejected (400)', r.status === 400, JSON.stringify(r));
  r = await admin.call('POST', '/auth/change-password', { currentPassword: TEMP_PASSWORD, newPassword: PASSWORD });
  check('password change succeeds', r.status === 204, JSON.stringify(r));
  r = await admin.call('GET', '/companies');
  check('seeded companies are visible (>= 2)', r.status === 200 && r.body.length >= 2, JSON.stringify(r));
  const abs = r.body.find((c) => c.code === 'ABS');
  const dok = r.body.find((c) => c.code === 'DOK');

  const victim = new Client();
  for (let i = 0; i < 5; i++) await victim.call('POST', '/auth/login', { email: ADMIN_EMAIL, password: `nope-nope-${i}x1` });
  r = await victim.call('POST', '/auth/login', { email: ADMIN_EMAIL, password: PASSWORD });
  check('account locks after 5 failures (even the right password is refused)', r.status === 401, JSON.stringify(r));
  await setPassword(ADMIN_EMAIL, PASSWORD);
  await sleep(AUTH_THROTTLE_WINDOW_MS); // let the login throttle window reset before the next logins

  // ---------- users & company setup ----------
  const stamp = Date.now();
  const makeUser = async (name, email, companyIds, role = 'USER') => {
    const created = await admin.call('POST', '/users', { name, email, role, companyIds });
    if (created.status !== 201) throw new Error(`create ${email}: ${created.status} ${JSON.stringify(created.body)}`);
    await setPassword(email, PASSWORD);
    const client = new Client();
    const login = await client.call('POST', '/auth/login', { email, password: PASSWORD });
    if (login.status !== 200) throw new Error(`login ${email}: ${JSON.stringify(login.body)}`);
    return { id: created.body.id, client };
  };
  const responsible = await makeUser('Responsible Rita', `rita${stamp}@t.local`, [abs.id]);
  const reporter = await makeUser('Reporter Ravi', `ravi${stamp}@t.local`, [abs.id]);
  const outsider = await makeUser('Outsider Omar', `omar${stamp}@t.local`, [dok.id]);

  r = await admin.call('POST', '/users', { name: 'Dup', email: `rita${stamp}@t.local`, role: 'USER', companyIds: [abs.id] });
  check('duplicate email rejected (409)', r.status === 409, JSON.stringify(r));
  r = await reporter.client.call('POST', '/users', { name: 'X', email: `x${stamp}@t.local`, role: 'USER', companyIds: [abs.id] });
  check('a plain User cannot create users (403)', r.status === 403, JSON.stringify(r));
  r = await admin.call('POST', '/users', { name: 'Evil', email: `evil${stamp}@t.local`, role: 'SUPER_ADMIN', companyIds: [abs.id] });
  check('Super Admin accounts cannot be created through the API (403)', r.status === 403, JSON.stringify(r));

  r = await admin.call('PUT', `/companies/${abs.id}/responsible-people`, { responsiblePersonId: responsible.id, backupPersonId: null });
  check('responsible person is set', r.status === 200 && r.body.responsiblePerson.id === responsible.id, JSON.stringify(r));
  r = await admin.call('PUT', `/companies/${abs.id}/responsible-people`, { responsiblePersonId: outsider.id, backupPersonId: null });
  check('a non-member cannot be the responsible person (400)', r.status === 400, JSON.stringify(r));
  await admin.call('PUT', `/companies/${abs.id}/responsible-people`, { responsiblePersonId: responsible.id, backupPersonId: null });

  // ---------- template ----------
  r = await admin.call('POST', '/templates', {
    name: `Network outage ${stamp}`, defaultPriority: 'P2', companyIds: [abs.id],
    fields: [
      { label: 'Location', type: 'SHORT_TEXT', mandatory: true },
      { label: 'Severity', type: 'DROPDOWN', options: ['Minor', 'Major'], mandatory: false },
    ],
  });
  check('template created at version 1 with 2 fields', r.status === 201 && r.body.version === 1 && r.body.fields.length === 2, JSON.stringify(r));
  const template = r.body;
  const locationKey = template.fields[0].key;

  r = await reporter.client.call('GET', `/templates/available?companyId=${abs.id}`);
  check('reporter sees the active template', r.status === 200 && r.body.some((t) => t.id === template.id), JSON.stringify(r));
  r = await reporter.client.call('GET', `/templates/available?companyId=${dok.id}`);
  check("reporter cannot list another company's templates (403)", r.status === 403, JSON.stringify(r));

  // ---------- incident lifecycle ----------
  const newIncident = (extra = {}) => ({ companyId: abs.id, templateId: template.id, title: 'Switch down', description: 'Floor 2 offline', fieldValues: { [locationKey]: 'HQ' }, ...extra });

  r = await reporter.client.call('POST', '/incidents', newIncident({ fieldValues: {} }));
  check('missing mandatory template field rejected (400)', r.status === 400, JSON.stringify(r));
  r = await reporter.client.call('POST', '/incidents', newIncident({ fieldValues: { [locationKey]: 'HQ', injected: 'x' } }));
  check('unknown template field rejected (400)', r.status === 400, JSON.stringify(r));
  r = await reporter.client.call('POST', '/incidents', newIncident({ title: '=HYPERLINK("http://evil")' }));
  check('incident is numbered INC-YYYY-NNNNNN and auto-assigned', r.status === 201 && /^INC-\d{4}-\d{6}$/.test(r.body.number) && r.body.stage === 'ASSIGNED' && r.body.assigneeId === responsible.id, JSON.stringify(r));
  const incident = r.body;

  r = await reporter.client.call('GET', `/incidents/${incident.id}`);
  const minutes = (a, b) => Math.round((new Date(a) - new Date(b)) / 60000);
  check('SLA due times follow the P2 defaults (30 min / 8 h)', r.status === 200 && minutes(r.body.responseDueAt, r.body.createdAt) === 30 && minutes(r.body.resolutionDueAt, r.body.createdAt) === 480, JSON.stringify(r.body).slice(0, 300));
  r = await outsider.client.call('GET', `/incidents/${incident.id}`);
  check("another company's user gets 404 for the incident", r.status === 404, JSON.stringify(r));
  r = await outsider.client.call('GET', '/incidents');
  check("another company's user sees an empty list", r.status === 200 && r.body.total === 0, JSON.stringify(r.body));

  const stage = (client, to, comment) => client.call('POST', `/incidents/${incident.id}/stage`, { stage: to, comment });
  r = await stage(reporter.client, 'IN_PROGRESS');
  check('the reporter cannot work the incident (403)', r.status === 403, JSON.stringify(r));
  r = await stage(responsible.client, 'CLOSED');
  check('Assigned -> Closed is blocked (400)', r.status === 400, JSON.stringify(r));
  r = await stage(responsible.client, 'IN_PROGRESS');
  check('assignee moves it to In Progress', r.status === 200, JSON.stringify(r));
  r = await stage(responsible.client, 'PENDING');
  check('Pending requires a comment (400)', r.status === 400, JSON.stringify(r));
  r = await stage(responsible.client, 'PENDING', 'Waiting for vendor');
  check('Pending with a comment succeeds', r.status === 200, JSON.stringify(r));
  await sleep(1500);
  r = await stage(responsible.client, 'IN_PROGRESS');
  check('back to In Progress', r.status === 200, JSON.stringify(r));
  const paused = await prisma.incident.findUnique({ where: { id: incident.id }, select: { slaPausedMinutes: true, pausedAt: true } });
  check('pause time was accumulated and the clock resumed', paused.slaPausedMinutes >= 1 && paused.pausedAt === null, JSON.stringify(paused));

  r = await stage(responsible.client, 'RESOLVED', 'Fixed');
  check('Resolve is blocked without a root cause (400)', r.status === 400, JSON.stringify(r));
  r = await responsible.client.call('PUT', `/incidents/${incident.id}/root-cause`, { rootCauseText: 'Faulty PSU', correctiveAction: 'Replaced', resolutionNotes: 'Swapped PSU' });
  check('root cause saved as free text', r.status === 204, JSON.stringify(r));
  r = await stage(responsible.client, 'RESOLVED', 'Fixed');
  check('Resolve succeeds once root cause and notes exist', r.status === 200, JSON.stringify(r));
  r = await stage(responsible.client, 'CLOSED');
  check('the assignee cannot close (403)', r.status === 403, JSON.stringify(r));
  r = await stage(reporter.client, 'CLOSED');
  check('the reporter closes the incident', r.status === 200, JSON.stringify(r));
  r = await responsible.client.call('POST', `/incidents/${incident.id}/comments`, { body: 'post-close note' });
  check('commenting after close is still allowed', r.status === 201, JSON.stringify(r));

  r = await reporter.client.call('GET', `/incidents/${incident.id}`);
  const actions = r.body.history.map((h) => h.action);
  check('history recorded creation, stage changes and root cause', ['CREATED', 'STAGE_CHANGED', 'ROOT_CAUSE_RECORDED'].every((a) => actions.includes(a)), actions.join(','));
  const assignedEntry = r.body.history.find((h) => h.action === 'ASSIGNED');
  check('history shows names instead of ids', assignedEntry?.newValue === 'Responsible Rita', JSON.stringify(assignedEntry));
  const notifications = await prisma.notification.count({ where: { incidentId: incident.id } });
  check('notifications were created (in-app + email rows)', notifications >= 8, String(notifications));

  // ---------- attachments ----------
  const pdf = new Blob([Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')], { type: 'application/pdf' });
  const exe = new Blob([Buffer.from('MZ\x90\x00\x03\x00\x00\x00')], { type: 'application/pdf' });
  const second = (await reporter.client.call('POST', '/incidents', newIncident({ title: 'Second' }))).body;
  let form = new FormData();
  form.append('files', exe, 'invoice.pdf');
  r = await reporter.client.call('POST', `/incidents/${second.id}/attachments`, undefined, { form });
  check('an executable disguised as .pdf is rejected (400)', r.status === 400, JSON.stringify(r));
  form = new FormData();
  form.append('files', pdf, 'report.pdf');
  r = await reporter.client.call('POST', `/incidents/${second.id}/attachments`, undefined, { form });
  check('a real PDF is accepted', r.status === 201 && r.body[0].fileType === 'application/pdf', JSON.stringify(r));
  const attachment = r.body[0];
  r = await reporter.client.call('GET', `/incidents/${second.id}/attachments/${attachment.id}`, undefined, { raw: true });
  check('download is an attachment with nosniff', r.status === 200 && /attachment/.test(r.res.headers.get('content-disposition')) && r.res.headers.get('x-content-type-options') === 'nosniff', `${r.status} ${r.res.headers.get('content-disposition')}`);
  r = await outsider.client.call('GET', `/incidents/${second.id}/attachments/${attachment.id}`, undefined, { raw: true });
  check("another company's user cannot download it (404)", r.status === 404, String(r.status));

  // ---------- export & scoping ----------
  r = await admin.call('GET', '/incidents/export?format=csv', undefined, { raw: true });
  check('admin CSV export works', r.status === 200 && r.text.includes('INC-'), String(r.status));
  check('export neutralises formula injection in titles', r.text.includes(`"'=HYPERLINK`), r.text.slice(0, 300));
  r = await admin.call('GET', '/incidents/export?format=xlsx', undefined, { raw: true });
  check('admin XLSX export returns a zip container', r.status === 200 && r.text.startsWith('PK'), String(r.status));
  r = await reporter.client.call('GET', '/incidents/export?format=csv', undefined, { raw: true });
  check('a plain User cannot export (403)', r.status === 403, String(r.status));

  // ---------- configuration & session ----------
  r = await reporter.client.call('GET', '/settings');
  check('settings are Super Admin only (403)', r.status === 403, String(r.status));
  r = await admin.call('PUT', '/sla-config', { priorities: [{ priority: 'P1', responseMinutes: 60, resolutionMinutes: 30 }] });
  check('SLA with resolution shorter than response is rejected (400)', r.status === 400, JSON.stringify(r));
  r = await reporter.client.call('GET', '/incidents/mine');
  check('My Incidents counts what the user reported', r.status === 200 && Object.values(r.body.reported).reduce((a, b) => a + b, 0) >= 2, JSON.stringify(r.body));
  const logout = await reporter.client.call('POST', '/auth/logout');
  const after = await reporter.client.call('GET', '/auth/me');
  check('logout invalidates the session', logout.status === 204 && after.status === 401, `${logout.status}/${after.status}`);
}

try {
  await run();
} catch (error) {
  failed++;
  console.log(`FAIL  suite aborted -> ${error.message}`);
} finally {
  await prisma.$disconnect();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
