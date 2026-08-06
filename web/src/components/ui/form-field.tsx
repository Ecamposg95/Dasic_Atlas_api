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
  // El hint y el error necesitan id propio para poder atarlos al control con
  // `aria-describedby`. Sin eso el mensaje solo existe visualmente: quien usa
  // lector de pantalla enfoca el campo y no oye nada, y el campo además parece
  // válido porque nada lo marca como inválido.
  const hintId = `${autoId}-hint`;
  const errorId = `${autoId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  let control = children;
  let controlId: string | undefined;

  if (isValidElement(children)) {
    const props = children.props as {
      id?: string;
      'aria-required'?: boolean;
      'aria-describedby'?: string;
    };
    controlId = props.id ?? autoId;
    control = cloneElement(children, {
      id: controlId,
      'aria-required': required || props['aria-required'] || undefined,
      'aria-invalid': error ? true : undefined,
      // Se respeta lo que el consumidor ya haya puesto, encadenándolo.
      'aria-describedby': [props['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined,
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
      {hint && !error && (
        <p id={hintId} className="mt-1 text-[11px] text-muted-foreground/80">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={cn('mt-1 text-[11px] text-rose-500')}>
          {error}
        </p>
      )}
    </div>
  );
}
