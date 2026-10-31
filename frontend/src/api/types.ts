export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'USER';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type Stage = 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type SlaStatus = 'ON_TRACK' | 'DUE_SOON' | 'BREACHED';
export type FieldType = 'SHORT_TEXT' | 'LONG_TEXT' | 'NUMBER' | 'DATETIME' | 'DROPDOWN' | 'CHECKBOX';

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  companyIds: string[];
}

export interface CompanyRef { id: string; name: string; code: string }
export interface PersonRef { id: string; name: string; email?: string }

export interface Company extends CompanyRef {
  active: boolean;
  responsiblePerson: PersonRef | null;
  backupPerson: PersonRef | null;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  companies: CompanyRef[];
}

export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  mandatory: boolean;
  order?: number;
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  defaultCategory: string | null;
  defaultPriority: Priority;
  version: number;
  active: boolean;
  companies: CompanyRef[];
  fields: TemplateField[];
}

export interface IncidentListItem {
  id: string;
  number: string;
  title: string;
  priority: Priority;
  stage: Stage;
  createdAt: string;
  responseDueAt: string;
  resolutionDueAt: string;
  slaStatus: SlaStatus;
  company: CompanyRef;
  template: { id: string; name: string };
  assignee: PersonRef | null;
  reporter: PersonRef;
}

export interface Paged<T> { total: number; page: number; pageSize: number; items: T[] }

export interface IncidentDetail {
  id: string;
  number: string;
  title: string;
  description: string;
  priority: Priority;
  stage: Stage;
  slaStatus: SlaStatus;
  createdAt: string;
  responseDueAt: string;
  resolutionDueAt: string;
  respondedAt: string | null;
  resolvedAt: string | null;
  pausedAt: string | null;
  fieldValues: Record<string, string | number | boolean>;
  templateFields: { key: string; label: string; type: FieldType }[];
  company: CompanyRef;
  template: { id: string; name: string };
  reporter: PersonRef;
  assignee: PersonRef | null;
  resolver: PersonRef | null;
  rootCauseId: string | null;
  rootCause: { id: string; name: string } | null;
  rootCauseText: string | null;
  correctiveAction: string | null;
  resolutionNotes: string | null;
  attachments: { id: string; fileName: string; fileType: string; size: number; uploadedAt: string }[];
  comments: { id: string; body: string; createdAt: string; author: PersonRef }[];
  history: { id: string; action: string; field: string | null; oldValue: string | null; newValue: string | null; createdAt: string; user: PersonRef | null }[];
  permissions: {
    changeStage: boolean; reassign: boolean; assignResolver: boolean;
    changePriority: boolean; editRootCause: boolean; attach: boolean;
  };
}

export interface RootCause { id: string; name: string; companyId: string | null; active: boolean }

export interface AppNotification {
  id: string; incidentId: string | null; event: string; subject: string; body: string; readAt: string | null; createdAt: string;
}

export type SlaConfig = Record<Priority, { responseMinutes: number; resolutionMinutes: number }>;

export interface NotificationConfigRow {
  event: string;
  audiences: string[];
  template: { subject: string; body: string };
}
