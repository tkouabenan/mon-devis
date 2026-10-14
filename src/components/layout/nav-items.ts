import {
  BarChart3,
  Building2,
  CreditCard,
  FilePlus2,
  Files,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Navigation principale de l'espace de travail.
 * L'ordre suit le parcours utilisateur : produire, suivre, administrer.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Préfixes d'URL considérés comme actifs (pour surligner l'entrée). */
  match?: string[];
  /** Visible uniquement pour les propriétaires / administrateurs. */
  manageOnly?: boolean;
  badge?: 'notifications' | 'usage';
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Pilotage',
    items: [
      { href: '/tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard },
      { href: '/statistiques', label: 'Statistiques', icon: BarChart3 },
    ],
  },
  {
    title: 'Devis',
    items: [
      { href: '/devis', label: 'Mes devis', icon: Files, match: ['/devis'] },
      { href: '/devis/nouveau', label: 'Nouveau devis', icon: FilePlus2, match: ['/devis/nouveau'] },
      { href: '/clients', label: 'Clients', icon: Users, match: ['/clients'] },
      { href: '/produits', label: 'Produits & Services', icon: Package, match: ['/produits'] },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { href: '/modeles', label: 'Modèles de devis', icon: FilePlus2 },
      { href: '/mon-entreprise', label: 'Mon entreprise', icon: Building2, match: ['/mon-entreprise'] },
      { href: '/abonnement', label: 'Abonnement', icon: CreditCard, match: ['/abonnement'] },
      { href: '/parametres', label: 'Paramètres', icon: Settings, match: ['/parametres'] },
      { href: '/aide', label: 'Aide & support', icon: LifeBuoy },
    ],
  },
];

/** Fil d'Ariane simplifié : libellé lisible déduit de l'URL. */
export function labelForPath(pathname: string): string {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.href === pathname) return item.label;
    }
  }
  const segments = pathname.split('/').filter(Boolean);
  const known: Record<string, string> = {
    devis: 'Devis',
    clients: 'Clients',
    produits: 'Produits & Services',
    parametres: 'Paramètres',
    statistiques: 'Statistiques',
    onboarding: 'Configuration',
  };
  const last = segments[segments.length - 1] ?? '';
  return known[last] ?? (last ? last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ') : 'Espace de travail');
}
