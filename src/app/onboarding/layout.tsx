import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { LogoutMenuItem } from '@/components/auth/logout-menu-item';

/** Gabarit de l'assistant de configuration initiale (après inscription). */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="container-page flex h-16 items-center justify-between">
          <Link href="/" aria-label="MON DEVIS — accueil">
            <Logo size="sm" />
          </Link>
          <LogoutMenuItem />
        </div>
      </header>
      <main className="container-page py-8 sm:py-12">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
