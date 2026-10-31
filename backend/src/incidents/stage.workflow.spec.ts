import { Role, Stage } from '@prisma/client';
import { canActorMove, canTransition, requiresComment } from './stage.workflow';

describe('canTransition (FR-22)', () => {
  const legal: [Stage, Stage][] = [
    ['NEW', 'ASSIGNED'],
    ['ASSIGNED', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'PENDING'],
    ['PENDING', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'RESOLVED'],
    ['RESOLVED', 'CLOSED'],
    ['RESOLVED', 'IN_PROGRESS'],
  ];
  it.each(legal)('allows %s -> %s', (from, to) => expect(canTransition(from, to)).toBe(true));

  it.each<[Stage, Stage]>([
    ['ASSIGNED', 'CLOSED'],
    ['NEW', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'CLOSED'],
    ['CLOSED', 'IN_PROGRESS'],
    ['PENDING', 'RESOLVED'],
  ])('blocks %s -> %s', (from, to) => expect(canTransition(from, to)).toBe(false));
});

describe('requiresComment (FR-23)', () => {
  it('requires one for Pending, Resolved and rejected resolution', () => {
    expect(requiresComment('IN_PROGRESS', 'PENDING')).toBe(true);
    expect(requiresComment('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(requiresComment('RESOLVED', 'IN_PROGRESS')).toBe(true);
  });
  it('does not require one for ordinary moves', () => {
    expect(requiresComment('ASSIGNED', 'IN_PROGRESS')).toBe(false);
    expect(requiresComment('PENDING', 'IN_PROGRESS')).toBe(false);
    expect(requiresComment('RESOLVED', 'CLOSED')).toBe(false);
  });
});

describe('canActorMove (FR-23)', () => {
  const subject = { reporterId: 'rep', assigneeId: 'asg', resolverId: 'res' };
  const actor = (id: string, isCompanyAdmin = false) => ({ id, role: Role.USER, isCompanyAdmin });

  it('lets the assignee and resolver work the incident', () => {
    expect(canActorMove(actor('asg'), subject, 'ASSIGNED', 'IN_PROGRESS')).toBe(true);
    expect(canActorMove(actor('res'), subject, 'IN_PROGRESS', 'RESOLVED')).toBe(true);
  });

  it('stops the reporter from working the incident', () => {
    expect(canActorMove(actor('rep'), subject, 'ASSIGNED', 'IN_PROGRESS')).toBe(false);
  });

  it('lets only the reporter or an admin close', () => {
    expect(canActorMove(actor('rep'), subject, 'RESOLVED', 'CLOSED')).toBe(true);
    expect(canActorMove(actor('x', true), subject, 'RESOLVED', 'CLOSED')).toBe(true);
    expect(canActorMove(actor('asg'), subject, 'RESOLVED', 'CLOSED')).toBe(false);
  });

  it('lets the reporter reject a resolution', () => {
    expect(canActorMove(actor('rep'), subject, 'RESOLVED', 'IN_PROGRESS')).toBe(true);
  });

  it('rejects unrelated users', () => {
    expect(canActorMove(actor('stranger'), subject, 'ASSIGNED', 'IN_PROGRESS')).toBe(false);
  });
});
