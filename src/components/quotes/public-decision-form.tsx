'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CheckCircle2, MessageSquare, XCircle } from 'lucide-react';
import { submitDecisionAction } from '@/app/d/[token]/actions';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/display';
import { Input, Label, Textarea } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/overlay';
import type { DecisionResult } from '@/lib/services/shares';

/**
 * Formulaire d'acceptation / refus / demande de modification côté client.
 * Le résultat est enregistré côté serveur (transaction + journal d'audit) et
 * l'entreprise est notifiée : aucune décision n'est simulée localement.
 */
export function PublicDecisionForm({
  token,
  allowFeedback,
  currentStatus,
  defaultName,
  defaultEmail,
}: {
  token: string;
  allowFeedback: boolean;
  currentStatus: string;
  defaultName: string | null;
  defaultEmail: string | null;
}) {
  const [actorName, setActorName] = React.useState(defaultName ?? '');
  const [actorEmail, setActorEmail] = React.useState(defaultEmail ?? '');
  const [feedback, setFeedback] = React.useState('');
  const [pending, setPending] = React.useState<null | 'ACCEPT' | 'REJECT' | 'REQUEST_CHANGE'>(null);
  const [result, setResult] = React.useState<DecisionResult | null>(null);
  const [confirmAccept, setConfirmAccept] = React.useState(false);

  const decided = currentStatus === 'ACCEPTED' || currentStatus === 'REJECTED';

  const submit = async (action: 'ACCEPT' | 'REJECT' | 'REQUEST_CHANGE') => {
    setPending(action);
    try {
      const formData = new FormData();
      formData.set('token', token);
      formData.set('action', action);
      formData.set('actorName', actorName);
      formData.set('actorEmail', actorEmail);
      formData.set('feedback', feedback);

      const response = await submitDecisionAction(formData);
      setResult(response);
      if (response.success) {
        toast.success(response.message);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action impossible pour le moment.');
    } finally {
      setPending(null);
      setConfirmAccept(false);
    }
  };

  if (result?.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Décision enregistrée
          </CardTitle>
          <CardDescription>{result.message}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Cette page peut être fermée. L’entreprise a été notifiée immédiatement et vous recontactera si nécessaire.
        </CardContent>
      </Card>
    );
  }

  if (decided) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ce devis a déjà été {currentStatus === 'ACCEPTED' ? 'accepté' : 'refusé'}
          </CardTitle>
          <CardDescription>
            Pour toute question ou modification, contactez directement l’entreprise émettrice du devis.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card id="decision">
      <CardHeader>
        <CardTitle className="text-base">Votre décision</CardTitle>
        <CardDescription>
          Votre réponse est transmise immédiatement à l’entreprise et horodatée dans le suivi du devis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="actorName">Votre nom</Label>
            <Input
              id="actorName"
              value={actorName}
              onChange={(event) => setActorName(event.target.value)}
              placeholder="Nom et prénom"
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="actorEmail">Votre e-mail (optionnel)</Label>
            <Input
              id="actorEmail"
              type="email"
              value={actorEmail}
              onChange={(event) => setActorEmail(event.target.value)}
              autoComplete="email"
            />
          </div>
        </div>

        {allowFeedback ? (
          <div className="space-y-1.5">
            <Label htmlFor="feedback">Message pour l’entreprise (obligatoire en cas de refus)</Label>
            <Textarea
              id="feedback"
              rows={3}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Question, ajustement souhaité, motif du refus…"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="success" loading={pending === 'ACCEPT'} onClick={() => setConfirmAccept(true)}>
            <CheckCircle2 className="size-4" aria-hidden />
            Accepter ce devis
          </Button>
          {allowFeedback ? (
            <>
              <Button variant="outline" loading={pending === 'REQUEST_CHANGE'} onClick={() => void submit('REQUEST_CHANGE')}>
                <MessageSquare className="size-4" aria-hidden />
                Demander une modification
              </Button>
              <Button variant="destructive" loading={pending === 'REJECT'} onClick={() => void submit('REJECT')}>
                <XCircle className="size-4" aria-hidden />
                Refuser
              </Button>
            </>
          ) : null}
        </div>

        {allowFeedback && !feedback ? (
          <Alert variant="info">
            L’acceptation se fait en un clic. Pour un refus ou une demande de modification, précisez un motif : il sera transmis à
            l’entreprise.
          </Alert>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={confirmAccept}
        onOpenChange={setConfirmAccept}
        title="Confirmer l’acceptation du devis ?"
        description="En acceptant, vous confirmez votre accord sur le montant, les lignes et les conditions du devis. L’entreprise sera notifiée immédiatement."
        confirmLabel="J’accepte le devis"
        destructive={false}
        loading={pending === 'ACCEPT'}
        onConfirm={() => void submit('ACCEPT')}
      />
    </Card>
  );
}
