import { NotificationEvent } from '@prisma/client';

export const QUEUE_MAIL = 'mail';
export const QUEUE_SLA = 'sla';

export const AUDIENCES = ['REPORTER', 'ASSIGNEE', 'RESOLVER', 'PREVIOUS_ASSIGNEE', 'COMPANY_ADMINS'] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Who is told about each event until Super Admin changes it (FR-24, FR-26, FR-31, UC-7). */
export const DEFAULT_RULES: Record<NotificationEvent, Audience[]> = {
  INCIDENT_CREATED: ['REPORTER', 'COMPANY_ADMINS'],
  ASSIGNED: ['ASSIGNEE', 'PREVIOUS_ASSIGNEE', 'REPORTER'],
  STAGE_CHANGED: ['REPORTER', 'ASSIGNEE', 'RESOLVER', 'COMPANY_ADMINS'],
  SLA_DUE_SOON: ['ASSIGNEE', 'COMPANY_ADMINS'],
  SLA_BREACHED: ['ASSIGNEE', 'COMPANY_ADMINS'],
  RESOLVER_ASSIGNED: ['RESOLVER', 'REPORTER'],
};

/** Placeholders are filled by plain substitution; templates are text so nothing is ever evaluated. */
export const DEFAULT_TEMPLATES: Record<NotificationEvent, { subject: string; body: string }> = {
  INCIDENT_CREATED: {
    subject: '[{{number}}] New incident: {{title}}',
    body: 'Incident {{number}} was reported for {{company}}.\nPriority: {{priority}}\nAssigned to: {{assignee}}\nResponse due: {{responseDue}}\nResolution due: {{resolutionDue}}\n\n{{link}}',
  },
  ASSIGNED: {
    subject: '[{{number}}] Incident assigned: {{title}}',
    body: 'Incident {{number}} ({{company}}) is now assigned to {{assignee}}.\nTitle: {{title}}\nPriority: {{priority}}\nResponse due: {{responseDue}}\nResolution due: {{resolutionDue}}\nReason: {{comment}}\n\n{{link}}',
  },
  STAGE_CHANGED: {
    subject: '[{{number}}] Stage changed to {{newStage}}',
    body: 'Incident {{number}} ({{company}}) moved from {{oldStage}} to {{newStage}} by {{actor}}.\nComment: {{comment}}\n\n{{link}}',
  },
  SLA_DUE_SOON: {
    subject: '[{{number}}] SLA due soon',
    body: 'Incident {{number}} ({{company}}) has used 75% of its SLA time.\nResponse due: {{responseDue}}\nResolution due: {{resolutionDue}}\n\n{{link}}',
  },
  SLA_BREACHED: {
    subject: '[{{number}}] SLA breached',
    body: 'Incident {{number}} ({{company}}) has breached its SLA.\nResponse due: {{responseDue}}\nResolution due: {{resolutionDue}}\n\n{{link}}',
  },
  RESOLVER_ASSIGNED: {
    subject: '[{{number}}] Resolver assigned: {{title}}',
    body: 'Incident {{number}} ({{company}}) has a new resolver: {{resolver}}.\nAssigned by {{actor}}.\n\n{{link}}',
  },
};
