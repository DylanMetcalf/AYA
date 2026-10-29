import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const controlClass =
  "block w-full rounded-[var(--radius-md)] border border-stone-300 bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/20 aria-[invalid=true]:border-danger";

interface FieldProps {
  label: string;
  name: string;
  error?: string[] | string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children?: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

/** Labelled form control with accessible hint and error wiring. */
export function Field({ label, name, error, hint, required, className, children }: FieldProps) {
  const id = `f-${name}`;
  const err = Array.isArray(error) ? error[0] : error;
  const describedBy = [hint && `${id}-hint`, err && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
        {required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children?.({ id, describedBy, invalid: !!err })}
      {hint && !err && (
        <p id={`${id}-hint`} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}
      {err && (
        <p id={`${id}-err`} className="text-xs text-danger">
          {err}
        </p>
      )}
    </div>
  );
}

type Common = { label: string; name: string; error?: string[] | string; hint?: ReactNode; fieldClassName?: string };

export function TextField({ label, name, error, hint, fieldClassName, required, ...rest }: Common & ComponentProps<"input">) {
  return (
    <Field label={label} name={name} error={error} hint={hint} required={required} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <input id={id} name={name} required={required} aria-invalid={invalid} aria-describedby={describedBy} className={controlClass} {...rest} />
      )}
    </Field>
  );
}

export function TextAreaField({ label, name, error, hint, fieldClassName, required, ...rest }: Common & ComponentProps<"textarea">) {
  return (
    <Field label={label} name={name} error={error} hint={hint} required={required} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} name={name} required={required} rows={4} aria-invalid={invalid} aria-describedby={describedBy} className={controlClass} {...rest} />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  fieldClassName,
  required,
  options,
  placeholder,
  ...rest
}: Common & ComponentProps<"select"> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Field label={label} name={name} error={error} hint={hint} required={required} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <select id={id} name={name} required={required} aria-invalid={invalid} aria-describedby={describedBy} className={controlClass} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
