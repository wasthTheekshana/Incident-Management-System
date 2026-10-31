import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FieldType, Prisma } from '@prisma/client';
import { AccessPolicy } from '../common/access-policy.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { SaveTemplateDto, TemplateFieldDto } from './templates.dto';

interface NormalisedField {
  key: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  mandatory: boolean;
  order: number;
}

const templateView = (version?: number) =>
  ({
    id: true,
    name: true,
    description: true,
    defaultCategory: true,
    defaultPriority: true,
    version: true,
    active: true,
    companies: { select: { company: { select: { id: true, name: true, code: true } } } },
    fields: {
      where: version === undefined ? undefined : { version },
      orderBy: { order: 'asc' },
      select: { key: true, label: true, type: true, options: true, mandatory: true, order: true, version: true },
    },
  }) satisfies Prisma.IncidentTemplateSelect;

type TemplateRow = Prisma.IncidentTemplateGetPayload<{ select: ReturnType<typeof templateView> }>;

/** Only the fields of the template's current version are shown; older versions stay for old incidents. */
const present = ({ companies, fields, ...rest }: TemplateRow) => ({
  ...rest,
  companies: companies.map((c) => c.company),
  fields: fields.filter((f) => f.version === rest.version),
});

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicy,
  ) {}

  /** Administration list: every template that touches one of the admin's companies. */
  async listForAdmin(user: AuthUser) {
    const rows = await this.prisma.incidentTemplate.findMany({
      where: this.access.isSuperAdmin(user) ? {} : { companies: { some: { companyId: { in: user.companyIds } } } },
      select: templateView(),
      orderBy: { name: 'asc' },
    });
    return rows.map(present);
  }

  /** Reporting screen: active templates usable for the chosen company (FR-13). */
  async listAvailable(user: AuthUser, companyId: string) {
    this.access.assertCompanyAccess(user, companyId);
    const rows = await this.prisma.incidentTemplate.findMany({
      where: { active: true, companies: { some: { companyId } } },
      select: templateView(),
      orderBy: { name: 'asc' },
    });
    return rows.map(present);
  }

  async get(user: AuthUser, id: string) {
    const row = await this.prisma.incidentTemplate.findUnique({ where: { id }, select: templateView() });
    if (!row || !this.canManage(user, row.companies.map((c) => c.company.id))) {
      throw new NotFoundException('Template not found');
    }
    return present(row);
  }

  async create(user: AuthUser, dto: SaveTemplateDto) {
    await this.assertCompaniesAllowed(user, dto.companyIds);
    const fields = this.normaliseFields(dto.fields);

    const created = await this.prisma.incidentTemplate.create({
      data: {
        name: dto.name.trim(),
        description: dto.description,
        defaultCategory: dto.defaultCategory,
        defaultPriority: dto.defaultPriority,
        active: dto.active ?? true,
        companies: { create: dto.companyIds.map((companyId) => ({ companyId })) },
        fields: { create: fields.map((f) => this.fieldRow(f, 1)) },
      },
      select: templateView(),
    });
    return present(created);
  }

  async update(user: AuthUser, id: string, dto: SaveTemplateDto) {
    const existing = await this.getManageable(user, id);
    await this.assertCompaniesAllowed(user, dto.companyIds);
    const fields = this.normaliseFields(dto.fields);

    // Mappings to companies the actor does not control are preserved (an Admin cannot detach another Admin's company).
    const currentIds = existing.companies.map((c) => c.companyId);
    const keep = currentIds.filter((c) => !this.access.canAccessCompany(user, c));
    const finalCompanies = [...new Set([...keep, ...dto.companyIds])];

    const currentFields = await this.prisma.templateField.findMany({
      where: { templateId: id, version: existing.version },
      orderBy: { order: 'asc' },
    });
    const fieldsChanged = !sameFields(currentFields, fields);
    const nextVersion = fieldsChanged ? existing.version + 1 : existing.version;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.templateCompany.deleteMany({ where: { templateId: id } });
      if (fieldsChanged) {
        await tx.templateField.createMany({ data: fields.map((f) => ({ ...this.fieldRow(f, nextVersion), templateId: id })) });
      }
      return tx.incidentTemplate.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          description: dto.description,
          defaultCategory: dto.defaultCategory,
          defaultPriority: dto.defaultPriority,
          version: nextVersion,
          ...(dto.active !== undefined && { active: dto.active }),
          companies: { create: finalCompanies.map((companyId) => ({ companyId })) },
        },
        select: templateView(),
      });
    });
    return present(updated);
  }

  /** FR-10 "copy": a new, inactive template with the same settings and fields. */
  async copy(user: AuthUser, id: string) {
    const source = await this.get(user, id);
    return this.create(user, {
      name: `${source.name} (copy)`.slice(0, 120),
      description: source.description ?? undefined,
      defaultCategory: source.defaultCategory ?? undefined,
      defaultPriority: source.defaultPriority,
      companyIds: source.companies.map((c) => c.id).filter((c) => this.access.canAccessCompany(user, c)),
      fields: source.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        options: (f.options as string[] | null) ?? undefined,
        mandatory: f.mandatory,
      })),
      active: false,
    });
  }

  // --- helpers --------------------------------------------------------------------------------------

  private canManage(user: AuthUser, templateCompanyIds: string[]): boolean {
    return this.access.isSuperAdmin(user) || templateCompanyIds.some((c) => user.companyIds.includes(c));
  }

  private async getManageable(user: AuthUser, id: string) {
    const row = await this.prisma.incidentTemplate.findUnique({ where: { id }, include: { companies: true } });
    if (!row || !this.canManage(user, row.companies.map((c) => c.companyId))) {
      throw new NotFoundException('Template not found');
    }
    return row;
  }

  private async assertCompaniesAllowed(user: AuthUser, companyIds: string[]): Promise<void> {
    if (companyIds.some((c) => !this.access.canAccessCompany(user, c))) {
      throw new ForbiddenException('You can only use templates for your own companies');
    }
    const found = await this.prisma.company.count({ where: { id: { in: companyIds } } });
    if (found !== companyIds.length) throw new BadRequestException('One or more companies do not exist');
  }

  private normaliseFields(input: TemplateFieldDto[]): NormalisedField[] {
    const used = new Set<string>();
    return input.map((f, order) => {
      if (f.type === FieldType.DROPDOWN && !f.options?.length) {
        throw new BadRequestException(`Dropdown field "${f.label}" needs at least one option`);
      }
      const options = f.type === FieldType.DROPDOWN ? [...new Set(f.options!.map((o) => o.trim()).filter(Boolean))] : null;
      let key = f.key ?? `f_${f.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || order}`;
      while (used.has(key)) key = `${key}_${order}`;
      used.add(key);
      return { key, label: f.label.trim(), type: f.type, options, mandatory: f.mandatory, order };
    });
  }

  private fieldRow(f: NormalisedField, version: number) {
    return {
      key: f.key,
      label: f.label,
      type: f.type,
      options: f.options ?? Prisma.JsonNull,
      mandatory: f.mandatory,
      order: f.order,
      version,
    };
  }
}

function sameFields(
  current: { key: string; label: string; type: FieldType; options: Prisma.JsonValue; mandatory: boolean; order: number }[],
  next: NormalisedField[],
): boolean {
  const shape = (f: { key: string; label: string; type: FieldType; options: unknown; mandatory: boolean; order: number }) =>
    JSON.stringify([f.key, f.label, f.type, f.options ?? null, f.mandatory, f.order]);
  return current.length === next.length && current.every((c, i) => shape(c) === shape(next[i]));
}
