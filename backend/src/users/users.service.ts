import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PasswordService } from '../auth/password.service';
import { AccessPolicy } from '../common/access-policy.service';
import { AuthUser } from '../common/auth.types';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

const USER_VIEW = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  lastLoginAt: true,
  companies: { select: { company: { select: { id: true, name: true, code: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_VIEW }>;

const present = ({ companies, ...rest }: UserRow) => ({ ...rest, companies: companies.map((c) => c.company) });

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicy,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
  ) {}

  async list(actor: AuthUser, companyId?: string) {
    const where: Prisma.UserWhereInput = this.access.isSuperAdmin(actor)
      ? {}
      : { companies: { some: { companyId: { in: actor.companyIds } } } };
    if (companyId) {
      this.access.assertCompanyAccess(actor, companyId);
      where.companies = { some: { companyId } };
    }
    const rows = await this.prisma.user.findMany({ where, select: USER_VIEW, orderBy: { name: 'asc' } });
    return rows.map(present);
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    // FR-7: only Super Admin may create Admins; nobody creates another Super Admin through the API.
    if (dto.role === Role.SUPER_ADMIN) throw new ForbiddenException('Super Admin accounts cannot be created here');
    if (dto.role === Role.ADMIN && !this.access.isSuperAdmin(actor)) {
      throw new ForbiddenException('Only Super Admin can create Admin users');
    }
    await this.assertAssignableCompanies(actor, dto.companyIds);

    const tempPassword = this.passwords.generateTemporary();
    try {
      const created = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          phone: dto.phone,
          role: dto.role,
          passwordHash: await this.passwords.hash(tempPassword),
          mustChangePassword: true,
          companies: { create: dto.companyIds.map((companyId) => ({ companyId })) },
        },
        select: USER_VIEW,
      });
      await this.sendWelcome(created.email, tempPassword);
      return present(created);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A user with this email already exists');
      }
      throw e;
    }
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.getManageable(actor, id);
    if (target.id === actor.id && dto.active === false) throw new BadRequestException('You cannot deactivate yourself');

    const companyOps = dto.companyIds ? await this.companyMappingOps(actor, target.id, dto.companyIds) : [];

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const op of companyOps) await op(tx);
      if (dto.active === false) {
        await tx.session.deleteMany({ where: { userId: id } });
        await tx.company.updateMany({ where: { responsiblePersonId: id }, data: { responsiblePersonId: null } });
        await tx.company.updateMany({ where: { backupPersonId: id }, data: { backupPersonId: null } });
      }
      return tx.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.active !== undefined && { active: dto.active }),
        },
        select: USER_VIEW,
      });
    });
    return present(updated);
  }

  async adminResetPassword(actor: AuthUser, id: string): Promise<void> {
    const target = await this.getManageable(actor, id);
    const tempPassword = this.passwords.generateTemporary();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          passwordHash: await this.passwords.hash(tempPassword),
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.session.deleteMany({ where: { userId: id } }),
    ]);
    await this.sendWelcome(target.email, tempPassword);
  }

  /** Existence and scope are checked together so out-of-scope users look identical to missing ones. */
  private async getManageable(actor: AuthUser, id: string) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      include: { companies: { select: { companyId: true } } },
    });
    if (!target) throw new NotFoundException('User not found');
    if (this.access.isSuperAdmin(actor)) return target;

    const inScope = target.companies.some((c) => actor.companyIds.includes(c.companyId));
    if (!inScope) throw new NotFoundException('User not found');
    if (target.role !== Role.USER) throw new ForbiddenException('Only Super Admin can manage Admin accounts');
    return target;
  }

  private async assertAssignableCompanies(actor: AuthUser, companyIds: string[]): Promise<void> {
    if (!this.access.isSuperAdmin(actor)) {
      const outside = companyIds.filter((c) => !actor.companyIds.includes(c));
      if (outside.length) throw new ForbiddenException('You can only assign users to your own companies');
    }
    const found = await this.prisma.company.count({ where: { id: { in: companyIds }, active: true } });
    if (found !== companyIds.length) throw new BadRequestException('One or more companies are invalid or inactive');
  }

  /**
   * Replaces the target's company mapping. An Admin only controls mappings inside their own companies;
   * mappings to other companies are preserved untouched.
   */
  private async companyMappingOps(actor: AuthUser, userId: string, requested: string[]) {
    await this.assertAssignableCompanies(actor, requested);
    const current = await this.prisma.userCompany.findMany({ where: { userId } });
    const controllable = (companyId: string) => this.access.isSuperAdmin(actor) || actor.companyIds.includes(companyId);

    const toRemove = current.map((c) => c.companyId).filter((c) => controllable(c) && !requested.includes(c));
    const toAdd = requested.filter((c) => !current.some((cur) => cur.companyId === c));
    const remaining = current.length - toRemove.length + toAdd.length;
    if (remaining < 1) throw new BadRequestException('A user must belong to at least one company');

    return [
      (tx: Prisma.TransactionClient) => tx.userCompany.deleteMany({ where: { userId, companyId: { in: toRemove } } }),
      (tx: Prisma.TransactionClient) =>
        tx.userCompany.createMany({ data: toAdd.map((companyId) => ({ userId, companyId })) }),
      // A removed member can no longer be a company's responsible/backup person.
      (tx: Prisma.TransactionClient) =>
        tx.company.updateMany({ where: { id: { in: toRemove }, responsiblePersonId: userId }, data: { responsiblePersonId: null } }),
      (tx: Prisma.TransactionClient) =>
        tx.company.updateMany({ where: { id: { in: toRemove }, backupPersonId: userId }, data: { backupPersonId: null } }),
    ];
  }

  private async sendWelcome(email: string, tempPassword: string): Promise<void> {
    const body = `A CIMS account has been created or reset for you.\n\nUsername: ${email}\nTemporary password: ${tempPassword}\n\nYou must change this password at first login.`;
    await this.mail.send(email, 'Your CIMS login details', body).catch(() => undefined);
  }
}
