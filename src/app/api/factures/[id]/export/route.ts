import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { invoices } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import { generateInvoiceDocument, type ExportFormat } from '@/lib/documents';
import { recordAudit } from '@/lib/audit';
import { QuotaError } from '@/lib/auth/guards';
import { assertFeature, getOrganizationSubscription, incrementUsage } from '@/lib/services/subscription';

/**
 * GET /api/factures/[id]/export?format=pdf|docx|xlsx&download=1
 *
 * Le document est généré à la volée à partir des données réelles de la facture
 * (aucun fichier statique). Word et Excel sont réservés aux formules payantes ;
 * le filigrane est appliqué tant que l'organisation est en formule gratuite.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED: ExportFormat[] = ['pdf', 'docx', 'xlsx'];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });

  const { id } = await params;
  const url = new URL(request.url);
  const format = (url.searchParams.get('format') ?? 'pdf').toLowerCase() as ExportFormat;
  const download = url.searchParams.get('download') === '1';

  if (!ALLOWED.includes(format)) {
    return NextResponse.json({ error: 'Format non pris en charge (pdf, docx ou xlsx).' }, { status: 400 });
  }

  const organizationIds = session.memberships.map((membership) => membership.organizationId);
  const [invoice] = await db
    .select({ id: invoices.id, organizationId: invoices.organizationId })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);

  if (!invoice || !organizationIds.includes(invoice.organizationId)) {
    return NextResponse.json({ error: 'Facture introuvable.' }, { status: 404 });
  }

  const subscription = await getOrganizationSubscription(invoice.organizationId);

  try {
    if (format === 'docx') await assertFeature(invoice.organizationId, 'docx');
    if (format === 'xlsx') await assertFeature(invoice.organizationId, 'xlsx');

    const document = await generateInvoiceDocument({
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
      format,
      watermark: subscription.isFree,
    });

    await recordAudit({
      action: 'invoice.exported',
      entity: 'invoice',
      entityId: invoice.id,
      organizationId: invoice.organizationId,
      actorUserId: session.user.id,
      metadata: { format, size: document.size },
    }).catch(() => undefined);
    await incrementUsage(invoice.organizationId, `exports_${format}`, 1).catch(() => undefined);

    return new NextResponse(new Uint8Array(document.buffer), {
      headers: {
        'content-type': document.mimeType,
        'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(document.fileName)}"`,
        'content-length': String(document.size),
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof QuotaError) {
      return NextResponse.json({ error: error.message, code: 'FEATURE_LOCKED' }, { status: 402 });
    }
    const message = error instanceof Error ? error.message : 'Export impossible.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
