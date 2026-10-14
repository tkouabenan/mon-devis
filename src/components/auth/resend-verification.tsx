'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Mail } from 'lucide-react';
import { resendVerificationAction, type ActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';

export function ResendVerification() {
  const [state, setState] = React.useState<ActionResult | null>(null);
  const [pending, setPending] = React.useState(false);

  async function resend() {
    setPending(true);
    try {
      setState(await resendVerificationAction());
    } catch {
      setState({ success: false, message: "Impossible d'envoyer l'e-mail pour le moment. Réessayez plus tard." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {state?.message ? (
        <Alert
          variant={state.success ? 'success' : 'warning'}
          icon={state.success ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
        >
          {state.message}
        </Alert>
      ) : null}

      <Button type="button" variant="outline" size="lg" className="w-full" onClick={resend} loading={pending} loadingText="Envoi…">
        <Mail className="size-4" aria-hidden />
        Renvoyer l’e-mail de confirmation
      </Button>
    </div>
  );
}
