import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { buildCustomersCsv } from '@/app/actions/customers';
import { recordAudit } from '@/lib/audit';

/**
 * GET /api/clients/export
 *
 * Export CSV (séparateur point-virgule, encodage UTF-8 avec BOM pour Excel)
 * contenant les données réelles des clients de l'organisation active.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });

  const url = new URL(request.url);
  const requested = url.searchParams.get('organisation') ?? session.activeOrganization?.id ?? '';
  const membership = session.memberships.find((entry) => entry.organizationId === requested);
  if (!membership) return NextResponse.json({ error: 'Organisation inconnue.' }, { status: 403 });
  const organizationId = membership.organizationId;

  const csv = await buildCustomersCsv(organizationId);
  await recordAudit({
    action: 'customer.exported',
    entity: 'customer',
    organizationId,
    actorUserId: session.user.id,
    metadata: { format: 'csv' },
  }).catch(() => undefined);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="MON-DEVIS_clients_${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
