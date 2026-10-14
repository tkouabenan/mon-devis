import Link from 'next/link';
import { Mail, MapPin, Phone, Linkedin, Facebook, Twitter } from 'lucide-react';
import { Logo } from '@/components/brand/logo';

const PRODUCT_LINKS = [
  { href: '/#fonctionnalites', label: 'Fonctionnalités' },
  { href: '/#tarifs', label: 'Tarifs' },
  { href: '/#comment-ca-marche', label: 'Comment ça marche' },
  { href: '/#faq', label: 'FAQ' },
];

const USAGE_LINKS = [
  { href: '/inscription', label: 'Créer un devis' },
  { href: '/inscription', label: 'Gérer mes clients' },
  { href: '/inscription', label: 'Exporter en PDF, Word, Excel' },
  { href: '/inscription', label: 'Suivre mes statistiques' },
];

const LEGAL_LINKS = [
  { href: '/cgu', label: 'Conditions générales' },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: '/cgu#securite', label: 'Sécurité des données' },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container-page py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo size="md" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              La façon la plus simple de créer, personnaliser, envoyer et suivre vos devis professionnels.
            </p>
            <div className="mt-5 space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <Mail className="size-4 shrink-0 text-primary" />
                <a href="mailto:contact@mon-devis.app" className="transition-colors hover:text-foreground">
                  contact@mon-devis.app
                </a>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="size-4 shrink-0 text-primary" />
                <a href="tel:+2252722495051" className="transition-colors hover:text-foreground">
                  +225 27 22 49 50 51
                </a>
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Abidjan, Côte d’Ivoire</span>
              </p>
            </div>
          </div>

          <div>
            <p className="label-caps mb-4">Produit</p>
            <ul className="space-y-2.5 text-sm">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="label-caps mb-4">Cas d’usage</p>
            <ul className="space-y-2.5 text-sm">
              {USAGE_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="label-caps mb-4">Informations légales</p>
            <ul className="space-y-2.5 text-sm">
              {LEGAL_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center gap-2">
              {[
                { icon: Linkedin, label: 'LinkedIn', href: 'https://www.linkedin.com' },
                { icon: Facebook, label: 'Facebook', href: 'https://www.facebook.com' },
                { icon: Twitter, label: 'X', href: 'https://x.com' },
              ].map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  aria-label={social.label}
                >
                  <social.icon className="size-4" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} MON DEVIS. Tous droits réservés.</p>
          <p className="flex flex-wrap items-center justify-center gap-4">
            <span>Montants stockés en précision décimale</span>
            <span className="hidden sm:inline">·</span>
            <span>Données isolées par entreprise</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
