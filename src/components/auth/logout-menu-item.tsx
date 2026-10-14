'use client';

import * as React from 'react';
import { LogOut, Loader2 } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

/** Bouton « Se déconnecter » utilisable depuis n'importe quel écran. */
export function LogoutMenuItem({ variant = 'ghost' }: { variant?: 'ghost' | 'outline' | 'link' }) {
  const [pending, setPending] = React.useState(false);

  return (
    <form
      action={async () => {
        setPending(true);
        try {
          await logoutAction();
        } finally {
          setPending(false);
        }
      }}
    >
      <Button type="submit" variant={variant} size="sm" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
        Se déconnecter
      </Button>
    </form>
  );
}
