'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      duration={4500}
      toastOptions={{
        classNames: {
          toast: 'rounded-xl border border-border shadow-elevated font-sans',
          title: 'text-sm font-semibold',
          description: 'text-[13px] text-muted-foreground',
          actionButton: 'rounded-lg bg-primary text-primary-foreground text-xs',
        },
      }}
    />
  );
}

export { toast };
