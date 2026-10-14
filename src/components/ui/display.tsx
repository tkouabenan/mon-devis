import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Carte                                                                      */
/* -------------------------------------------------------------------------- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('surface', className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 border-b border-border/70 px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-display text-base font-semibold leading-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-3 border-t border-border/70 px-5 py-4', className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                      */
/* -------------------------------------------------------------------------- */

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary-700 dark:text-primary-300',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-muted-foreground',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
        warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
        danger: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Divers                                                                     */
/* -------------------------------------------------------------------------- */

export function Separator({ className, orientation = 'horizontal' }: { className?: string; orientation?: 'horizontal' | 'vertical' }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
    />
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden {...props} />;
}

export function Progress({ value, className, tone = 'primary' }: { value: number; className?: string; tone?: 'primary' | 'success' | 'warning' }) {
  const safe = Math.min(100, Math.max(0, value));
  const toneClass = tone === 'success' ? 'bg-emerald-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all duration-500', toneClass)} style={{ width: `${safe}%` }} />
    </div>
  );
}

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg' };
  const label = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary-500 to-primary-700 font-semibold text-white ring-2 ring-card',
        sizes[size],
        className,
      )}
      aria-hidden={Boolean(src)}
    >
      {src ? <img src={src} alt={name} className="size-full object-cover" /> : label || '?'}
    </span>
  );
}

export function Alert({
  variant = 'info',
  title,
  children,
  className,
  icon,
}: {
  variant?: 'info' | 'success' | 'warning' | 'danger';
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  const styles = {
    info: 'border-primary/25 bg-primary/5 text-primary-900 dark:text-primary-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100',
    warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-100',
    danger: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-100',
  };
  return (
    <div className={cn('flex gap-3 rounded-xl border p-3.5 text-sm', styles[variant], className)} role={variant === 'danger' ? 'alert' : 'status'}>
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-[13px] leading-relaxed opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center', className)}>
      {icon ? (
        <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-emerald-500/10 text-primary">
          {icon}
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="font-display text-base font-semibold">{title}</p>
        {description ? <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function DefinitionList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={String(item.label)} className="space-y-0.5">
          <dt className="label-caps">{item.label}</dt>
          <dd className="text-sm font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
