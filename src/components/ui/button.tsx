import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.985]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-700 hover:shadow-md',
        gradient:
          'bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-md shadow-primary/25 hover:from-primary-700 hover:to-primary-800 hover:shadow-lg',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-[13px]',
        xs: 'h-8 rounded-md px-2.5 text-xs',
        lg: 'h-12 rounded-xl px-6 text-base',
        icon: 'size-10',
        'icon-sm': 'size-8 rounded-md',
        'icon-xs': 'size-7 rounded-md',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, loadingText, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            {loadingText ?? children}
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);
Button.displayName = 'Button';

/** Groupe de boutons contigus (barres d'actions documentaires). */
export function ButtonGroup({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex items-center rounded-lg border border-border bg-card shadow-sm [&>a]:rounded-none [&>button]:rounded-none [&>*:not(:first-child)]:border-l [&>*:not(:first-child)]:border-border [&>*:first-child]:rounded-l-lg [&>*:last-child]:rounded-r-lg',
        className,
      )}
    >
      {children}
    </div>
  );
}

export { buttonVariants };
