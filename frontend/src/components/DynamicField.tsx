import type { TemplateField } from '../api/types';

type Value = string | number | boolean | undefined;

interface Props {
  field: TemplateField;
  value: Value;
  onChange: (value: Value) => void;
}

/** Renders one template field by type (FR-11). Values are typed to match what the server validates. */
export function DynamicField({ field, value, onChange }: Props) {
  const id = `f-${field.key}`;
  const label = (
    <label htmlFor={id}>
      {field.label}
      {field.mandatory && <span className="error" aria-hidden> *</span>}
    </label>
  );

  switch (field.type) {
    case 'LONG_TEXT':
      return (
        <div className="field">
          {label}
          <textarea id={id} required={field.mandatory} maxLength={5000} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'NUMBER':
      return (
        <div className="field">
          {label}
          <input
            id={id}
            type="number"
            required={field.mandatory}
            value={value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </div>
      );
    case 'DATETIME':
      return (
        <div className="field">
          {label}
          <input
            id={id}
            type="datetime-local"
            required={field.mandatory}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case 'DROPDOWN':
      return (
        <div className="field">
          {label}
          <select id={id} required={field.mandatory} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">Select…</option>
            {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    case 'CHECKBOX':
      return (
        <div className="field">
          <label htmlFor={id}>
            <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
            {field.label}{field.mandatory && <span className="error"> *</span>}
          </label>
        </div>
      );
    default:
      return (
        <div className="field">
          {label}
          <input id={id} type="text" required={field.mandatory} maxLength={255} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
  }
}
