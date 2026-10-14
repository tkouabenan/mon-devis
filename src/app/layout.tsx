import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { DEFAULT_LOCALE, intlLocale, localeFromAcceptLanguage } from '@/lib/i18n';
import { I18nProvider } from '@/components/i18n-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/overlay';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'MON DEVIS — Créez des devis professionnels en quelques clics',
    template: '%s · MON DEVIS',
  },
  description:
    'MON DEVIS est la plateforme tout-en-un pour créer, personnaliser, envoyer et suivre vos devis professionnels. Exports PDF, Word et Excel, gestion client, statistiques en temps réel.',
  applicationName: 'MON DEVIS',
  keywords: [
    'devis',
    'devis professionnel',
    'logiciel de devis',
    'facturation',
    'artisan',
    'freelance',
    'PME',
    'Côte d’Ivoire',
    'FCFA',
  ],
  authors: [{ name: 'MON DEVIS' }],
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'MON DEVIS',
    title: 'MON DEVIS — Créez des devis professionnels en moins de 3 minutes',
    description:
      'Créez, personnalisez et téléchargez vos devis professionnels en quelques clics. Export PDF, Word et Excel inclus.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MON DEVIS — Devis professionnels en quelques clics',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8FAFC' },
    { media: '(prefers-color-scheme: dark)', color: '#0F172A' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Locale résolue côté serveur (préférence utilisateur appliquée plus haut dans l'arborescence).
  const headerList = await headers();
  const locale = localeFromAcceptLanguage(headerList.get('accept-language')) ?? DEFAULT_LOCALE;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Polices chargées côté navigateur (aucune dépendance réseau au build). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
        />
      </head>
      <body
        className="min-h-screen font-sans"
        style={
          {
            '--font-sans': "'Inter', ui-sans-serif, system-ui, sans-serif",
            '--font-display': "'Plus Jakarta Sans', 'Inter', ui-sans-serif, sans-serif",
          } as React.CSSProperties
        }
      >
        <ThemeProvider>
          <I18nProvider locale={locale}>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
