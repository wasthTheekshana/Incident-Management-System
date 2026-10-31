import { BadRequestException } from '@nestjs/common';
import { FieldType, TemplateField } from '@prisma/client';

const MAX_TEXT = 255;
const MAX_LONG_TEXT = 5000;

type FieldDef = Pick<TemplateField, 'key' | 'label' | 'type' | 'options' | 'mandatory'>;

/**
 * Validates and normalises the values a reporter submitted against the template version's fields.
 * Unknown keys are rejected and only known keys are returned, so arbitrary JSON can never be stored.
 */
export function validateFieldValues(fields: FieldDef[], submitted: Record<string, unknown>): Record<string, string | number | boolean> {
  const known = new Set(fields.map((f) => f.key));
  const unknown = Object.keys(submitted).filter((k) => !known.has(k));
  if (unknown.length) throw new BadRequestException(`Unknown fields: ${unknown.join(', ')}`);

  const result: Record<string, string | number | boolean> = {};
  const problems: string[] = [];

  for (const field of fields) {
    const raw = submitted[field.key];
    const empty = raw === undefined || raw === null || raw === '' || (field.type === FieldType.CHECKBOX && raw === false);

    if (empty) {
      // An unticked checkbox is a legitimate answer unless the field is mandatory ("must be ticked").
      if (field.mandatory) problems.push(`${field.label} is required`);
      else if (field.type === FieldType.CHECKBOX) result[field.key] = false;
      continue;
    }

    const error = check(field, raw);
    if (error) problems.push(`${field.label} ${error}`);
    else result[field.key] = normalise(field, raw);
  }

  if (problems.length) throw new BadRequestException(problems);
  return result;
}

function check(field: FieldDef, raw: unknown): string | null {
  switch (field.type) {
    case FieldType.SHORT_TEXT:
      return typeof raw === 'string' && raw.length <= MAX_TEXT ? null : `must be text up to ${MAX_TEXT} characters`;
    case FieldType.LONG_TEXT:
      return typeof raw === 'string' && raw.length <= MAX_LONG_TEXT ? null : `must be text up to ${MAX_LONG_TEXT} characters`;
    case FieldType.NUMBER:
      return typeof raw === 'number' && Number.isFinite(raw) ? null : 'must be a number';
    case FieldType.DATETIME:
      return typeof raw === 'string' && !Number.isNaN(Date.parse(raw)) ? null : 'must be a valid date and time';
    case FieldType.CHECKBOX:
      return typeof raw === 'boolean' ? null : 'must be true or false';
    case FieldType.DROPDOWN:
      return typeof raw === 'string' && ((field.options as string[] | null) ?? []).includes(raw)
        ? null
        : 'must be one of the listed options';
  }
}

const normalise = (field: FieldDef, raw: unknown) =>
  field.type === FieldType.DATETIME ? new Date(raw as string).toISOString() : (raw as string | number | boolean);
