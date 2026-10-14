import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getStatisticsOverview, resolvePeriod, type PeriodPreset } from '@/lib/services/analytics';
import { renderStatisticsPdf, renderStatisticsXlsx } from '@/lib/documents/analytics-export';
import { recordAudit } from '@/lib/audit';

/**
 * GET /api/statistiques/export?format=xlsx|pdf&periode=…&devise=…&du=…&au=…
 *
 * Génère à la volée l'export des statistiques de l'organisation active.
 * Le fichier contient uniquement les données réelles de l'organisation connectée.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fileSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  const organization = session.activeOrganization;
  if (!organization) {
    return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const format = (url.searchParams.get('format') ?? 'xlsx').toLowerCase();
  if (format !== 'xlsx' && format !== 'pdf') {
    return NextResponse.json({ error: 'Format non pris en charge (xlsx ou pdf).' }, { status: 400 });
  }

  const period = resolvePeriod(
    (url.searchParams.get('periode') as PeriodPreset) ?? '90d',
    url.searchParams.get('du'),
    url.searchParams.get('au'),
  );
  const currency = url.searchParams.get('devise') ?? 'XOF';

  const overview = await getStatisticsOverview(organization.id, period, currency);
  const dateRange = `${period.from.toISOString().slice(0, 10)}_${period.to.toISOString().slice(0, 10)}`;

  await recordAudit({
    action: `statistics.export_${format}`,
    entity: 'organization',
    entityId: organization.id,
    organizationId: organization.id,
    actorUserId: session.user.id,
    metadata: { period: period.preset, currency, from: dateRange },
  }).catch(() => undefined);

  if (format === 'xlsx') {
    const buffer = await renderStatisticsXlsx(overview, organization.name);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="MON-DEVIS_statistiques_${fileSlug(organization.name)}_${dateRange}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const buffer = await renderStatisticsPdf(overview, organization.name);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="MON-DEVIS_statistiques_${fileSlug(organization.name)}_${dateRange}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
