'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, Eye, EyeOff, CircleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Label, aide, erreur                                                        */
/* -------------------------------------------------------------------------- */

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, children, required, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-medium text-foreground peer-disabled:opacity-70', className)}
    {...props}
  >
    {children}
    {required ? <span className="ml-0.5 text-destructive">*</span> : null}
  </LabelPrimitive.Root>
));
Label.displayName = 'Label';

export function FieldError({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p className={cn('flex items-start gap-1.5 text-xs font-medium text-destructive', className)} role="alert">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

export function FieldHint({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={cn('text-xs text-muted-foreground', className)}>{children}</p>;
}

export function FormField({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
  description,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {children}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      <FieldError message={error} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Champs de saisie                                                           */
/* -------------------------------------------------------------------------- */

const fieldClasses =
  'flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input ref={ref} type={type} className={cn(fieldClasses, type === 'file' && 'h-auto py-1.5', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldClasses, 'h-auto min-h-[84px] resize-y py-2 leading-relaxed', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export const PasswordInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn(fieldClasses, 'pr-11', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(fieldClasses, 'cursor-pointer appearance-none pr-9', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  ),
);
Select.displayName = 'Select';

/** Sélecteur enrichi (radix) utilisé pour les listes longues (pays, clients…). */
export const SelectMenu = SelectPrimitive.Root;
export const SelectMenuValue = SelectPrimitive.Value;

export function SelectMenuTrigger({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(fieldClasses, 'items-center justify-between gap-2 text-left [&>span]:truncate', className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectMenuContent({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={6}
        className={cn(
          'z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-elevated',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="max-h-64 overflow-y-auto">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectMenuItem({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4 text-primary" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

/* -------------------------------------------------------------------------- */
/* Cases à cocher / interrupteurs                                             */
/* -------------------------------------------------------------------------- */

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer size-[18px] shrink-0 rounded-[5px] border border-input bg-card shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="size-3.5" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-3.5 transition-colors hover:bg-muted/40">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Groupe radio (radix)                                                       */
/* -------------------------------------------------------------------------- */

export function RadioGroup({
  value,
  onValueChange,
  options,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string; hint?: string }[];
  className?: string;
}) {
  return (
    <div className={cn('grid gap-2 sm:grid-cols-2', className)} role="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left text-sm transition-all',
              selected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40 hover:bg-accent',
            )}
          >
            <span className="font-medium">{option.label}</span>
            {option.hint ? <span className="text-xs text-muted-foreground">{option.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
