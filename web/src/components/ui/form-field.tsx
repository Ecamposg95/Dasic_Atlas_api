import { cloneElement, isValidElement, useId } from 'react';
import { cn } from '@/lib/utils';

// Campo de formulario estándar: label asociado por htmlFor/id (accesible),
// asterisco de requerido uniforme, hint y error. Si el control hijo no trae
// `id`, se le inyecta uno generado (y aria-required cuando aplica) — así el
// consumidor solo escribe <FormField label="X" required><Input …/></FormField>.

export function FormField({
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const autoId = useId();
  let control = children;
  let controlId: string | undefined;

  if (isValidElement(children)) {
    const props = children.props as { id?: string; 'aria-required'?: boolean };
    controlId = props.id ?? autoId;
    control = cloneElement(children, {
      id: controlId,
      'aria-required': required || props['aria-required'] || undefined,
    } as Partial<unknown>);
  }

  return (
    <div className={className}>
      <label htmlFor={controlId} className="mb-1 block text-xs text-muted-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-rose-500" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p>}
      {error && <p className={cn('mt-1 text-[11px] text-rose-500')}>{error}</p>}
    </div>
  );
}
