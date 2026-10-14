import Link from 'next/link';
import { BadgeCheck, FileSpreadsheet, Palette, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/brand/logo';

/**
 * Gabarit des écrans d'authentification : deux colonnes sur grand écran
 * (présentation de la marque à gauche, formulaire à droite).
 */

const highlights = [
  {
    icon: FileSpreadsheet,
    title: 'Devis complets en 3 minutes',
    description: 'Lignes illimitées, remises, TVA, acompte et calculs automatiques.',
  },
  {
    icon: Palette,
    title: '8 modèles premium',
    description: 'Personnalisez couleurs, typographie et mise en page, puis exportez.',
  },
  {
    icon: BadgeCheck,
    title: 'Acceptation en ligne',
    description: 'Vos clients approuvent par lien sécurisé, horodaté et révocable.',
  },
  {
    icon: ShieldCheck,
    title: 'Vos données isolées',
    description: 'Chaque organisation est cloisonnée, avec journal d’audit complet.',
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-navy-900 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-primary-600/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-16 size-96 rounded-full bg-success/20 blur-3xl"
        />

        <div className="relative">
          <Link href="/" className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            <Logo variant="light" size="md" />
          </Link>
        </div>

        <div className="relative max-w-lg space-y-8">
          <div className="space-y-4">
            <p className="label-caps text-primary-200">Gestion de devis</p>
            <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight xl:text-4xl">
              Créez des devis professionnels en moins de 3 minutes.
            </h1>
            <p className="text-base text-white/70">
              Conçu pour les entreprises, artisans et indépendants : rédaction, suivi, relances, export PDF/Word/Excel
              et acceptation client — au même endroit.
            </p>
          </div>

          <ul className="space-y-5">
            {highlights.map((item) => (
              <li key={item.title} className="flex gap-4">
                <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-primary-200">
                  <item.icon className="size-4.5" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{item.title}</span>
                  <span className="block text-sm text-white/60">{item.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-6 text-xs text-white/50">
          <span>XOF · EUR · USD · XAF · GBP</span>
          <span aria-hidden>•</span>
          <span>Français</span>
          <span aria-hidden>•</span>
          <span>Export PDF / Word / Excel</span>
        </div>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-8 lg:py-12">
        <div className="flex items-center justify-between lg:justify-end">
          <Link href="/" className="lg:hidden" aria-label="Retour à l’accueil">
            <Logo size="sm" />
          </Link>
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Retour au site
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md">{children}</div>
        </div>

        <footer className="mx-auto w-full max-w-md text-center text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} MON DEVIS ·{' '}
            <Link href="/cgu" className="underline-offset-4 hover:underline">
              Conditions générales
            </Link>{' '}
            ·{' '}
            <Link href="/confidentialite" className="underline-offset-4 hover:underline">
              Confidentialité
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
