import { getSession } from '@/lib/auth/session';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession().catch(() => null);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader isAuthenticated={Boolean(session)} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
