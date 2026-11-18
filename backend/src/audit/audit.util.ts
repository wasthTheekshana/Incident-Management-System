const SENSITIVE_KEY = /pass|token|secret|hash|cookie|authorization/i;
const MAX_KEYS = 8;
const MAX_TEXT = 120;

/**
 * Reduces a request body to a few short scalar fields for the audit trail. Secrets are never kept, nested values
 * (template fields, custom field values) are dropped, and long text is truncated, so the log stays readable and
 * cannot become a second copy of sensitive data.
 */
export function sanitizeBody(body: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out;
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_KEYS) break;
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof value === 'string') out[key] = value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
  }
  return out;
}

export interface RouteLabel {
  action: string;
  label: string;
  entity?: 'incident' | 'user' | 'company' | 'template' | 'rootCause';
}

/** Mutating routes worth a readable label. Anything not listed is still recorded under a generic action. */
export const ROUTE_LABELS: Record<string, RouteLabel> = {
  'POST /incidents': { action: 'incident.created', label: 'Reported incident', entity: 'incident' },
  'POST /incidents/:id/stage': { action: 'incident.stage_changed', label: 'Changed stage of', entity: 'incident' },
  'PUT /incidents/:id/priority': { action: 'incident.priority_changed', label: 'Changed priority of', entity: 'incident' },
  'PUT /incidents/:id/resolver': { action: 'incident.resolver_assigned', label: 'Assigned resolver on', entity: 'incident' },
  'PUT /incidents/:id/assignee': { action: 'incident.reassigned', label: 'Reassigned', entity: 'incident' },
  'PUT /incidents/:id/root-cause': { action: 'incident.root_cause_set', label: 'Recorded root cause on', entity: 'incident' },
  'POST /incidents/:id/comments': { action: 'incident.commented', label: 'Commented on', entity: 'incident' },
  'POST /incidents/:incidentId/attachments': { action: 'incident.attachment_added', label: 'Attached a file to', entity: 'incident' },
  'POST /users': { action: 'user.created', label: 'Created user', entity: 'user' },
  'PATCH /users/:id': { action: 'user.updated', label: 'Updated user', entity: 'user' },
  'POST /users/:id/reset-password': { action: 'user.password_reset', label: 'Reset password for', entity: 'user' },
  'POST /users/:id/unlock': { action: 'user.unlocked', label: 'Unlocked account of', entity: 'user' },
  'POST /companies': { action: 'company.created', label: 'Created company', entity: 'company' },
  'PATCH /companies/:id': { action: 'company.updated', label: 'Updated company', entity: 'company' },
  'PUT /companies/:id/responsible-people': { action: 'company.responsible_people_set', label: 'Set responsible people for', entity: 'company' },
  'POST /templates': { action: 'template.created', label: 'Created template', entity: 'template' },
  'PUT /templates/:id': { action: 'template.updated', label: 'Updated template', entity: 'template' },
  'POST /templates/:id/copy': { action: 'template.copied', label: 'Copied template', entity: 'template' },
  'POST /root-causes': { action: 'root_cause.created', label: 'Added root cause', entity: 'rootCause' },
  'PATCH /root-causes/:id': { action: 'root_cause.updated', label: 'Updated root cause', entity: 'rootCause' },
  'PUT /settings': { action: 'settings.updated', label: 'Changed system settings' },
  'PUT /sla-config': { action: 'sla.updated', label: 'Changed priority and SLA times' },
  'PUT /notifications/config/:event': { action: 'notifications.rule_updated', label: 'Changed notification rule' },
};

/** Routes whose activity is recorded elsewhere (auth events, with the actor known) or is not worth an entry. */
export const AUDIT_SKIP = [/^\/auth\//, /^\/notifications\/(read-all|[^/]+\/read)$/];
