import type { Metadata } from 'next';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { companyProfiles, organizationSettings, sessions } from '@/db/schema';
import { requireOrganization } from '@/lib/auth/guards';
import { listOrganizationsForUser } from '@/lib/services/organizations';
import { getNotificationPreferences } from '@/lib/notifications';
import { SettingsTabs, type SettingsData } from '@/components/settings/settings-tabs';

export const metadata: Metadata = {
  title: 'Paramètres',
  description: 'Profil, documents, notifications, sécurité, organisations et gestion de vos données.',
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const context = await requireOrganization();
  const params = await searchParams;
  const organizationId = context.organization.id;
  const userId = context.user.id;

  const [settings, company, organizations, preferences, activeSessions] = await Promise.all([
    db.select().from(organizationSettings).where(eq(organizationSettings.organizationId, organizationId)).limit(1),
    db.select().from(companyProfiles).where(eq(companyProfiles.organizationId, organizationId)).limit(1),
    listOrganizationsForUser(userId),
    getNotificationPreferences(userId),
    db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastSeenAt))
      .limit(10),
  ]);

  const organizationSettingsRow = settings[0];
  const companyRow = company[0];
  const deletionRequested = organizations.some((organization) => organization.deletionRequestedAt !== null);

  const data: SettingsData = {
    profile: {
      name: context.user.name,
      email: context.user.email,
      phone: null,
      locale: 'fr-FR',
      theme: context.user.theme,
      avatarUrl: context.user.avatarUrl,
      emailVerified: context.user.emailVerified,
      createdAt: context.user.createdAt.toISOString(),
    },
    company: {
      organizationName: context.organization.name,
      logoUrl: companyRow?.logoUrl ?? null,
      countryCode: companyRow?.countryCode ?? 'CI',
    },
    documents: {
      defaultCurrency: organizationSettingsRow?.defaultCurrency ?? 'XOF',
      defaultTaxRate: organizationSettingsRow?.defaultTaxRate ?? '18',
      defaultValidityDays: organizationSettingsRow?.defaultValidityDays ?? 30,
      defaultTemplateKey: organizationSettingsRow?.defaultTemplateKey ?? 'minimaliste',
      numberingFormat: organizationSettingsRow?.numberingFormat ?? 'DEV-{YYYY}-{SEQ:4}',
      numberingResetYearly: organizationSettingsRow?.numberingResetYearly ?? true,
      invoiceNumberingFormat: organizationSettingsRow?.invoiceNumberingFormat ?? 'FAC-{YYYY}-{SEQ:4}',
      invoiceDueDays: organizationSettingsRow?.invoiceDueDays ?? 30,
      pricesIncludeTax: organizationSettingsRow?.pricesIncludeTax ?? false,
      defaultPaymentTerms: organizationSettingsRow?.defaultPaymentTerms ?? null,
      defaultTerms: organizationSettingsRow?.defaultTerms ?? null,
      defaultNotes: organizationSettingsRow?.defaultNotes ?? null,
      brandColor: organizationSettingsRow?.brandColor ?? '#2563EB',
      brandColorSecondary: organizationSettingsRow?.brandColorSecondary ?? '#0F172A',
      logoPosition: organizationSettingsRow?.logoPosition ?? 'LEFT',
      emailReminders: organizationSettingsRow?.emailReminders ?? true,
      numberingNextValue: organizationSettingsRow?.numberingNextValue ?? 1,
      invoiceNumberingNextValue: organizationSettingsRow?.invoiceNumberingNextValue ?? 1,
    },
    notifications: {
      quotationViewed: preferences.quotationViewed,
      quotationAccepted: preferences.quotationAccepted,
      quotationRejected: preferences.quotationRejected,
      quotationExpiring: preferences.quotationExpiring,
      quotationExpired: preferences.quotationExpired,
      exportReady: preferences.exportReady,
      subscriptionUpdates: preferences.subscriptionUpdates,
      accountEvents: preferences.accountEvents,
      emailEnabled: preferences.emailEnabled,
      reminderDaysBefore: preferences.reminderDaysBefore,
    },
    organizations: organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      role: organization.role,
      planName: organization.planName,
      isActive: organization.id === organizationId,
    })),
    sessions: activeSessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      isCurrent: session.id === context.sessionId,
    })),
    deletionRequested,
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Profil, réglages des documents, notifications, sécurité et gestion de vos données —{' '}
          <span className="font-medium text-foreground">{context.organization.name}</span>.
        </p>
      </div>

      <SettingsTabs data={data} initialTab={params.onglet} />
    </div>
  );
}
