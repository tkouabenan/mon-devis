'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu, X, LayoutDashboard } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '#fonctionnalites', label: 'Fonctionnalités' },
  { href: '#comment-ca-marche', label: 'Comment ça marche' },
  { href: '#tarifs', label: 'Tarifs' },
  { href: '#faq', label: 'FAQ' },
];

export function SiteHeader({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full border-b transition-all duration-300',
        scrolled
          ? 'border-border/80 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70'
          : 'border-transparent bg-transparent',
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="rounded-lg" aria-label="MON DEVIS — accueil">
          <Logo size="md" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle compact />
          {isAuthenticated ? (
            <Button asChild variant="gradient" size="sm">
              <Link href="/tableau-de-bord">
                <LayoutDashboard className="size-4" /> Mon tableau de bord
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/connexion">Connexion</Link>
              </Button>
              <Button asChild variant="gradient" size="sm">
                <Link href="/inscription">Créer mon devis gratuitement</Link>
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle compact />
          <Button variant="ghost" size="icon" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Ouvrir le menu">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border bg-background px-4 pb-6 pt-4 lg:hidden">
          <nav className="flex flex-col gap-1" aria-label="Navigation mobile">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Accueil
            </Link>
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            {isAuthenticated ? (
              <Button asChild variant="gradient">
                <Link href="/tableau-de-bord" onClick={() => setOpen(false)}>
                  Mon tableau de bord
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="gradient">
                  <Link href="/inscription" onClick={() => setOpen(false)}>
                    Créer mon devis gratuitement
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/connexion" onClick={() => setOpen(false)}>
                    Connexion
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
