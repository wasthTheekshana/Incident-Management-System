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
      lastFailedLoginAt: null,
      lockedUntil: null,
      passwordChangedAt: new Date(Date.now() - 2 * 86_400_000),
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
  r = await admin.call('POST', '/auth/change-password', { currentPassword: TEMP_PASSWORD, newPassword: 'alllowercase123' });
  check('a password missing a capital letter and a special character is rejected (400) and says why', r.status === 400 && /capital letter/.test(r.body.message) && /special character/.test(r.body.message), JSON.stringify(r));
  r = await admin.call('POST', '/auth/change-password', { currentPassword: TEMP_PASSWORD, newPassword: 'Admin-Passw0rd-x' });
  check('a password containing the account name is rejected (400)', r.status === 400 && /name or email/.test(r.body.message), JSON.stringify(r));
  r = await admin.call('POST', '/auth/change-password', { currentPassword: TEMP_PASSWORD, newPassword: TEMP_PASSWORD });
  check('the new password must differ from the temporary one (400)', r.status === 400, JSON.stringify(r));
  r = await admin.call('POST', '/auth/change-password', { currentPassword: TEMP_PASSWORD, newPassword: PASSWORD });
  check('password change succeeds', r.status === 204, JSON.stringify(r));
  r = await admin.call('GET', '/companies');
  check('seeded companies are visible (>= 2)', r.status === 200 && r.body.length >= 2, JSON.stringify(r));
  const abs = r.body.find((c) => c.code === 'ABS');
  const dok = r.body.find((c) => c.code === 'DOK');

  const victim = new Client();
  for (let i = 0; i < 3; i++) await victim.call('POST', '/auth/login', { email: ADMIN_EMAIL, password: `nope-nope-${i}x1` });
  r = await victim.call('POST', '/auth/login', { email: ADMIN_EMAIL, password: PASSWORD });
  check('account locks after 3 failures (even the right password is refused)', r.status === 401, JSON.stringify(r));
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

  // ---------- password policy: temporary passwords, forced change, history, age, lockout ----------
  await sleep(AUTH_THROTTLE_WINDOW_MS); // start these sign-ins in a fresh throttle window
  r = await new Client().call('GET', '/auth/password-policy');
  check('the policy endpoint is public and states the enforced numbers', r.status === 200 && r.body.minLength === 10 && r.body.historyCount === 3 && r.body.maxAgeDays === 90 && r.body.minAgeDays === 1 && r.body.lockoutThreshold === 3, JSON.stringify(r));

  r = await admin.call('POST', '/users', { name: 'Policy Pat', email: `pat${stamp}@t.local`, role: 'USER', companyIds: [abs.id], temporaryPassword: 'weakpass' });
  check('an admin-typed temporary password must meet the policy (400)', r.status === 400 && /policy/.test(r.body.message), JSON.stringify(r));
  r = await admin.call('POST', '/users', { name: 'Policy Pat', email: `pat${stamp}@t.local`, role: 'USER', companyIds: [abs.id], temporaryPassword: 'Tmp-Passw0rd-9x' });
  check('an admin can set the temporary password; it is shown once in the response', r.status === 201 && r.body.temporaryPassword === 'Tmp-Passw0rd-9x', JSON.stringify(r));
  const pat = { id: r.body.id, email: `pat${stamp}@t.local`, client: new Client() };
  r = await admin.call('POST', '/users', { name: 'Gen Gina', email: `gina${stamp}@t.local`, role: 'USER', companyIds: [abs.id] });
  check('without one, the system generates a temporary password that meets the policy', r.status === 201 && typeof r.body.temporaryPassword === 'string' && r.body.temporaryPassword.length >= 10 && /[a-z]/.test(r.body.temporaryPassword) && /[A-Z]/.test(r.body.temporaryPassword) && /[0-9]/.test(r.body.temporaryPassword) && /[^A-Za-z0-9]/.test(r.body.temporaryPassword), JSON.stringify(r));
  const gina = { id: r.body.id, email: `gina${stamp}@t.local`, temp: r.body.temporaryPassword, client: new Client() };
  r = await gina.client.call('POST', '/auth/login', { email: gina.email, password: gina.temp });
  check('a user can sign in with the generated temporary password', r.status === 200, JSON.stringify(r));

  r = await pat.client.call('POST', '/auth/login', { email: pat.email, password: 'Tmp-Passw0rd-9x' });
  check('a user can sign in with the admin-typed temporary password', r.status === 200, JSON.stringify(r));
  r = await pat.client.call('GET', '/companies');
  check('until the password is changed every other route is blocked (403)', r.status === 403, JSON.stringify(r));
  r = await pat.client.call('POST', '/auth/change-password', { currentPassword: 'Tmp-Passw0rd-9x', newPassword: 'Policy-Passw0rd-9' });
  check("a new password containing the user's name is rejected (400)", r.status === 400 && /name or email/.test(r.body.message), JSON.stringify(r));
  r = await pat.client.call('POST', '/auth/change-password', { currentPassword: 'Tmp-Passw0rd-9x', newPassword: 'Fresh-Passw0rd-1x' });
  check('the user sets a compliant password at first login (204)', r.status === 204, JSON.stringify(r));
  r = await pat.client.call('GET', '/companies');
  check('after the change the account works normally', r.status === 200, JSON.stringify(r));
  r = await pat.client.call('POST', '/auth/change-password', { currentPassword: 'Fresh-Passw0rd-1x', newPassword: 'Fresh-Passw0rd-2x' });
  check('a second voluntary change within a day is refused (minimum password age)', r.status === 400 && /less than 1 day/.test(r.body.message), JSON.stringify(r));

  r = await admin.call('POST', `/users/${pat.id}/reset-password`);
  check('an admin reset returns a generated temporary password that meets the policy', r.status === 200 && /[A-Z]/.test(r.body.temporaryPassword) && /[^A-Za-z0-9]/.test(r.body.temporaryPassword), JSON.stringify(r));
  const patTemp2 = r.body.temporaryPassword;
  r = await pat.client.call('POST', '/auth/login', { email: pat.email, password: patTemp2 });
  check('the user signs in with the reset password and must change it again', r.status === 200, JSON.stringify(r));
  r = await pat.client.call('POST', '/auth/change-password', { currentPassword: patTemp2, newPassword: 'Fresh-Passw0rd-1x' });
  check('a previously used password cannot be reused (history)', r.status === 400 && /reuse/.test(r.body.message), JSON.stringify(r));
  r = await pat.client.call('POST', '/auth/change-password', { currentPassword: patTemp2, newPassword: 'Fresh-Passw0rd-3x' });
  check('a different compliant password is accepted', r.status === 204, JSON.stringify(r));

  r = await admin.call('POST', `/users/${pat.id}/reset-password`, { temporaryPassword: 'weakpass' });
  check('an admin-typed reset password must meet the policy (400)', r.status === 400, JSON.stringify(r));

  // lockout: 3 wrong passwords lock the account until an admin unlocks it
  const larryEmail = `larry${stamp}@t.local`;
  const lark = await makeUser('Lock Larry', larryEmail, [abs.id]);
  const attacker = new Client();
  for (let i = 0; i < 3; i++) await attacker.call('POST', '/auth/login', { email: larryEmail, password: `Wrong-Guess-${i}x` });
  r = await attacker.call('POST', '/auth/login', { email: larryEmail, password: PASSWORD });
  check('3 wrong passwords lock the account; the right password is then refused', r.status === 401, JSON.stringify(r));
  r = await admin.call('GET', '/users');
  check('the user list shows the account as locked', r.body.find((u) => u.id === lark.id)?.locked === true, JSON.stringify(r.body.find((u) => u.id === lark.id)));
  r = await reporter.client.call('POST', `/users/${lark.id}/unlock`);
  check('a plain User cannot unlock accounts (403)', r.status === 403, String(r.status));
  r = await admin.call('POST', `/users/${lark.id}/unlock`);
  check('an admin unlocks the account (204)', r.status === 204, JSON.stringify(r));
  await sleep(AUTH_THROTTLE_WINDOW_MS); // fresh throttle window for the remaining sign-ins
  r = await attacker.call('POST', '/auth/login', { email: larryEmail, password: PASSWORD });
  check('after the unlock the user can sign in again', r.status === 200, JSON.stringify(r));

  // the failure counter starts again after the reset window (5 minutes)
  const patient = new Client();
  for (let i = 0; i < 2; i++) await patient.call('POST', '/auth/login', { email: larryEmail, password: `Wrong-Guess-${i}x` });
  await prisma.user.update({ where: { email: larryEmail }, data: { lastFailedLoginAt: new Date(Date.now() - 6 * 60_000) } });
  await patient.call('POST', '/auth/login', { email: larryEmail, password: 'Wrong-Guess-9x' });
  r = await patient.call('POST', '/auth/login', { email: larryEmail, password: PASSWORD });
  check('failures older than the reset window do not count towards the lock', r.status === 200, JSON.stringify(r));

  // maximum password age: after 90 days the password must be replaced before anything else works
  await prisma.user.update({ where: { email: gina.email }, data: { mustChangePassword: false, passwordChangedAt: new Date(Date.now() - 91 * 86_400_000) } });
  const aged = new Client();
  r = await aged.call('POST', '/auth/login', { email: gina.email, password: gina.temp });
  check('an expired password still signs in but forces a change', r.status === 200, JSON.stringify(r));
  r = await aged.call('GET', '/companies');
  check('and blocks every other route until it is changed (403)', r.status === 403, JSON.stringify(r));

  // ---------- health ----------
  r = await new Client().call('GET', '/health');
  check('health endpoint answers without a session and reveals only status', r.status === 200 && JSON.stringify(r.body) === '{"status":"ok"}', JSON.stringify(r));

  // ---------- audit log ----------
  await sleep(800); // audit entries are written just after the response, so give them a moment
  r = await reporter.client.call('GET', '/audit');
  check('a plain User cannot read the audit log (403)', r.status === 403, String(r.status));
  r = await admin.call('GET', '/audit?pageSize=100');
  const auditHas = async (action) => ((await admin.call('GET', `/audit?action=${action}&pageSize=1`)).body.total ?? 0) > 0;
  check('Super Admin reads the audit log', r.status === 200 && r.body.total > 0, JSON.stringify(r).slice(0, 200));
  check('sign-ins and failed sign-ins are recorded', (await auditHas('auth.login')) && (await auditHas('auth.login_failed')), 'missing');
  check('user creation and incident activity are recorded', (await Promise.all(['user.created', 'incident.created', 'incident.stage_changed', 'incident.commented'].map(auditHas))).every(Boolean), 'missing');
  check('lockouts and admin unlocks are recorded', (await auditHas('auth.account_locked')) && (await auditHas('user.unlocked')), 'missing');
  r = await admin.call('GET', `/audit?search=${incident.number}&pageSize=100`);
  check('entries name the incident and the actor', r.body.items.length >= 5 && r.body.items.every((e) => e.summary.includes(incident.number) || e.entityId === incident.id) && r.body.items.some((e) => e.actorName === 'Reporter Ravi'), JSON.stringify(r.body.items.slice(0, 2)));
  const stageEntry = r.body.items.find((e) => e.action === 'incident.stage_changed');
  check('what changed is kept as short readable fields', stageEntry?.metadata?.changes?.stage !== undefined, JSON.stringify(stageEntry));
  r = await admin.call('GET', '/audit?pageSize=100');
  const leaked = JSON.stringify(r.body).includes(PASSWORD) || JSON.stringify(r.body).includes(TEMP_PASSWORD);
  check('no password ever appears in the audit log', !leaked);
  const absAdmin = await makeUser('Admin Abs', `adminabs${stamp}@t.local`, [abs.id], 'ADMIN');
  r = await absAdmin.client.call('GET', `/audit?search=${incident.number}&pageSize=100`);
  check('an Admin sees their own company\'s activity', r.status === 200 && r.body.items.some((e) => e.action === 'incident.created' && e.entityId === incident.id), JSON.stringify(r).slice(0, 200));
  check('an Admin does not see another company\'s or system-wide entries', r.body.items.every((e) => e.companyIds.includes(abs.id) || e.actorId === absAdmin.id) && !r.body.items.some((e) => e.action === 'auth.login_failed' && e.companyIds.length === 0), 'saw out-of-scope entries');
  r = await absAdmin.client.call('GET', `/audit?companyId=${dok.id}`);
  check("an Admin cannot filter by another company (403)", r.status === 403, String(r.status));
  r = await admin.call('GET', '/audit?pageSize=1000');
  check('page size is capped (400)', r.status === 400, String(r.status));

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
