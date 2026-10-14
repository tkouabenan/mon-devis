import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { customers, quotations } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import { rateLimit, clientIp, RateLimits } from '@/lib/rate-limit';

/**
 * GET /api/recherche?q=… — recherche globale (devis + clients) de l'organisation
 * active. Réponse volontairement compacte : elle alimente la liste déroulante
 * de la barre supérieure.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.activeOrganization) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  const limit = rateLimit(`search:${session.user.id}:${clientIp(request.headers) ?? 'unknown'}`, RateLimits.search.max, RateLimits.search.window);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Trop de recherches. Patientez un instant.' }, { status: 429 });
  }

  const url = new URL(request.url);
  const term = (url.searchParams.get('q') ?? '').trim();
  if (term.length < 2) {
    return NextResponse.json({ quotations: [], customers: [] });
  }

  const organizationId = session.activeOrganization.id;
  const like = `%${term}%`;

  const [quotationRows, customerRows] = await Promise.all([
    db
      .select({
        id: quotations.id,
        number: quotations.number,
        title: quotations.title,
        total: quotations.total,
        currency: quotations.currency,
      })
      .from(quotations)
      .where(
        and(
          eq(quotations.organizationId, organizationId),
          isNull(quotations.deletedAt),
          or(
            ilike(quotations.number, like),
            ilike(quotations.title, like),
            sql`${quotations.customerSnapshot} ->> 'name' ilike ${like}`,
            sql`${quotations.customerSnapshot} ->> 'companyName' ilike ${like}`,
          ),
        ),
      )
      .orderBy(desc(quotations.issueDate))
      .limit(5),
    db
      .select({ id: customers.id, name: customers.name, companyName: customers.companyName, city: customers.city, email: customers.email })
      .from(customers)
      .where(
        and(
          eq(customers.organizationId, organizationId),
          or(ilike(customers.name, like), ilike(sql`coalesce(${customers.companyName}, '')`, like), ilike(sql`coalesce(${customers.email}, '')`, like)),
        ),
      )
      .limit(5),
  ]);

  return NextResponse.json({
    quotations: quotationRows.map((row) => ({
      id: row.id,
      label: row.number,
      hint: `${row.title} · ${Number(row.total).toLocaleString('fr-FR')} ${row.currency}`,
    })),
    customers: customerRows.map((row) => ({
      id: row.id,
      label: row.companyName || row.name,
      hint: [row.companyName ? row.name : null, row.city, row.email].filter(Boolean).join(' · ') || 'Client',
    })),
  });
}
