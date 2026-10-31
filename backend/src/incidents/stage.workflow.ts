import { Role, Stage } from '@prisma/client';

/** FR-22: the only legal stage moves. */
export const ALLOWED_TRANSITIONS: Record<Stage, Stage[]> = {
  NEW: [Stage.ASSIGNED],
  ASSIGNED: [Stage.IN_PROGRESS],
  IN_PROGRESS: [Stage.PENDING, Stage.RESOLVED],
  PENDING: [Stage.IN_PROGRESS],
  RESOLVED: [Stage.CLOSED, Stage.IN_PROGRESS],
  CLOSED: [],
};

/** FR-23: moves that must carry a comment. Rejecting a resolution also needs one (UC-6). */
export function requiresComment(from: Stage, to: Stage): boolean {
  return to === Stage.PENDING || to === Stage.RESOLVED || (from === Stage.RESOLVED && to === Stage.IN_PROGRESS);
}

export interface StageActor {
  id: string;
  role: Role;
  /** True when the actor is an Admin of the incident's company (or Super Admin). */
  isCompanyAdmin: boolean;
}

export interface StageSubject {
  reporterId: string;
  assigneeId: string | null;
  resolverId: string | null;
}

export function canTransition(from: Stage, to: Stage): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** FR-23: who may perform a given move. Returns false rather than throwing so callers choose the error. */
export function canActorMove(actor: StageActor, subject: StageSubject, from: Stage, to: Stage): boolean {
  const isWorker = actor.id === subject.assigneeId || actor.id === subject.resolverId;
  const isReporter = actor.id === subject.reporterId;

  if (to === Stage.CLOSED) return isReporter || actor.isCompanyAdmin;
  if (from === Stage.RESOLVED && to === Stage.IN_PROGRESS) return isReporter || isWorker || actor.isCompanyAdmin;
  return isWorker || actor.isCompanyAdmin;
}
