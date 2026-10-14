import { requireOrganization } from '@/lib/auth/guards';
import { countUnread } from '@/lib/notifications';
import { getUsageOverview } from '@/lib/services/subscription';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { Alert } from '@/components/ui/display';
import { BadgeCheck } from 'lucide-react';
import Link from 'next/link';

/**
 * Gabarit de l'espace de travail connecté : barre latérale repliable,
 * barre supérieure (recherche, notifications, actions rapides) et zone de contenu.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireOrganization();
  const [unread, usage] = await Promise.all([
    countUnread(context.user.id).catch(() => 0),
    getUsageOverview(context.organization.id),
  ]);

  const { plan } = usage;
  const quotationLimit = plan.limits.quotationsPerMonth;
  const canCreateQuotation = quotationLimit === null || usage.quotationsThisMonth < quotationLimit;

  return (
    <div className="flex min-h-dvh bg-muted/40">
      <Sidebar
        organizationName={context.organization.name}
        planName={plan.planName}
        isAdmin={context.user.isPlatformAdmin}
        unreadCount={unread}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={{
            name: context.user.name,
            email: context.user.email,
            avatarUrl: context.user.avatarUrl,
            isPlatformAdmin: context.user.isPlatformAdmin,
          }}
          organization={{ id: context.organization.id, name: context.organization.name }}
          initialUnread={unread}
          canCreateQuotation={canCreateQuotation}
        />

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {!context.user.emailVerified ? (
            <Alert variant="warning" className="mb-6" icon={<BadgeCheck className="size-4" />}>
              Votre adresse e-mail n’est pas encore confirmée.{' '}
              <Link href="/verifier-email" className="font-medium underline underline-offset-4">
                Confirmer maintenant
              </Link>
            </Alert>
          ) : null}

          {!canCreateQuotation ? (
            <Alert variant="info" className="mb-6">
              Vous avez atteint votre limite mensuelle de devis ({quotationLimit}) sur la formule {plan.planName}.{' '}
              <Link href="/abonnement" className="font-medium underline underline-offset-4">
                Comparer les formules
              </Link>
            </Alert>
          ) : null}

          {children}
        </main>
      </div>
    </div>
  );
}
