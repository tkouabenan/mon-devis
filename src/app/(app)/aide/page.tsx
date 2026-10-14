import Link from 'next/link';
import type { Metadata } from 'next';
import { and, desc, eq } from 'drizzle-orm';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  CreditCard,
  FileText,
  LifeBuoy,
  Mail,
  Receipt,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { db } from '@/db';
import { supportTickets } from '@/db/schema';
import { requireOrganization } from '@/lib/auth/guards';
import { SupportForm } from '@/components/support/support-form';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@/components/ui/display';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Aide & support',
  description: 'Guides essentiels, questions fréquentes et contact avec l’équipe MON DEVIS.',
};

const GUIDES = [
  {
    icon: FileText,
    title: 'Créer un devis complet',
    description: 'Choisissez un client, ajoutez vos lignes, laissez les totaux et la TVA se calculer, puis exportez en PDF, Word ou Excel.',
    href: '/devis/nouveau',
    action: 'Créer un devis',
  },
  {
    icon: Mail,
    title: 'Faire valider un devis par le client',
    description: 'Générez un lien de partage sécurisé : le client consulte le devis, l’accepte, le refuse avec un motif ou demande une modification.',
    href: '/devis',
    action: 'Ouvrir mes devis',
  },
  {
    icon: Receipt,
    title: 'Convertir un devis accepté en facture',
    description: 'La facture reprend les lignes et les mentions du devis au moment de l’acceptation, puis suit ses propres règlements.',
    href: '/factures',
    action: 'Voir mes factures',
  },
  {
    icon: BarChart3,
    title: 'Suivre mon activité',
    description: 'Taux d’acceptation, délai de réponse des clients, meilleurs clients et prestations : tout est calculé depuis vos données réelles.',
    href: '/statistiques',
    action: 'Voir mes statistiques',
  },
  {
    icon: Sparkles,
    title: 'Personnaliser mes documents',
    description: 'Huit modèles, vos couleurs, votre logo et vos mentions légales : ce que vous voyez dans l’aperçu est ce qui sortira à l’export.',
    href: '/modeles',
    action: 'Choisir un modèle',
  },
  {
    icon: CreditCard,
    title: 'Gérer mon abonnement',
    description: 'Consultez votre formule, votre consommation du mois et les limites réellement appliquées à votre espace.',
    href: '/abonnement',
    action: 'Voir mon abonnement',
  },
];

const FAQ = [
  {
    question: 'Mes devis sont-ils cloisonnés entre mes organisations ?',
    answer:
      'Oui. Chaque requête est filtrée par organisation : changer d’espace de travail change l’intégralité des données visibles. Un membre d’une organisation ne peut jamais lire les documents d’une autre.',
  },
  {
    question: 'Pourquoi mon export Word ou Excel est-il indisponible ?',
    answer:
      'Les formats Word (.docx) et Excel (.xlsx) sont réservés aux formules payantes ; le PDF reste disponible sur toutes les formules (avec un filigrane sur la formule gratuite). La contrainte est vérifiée côté serveur, pas seulement dans l’interface.',
  },
  {
    question: 'Les totaux sont-ils recalculés quand je modifie un devis ?',
    answer:
      'Oui. Les montants sont recalculés côté serveur en arithmétique décimale (jamais en nombres à virgule flottante) à chaque enregistrement. Ce que vous voyez dans l’aperçu correspond exactement à ce qui est stocké et exporté.',
  },
  {
    question: 'Une facture change-t-elle si je modifie le devis d’origine ?',
    answer:
      'Non. La conversion fige une copie des lignes, du client et de vos mentions au moment de l’acceptation : la facture reste cohérente même si le devis est modifié plus tard.',
  },
  {
    question: 'Comment suivre la consultation d’un devis ?',
    answer:
      'Uniquement lorsqu’elle est réellement observable : nous enregistrons l’ouverture du lien de partage que vous avez généré. Aucun événement de consultation n’est inventé pour un devis envoyé par un autre canal.',
  },
  {
    question: 'Puis-je être prévenu avant l’expiration d’un devis ?',
    answer:
      'Oui : les alertes d’expiration, d’acceptation, de refus et d’échéance de facture sont configurables dans Paramètres → Notifications. Les e-mails ne partent que si un fournisseur d’envoi est configuré pour votre espace.',
  },
  {
    question: 'Comment supprimer mon compte ?',
    answer:
      'Depuis Paramètres → Données & compte. La demande est horodatée, tracée et vérifiée par un administrateur avant exécution ; les documents comptables légalement obligatoires sont conservés pendant la durée légale.',
  },
];

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouverte',
  IN_PROGRESS: 'En cours de traitement',
  RESOLVED: 'Résolue',
  CLOSED: 'Fermée',
};

export default async function HelpPage() {
  const context = await requireOrganization();
  const organizationId = context.organization.id;

  const tickets = await db
    .select()
    .from(supportTickets)
    .where(and(eq(supportTickets.organizationId, organizationId)))
    .orderBy(desc(supportTickets.createdAt))
    .limit(10);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Aide &amp; support</h1>
        <p className="text-sm text-muted-foreground">
          Guides rapides, réponses aux questions fréquentes et contact direct avec l’équipe MON DEVIS.
        </p>
      </div>

      <Alert variant="info" title="Assistance par e-mail" icon={<LifeBuoy className="h-4 w-4" aria-hidden />}>
        Le support répond sous un jour ouvré. Pour les formules Business, la demande est traitée en priorité. Indiquez toujours le
        numéro du devis ou de la facture concerné.
      </Alert>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <BookOpen className="h-4 w-4 text-primary" aria-hidden />
          Guides essentiels
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {GUIDES.map((guide) => {
            const Icon = guide.icon;
            return (
              <Card key={guide.title} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 pt-5">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="space-y-1">
                    <h3 className="font-display text-sm font-semibold">{guide.title}</h3>
                    <p className="text-sm text-muted-foreground">{guide.description}</p>
                  </div>
                  <div className="mt-auto">
                    <Button asChild variant="outline" size="sm">
                      <Link href={guide.href}>{guide.action}</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Questions fréquentes</h2>
          <div className="space-y-2">
            {FAQ.map((entry) => (
              <details key={entry.question} className="group rounded-xl border border-border bg-card p-4">
                <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
                  {entry.question}
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary opacity-60 transition-opacity group-open:opacity-100" aria-hidden />
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{entry.answer}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <SupportForm />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                Mes demandes
              </CardTitle>
              <CardDescription>Historique de vos échanges avec l’équipe MON DEVIS.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {tickets.length === 0 ? (
                <EmptyState
                  icon={<LifeBuoy className="h-6 w-6" aria-hidden />}
                  title="Aucune demande pour le moment"
                  description="Vos demandes d’assistance et de changement de formule apparaîtront ici, avec leur statut et la réponse de l’équipe."
                />
              ) : (
                tickets.map((ticket) => (
                  <div key={ticket.id} className="space-y-1.5 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{ticket.subject}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant={ticket.status === 'OPEN' ? 'default' : ticket.status === 'RESOLVED' ? 'success' : 'secondary'}>
                          {STATUS_LABELS[ticket.status] ?? ticket.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {ticket.createdAt.toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    </div>
                    <p className="whitespace-pre-line text-xs text-muted-foreground">{ticket.message.slice(0, 240)}</p>
                    {ticket.adminReply ? (
                      <p className="rounded-md bg-muted/60 p-2 text-xs">
                        <span className="font-medium">Réponse de l’équipe : </span>
                        {ticket.adminReply}
                      </p>
                    ) : (
                      <p className="text-xs italic text-muted-foreground">En attente de réponse de l’équipe.</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5 text-sm text-muted-foreground">
          <span>
            Une question sur la facturation de votre abonnement ou une demande de facture au nom de votre société ?
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href="/abonnement">Consulter mon abonnement</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
