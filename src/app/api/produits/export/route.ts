import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { buildProductsCsv, buildProductsCsvTemplate } from '@/app/actions/products';
import { recordAudit } from '@/lib/audit';

/**
 * GET /api/produits/export            → export CSV du catalogue
 * GET /api/produits/export?modele=1   → modèle d'import (colonnes attendues)
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });

  const url = new URL(request.url);
  const template = url.searchParams.get('modele') === '1';
  const requested = url.searchParams.get('organisation') ?? session.activeOrganization?.id ?? '';
  const membership = session.memberships.find((entry) => entry.organizationId === requested);
  if (!membership) return NextResponse.json({ error: 'Organisation inconnue.' }, { status: 403 });
  const organizationId = membership.organizationId;

  const csv = template ? await buildProductsCsvTemplate() : await buildProductsCsv(organizationId);
  if (!template) {
    await recordAudit({
      action: 'product.exported',
      entity: 'product',
      organizationId,
      actorUserId: session.user.id,
      metadata: { format: 'csv' },
    }).catch(() => undefined);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = template ? 'MON-DEVIS_modele-import-produits.csv' : `MON-DEVIS_produits_${stamp}.csv`;
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    },
  });
}
