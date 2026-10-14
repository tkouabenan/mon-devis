import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { quotations } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import { generateQuotationDocument, type ExportFormat } from '@/lib/documents';
import { recordAudit } from '@/lib/audit';
import { QuotaError } from '@/lib/auth/guards';
import { assertFeature, getOrganizationSubscription, incrementUsage } from '@/lib/services/subscription';

/**
 * GET /api/devis/[id]/export?format=pdf|docx|xlsx
 *
 * Renvoie le document généré à la volée (aucun fichier statique, aucun disque).
 * L'accès est vérifié : l'utilisateur doit être membre de l'organisation
 * propriétaire du devis. Le filigrane est appliqué selon la formule.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED: ExportFormat[] = ['pdf', 'docx', 'xlsx'];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const format = (url.searchParams.get('format') ?? 'pdf').toLowerCase() as ExportFormat;
  const download = url.searchParams.get('download') === '1';

  if (!ALLOWED.includes(format)) {
    return NextResponse.json({ error: 'Format non pris en charge (pdf, docx ou xlsx).' }, { status: 400 });
  }

  // Cloisonnement : le devis doit appartenir à l'une des organisations de l'utilisateur.
  const organizationIds = session.memberships.map((membership) => membership.organizationId);
  if (organizationIds.length === 0) {
    return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 403 });
  }

  const [quotation] = await db
    .select({ id: quotations.id, organizationId: quotations.organizationId, number: quotations.number })
    .from(quotations)
    .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)))
    .limit(1);

  if (!quotation || !organizationIds.includes(quotation.organizationId)) {
    return NextResponse.json({ error: 'Devis introuvable.' }, { status: 404 });
  }

  try {
    if (format !== 'pdf') {
      // Les formats Word et Excel sont réservés aux formules payantes.
      await assertFeature(quotation.organizationId, format);
    }

    const subscription = await getOrganizationSubscription(quotation.organizationId);
    const watermark = subscription.isFree;

    const document = await generateQuotationDocument({
      organizationId: quotation.organizationId,
      quotationId: id,
      format,
      watermark,
    });

    await recordAudit({
      action: 'quotation.export',
      entity: 'quotation',
      entityId: id,
      organizationId: quotation.organizationId,
      actorUserId: session.user.id,
      metadata: { format, bytes: document.size, watermark },
    });

    await incrementUsage(quotation.organizationId, format === 'pdf' ? 'pdf_export' : format === 'docx' ? 'docx_export' : 'xlsx_export').catch(
      () => undefined,
    );

    return new NextResponse(new Uint8Array(document.buffer), {
      status: 200,
      headers: {
        'Content-Type': document.mimeType,
        'Content-Length': String(document.size),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${document.fileName}"; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
        'Cache-Control': 'no-store',
        'X-Quotation-Number': document.quotationNumber,
      },
    });
  } catch (error) {
    if (error instanceof QuotaError) {
      return NextResponse.json({ error: error.message, code: 'FEATURE_LOCKED', details: error.details }, { status: 402 });
    }
    console.error('[export] échec:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'La génération du document a échoué. Réessayez dans un instant.' }, { status: 500 });
  }
}
