'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { createSupportTicketAction } from '@/app/actions/settings';
import type { ActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/display';
import { FieldError, FormField, Input, Select, Textarea } from '@/components/ui/form';

export function SupportForm() {
  const router = useRouter();
  const [state, formAction, pending] = React.useActionState<ActionResult | undefined, FormData>(createSupportTicketAction, undefined);
  const formRef = React.useRef<HTMLFormElement>(null);
  const handled = React.useRef<typeof state>(undefined);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.success) {
      toast.success(state.message ?? 'Demande envoyée.');
      formRef.current?.reset();
      router.refresh();
    } else {
      toast.error(state.message ?? 'Envoi impossible.');
    }
  }, [state, router]);

  const errors = state && !state.success ? (state.errors ?? {}) : {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contacter le support</CardTitle>
        <CardDescription>
          Décrivez votre besoin : nous répondons par e-mail. Plus votre message est précis (numéro de devis, message d’erreur), plus
          la résolution est rapide.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          <FormField label="Objet" htmlFor="subject" required error={errors.subject}>
            <Input id="subject" name="subject" required minLength={3} maxLength={160} placeholder="Erreur à l’export Excel d’un devis" />
          </FormField>
          <FormField label="Message" htmlFor="message" required error={errors.message}>
            <Textarea
              id="message"
              name="message"
              rows={5}
              required
              minLength={10}
              maxLength={4000}
              placeholder="Bonjour, l’export Excel du devis DEV-2026-0012 affiche un total différent de l’aperçu…"
            />
          </FormField>
          <FormField label="Priorité" htmlFor="priority">
            <Select id="priority" name="priority" defaultValue="NORMAL">
              <option value="LOW">Basse — question générale</option>
              <option value="NORMAL">Normale — gêne ponctuelle</option>
              <option value="HIGH">Haute — je ne peux pas travailler</option>
              <option value="URGENT">Urgente — client bloqué</option>
            </Select>
          </FormField>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />}
            Envoyer au support
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
