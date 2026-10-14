/**
 * Modèles de devis professionnels.
 *
 * Un modèle est décrit par un objet `style` sérialisable (JSON) : il est ainsi
 * partagé par l'aperçu HTML de l'éditeur, le générateur PDF, le générateur DOCX
 * et le générateur XLSX. Une seule source de vérité pour l'apparence du document.
 */

export interface TemplateColors {
  primary: string;
  secondary: string;
  accent: string;
  headerBackground: string;
  headerText: string;
  tableHeaderBackground: string;
  tableHeaderText: string;
  tableAltRow: string;
  border: string;
  text: string;
  muted: string;
}

export interface TemplateLayout {
  /** Disposition de l'en-tête du document. */
  header: 'classic' | 'split' | 'banner' | 'minimal';
  /** Barre latérale colorée sur la première section. */
  accentBar: boolean;
  /** Bloc « total » mis en avant. */
  highlightedTotal: boolean;
  /** Bandeau de pied de page coloré. */
  footerBand: boolean;
}

export interface TemplateTable {
  style: 'lined' | 'striped' | 'minimal' | 'boxed';
  headerStyle: 'filled' | 'underlined' | 'plain';
  cellPadding: number;
  borderRadius: number;
}

export interface TemplateTypography {
  headingFont: string;
  bodyFont: string;
  titleSize: number;
  baseSize: number;
  titleWeight: 'normal' | 'bold';
  uppercaseTitles: boolean;
  letterSpacing: number;
}

export interface TemplateVisibility {
  logo: boolean;
  paymentInfo: boolean;
  bankDetails: boolean;
  terms: boolean;
  notes: boolean;
  signature: boolean;
  taxBreakdown: boolean;
  itemDescriptions: boolean;
  unitColumn: boolean;
  discountColumn: boolean;
  taxColumn: boolean;
  validityDate: boolean;
}

export interface TemplateStyle {
  key: string;
  name: string;
  description: string;
  category: 'Essentiel' | 'Professionnel' | 'Premium' | 'Sectoriel';
  colors: TemplateColors;
  layout: TemplateLayout;
  table: TemplateTable;
  typography: TemplateTypography;
  visibility: TemplateVisibility;
  /** Espacement vertical entre sections (points). */
  sectionGap: number;
  /** Marge intérieure de page (points). */
  pagePadding: number;
  /** Modèles réservés aux plans payants. */
  premium: boolean;
  /** Petit intitulé affiché dans la galerie. */
  badge?: string;
}

const baseVisibility: TemplateVisibility = {
  logo: true,
  paymentInfo: true,
  bankDetails: true,
  terms: true,
  notes: true,
  signature: true,
  taxBreakdown: true,
  itemDescriptions: true,
  unitColumn: true,
  discountColumn: true,
  taxColumn: true,
  validityDate: true,
};

export const QUOTATION_TEMPLATES: TemplateStyle[] = [
  {
    key: 'minimaliste',
    name: 'Minimaliste',
    description: 'Épuré et lisible : l’essentiel, sans artifice. Idéal pour les devis courts.',
    category: 'Essentiel',
    badge: 'Populaire',
    premium: false,
    sectionGap: 22,
    pagePadding: 48,
    colors: {
      primary: '#2563EB',
      secondary: '#0F172A',
      accent: '#10B981',
      headerBackground: '#FFFFFF',
      headerText: '#0F172A',
      tableHeaderBackground: '#F8FAFC',
      tableHeaderText: '#475569',
      tableAltRow: '#FBFDFF',
      border: '#E2E8F0',
      text: '#1E293B',
      muted: '#64748B',
    },
    layout: { header: 'minimal', accentBar: false, highlightedTotal: false, footerBand: false },
    table: { style: 'lined', headerStyle: 'underlined', cellPadding: 9, borderRadius: 0 },
    typography: {
      headingFont: 'Helvetica',
      bodyFont: 'Helvetica',
      titleSize: 24,
      baseSize: 9.5,
      titleWeight: 'bold',
      uppercaseTitles: false,
      letterSpacing: 0,
    },
    visibility: { ...baseVisibility },
  },
  {
    key: 'corporate',
    name: 'Corporate',
    description: 'En-tête institutionnel avec bandeau de couleur et blocs structurés.',
    category: 'Professionnel',
    premium: false,
    sectionGap: 26,
    pagePadding: 52,
    colors: {
      primary: '#1D4ED8',
      secondary: '#0F172A',
      accent: '#0EA5E9',
      headerBackground: '#0F172A',
      headerText: '#FFFFFF',
      tableHeaderBackground: '#1D4ED8',
      tableHeaderText: '#FFFFFF',
      tableAltRow: '#F1F5F9',
      border: '#CBD5E1',
      text: '#1E293B',
      muted: '#64748B',
    },
    layout: { header: 'banner', accentBar: true, highlightedTotal: true, footerBand: true },
    table: { style: 'striped', headerStyle: 'filled', cellPadding: 10, borderRadius: 2 },
    typography: {
      headingFont: 'Helvetica-Bold',
      bodyFont: 'Helvetica',
      titleSize: 22,
      baseSize: 9.5,
      titleWeight: 'bold',
      uppercaseTitles: true,
      letterSpacing: 0.6,
    },
    visibility: { ...baseVisibility },
  },
  {
    key: 'moderne',
    name: 'Moderne',
    description: 'Composition contemporaine, titres colorés et total mis en avant.',
    category: 'Professionnel',
    badge: 'Recommandé',
    premium: false,
    sectionGap: 28,
    pagePadding: 50,
    colors: {
      primary: '#2563EB',
      secondary: '#0F172A',
      accent: '#10B981',
      headerBackground: '#FFFFFF',
      headerText: '#0F172A',
      tableHeaderBackground: '#EFF6FF',
      tableHeaderText: '#1D4ED8',
      tableAltRow: '#F8FAFC',
      border: '#DBEAFE',
      text: '#0F172A',
      muted: '#64748B',
    },
    layout: { header: 'split', accentBar: true, highlightedTotal: true, footerBand: false },
    table: { style: 'striped', headerStyle: 'filled', cellPadding: 10, borderRadius: 8 },
    typography: {
      headingFont: 'Helvetica-Bold',
      bodyFont: 'Helvetica',
      titleSize: 26,
      baseSize: 9.5,
      titleWeight: 'bold',
      uppercaseTitles: false,
      letterSpacing: -0.2,
    },
    visibility: { ...baseVisibility },
  },
  {
    key: 'elegant',
    name: 'Élégant',
    description: 'Typographie raffinée, filets fins et mise en page haut de gamme.',
    category: 'Premium',
    badge: 'Premium',
    premium: true,
    sectionGap: 30,
    pagePadding: 56,
    colors: {
      primary: '#7C3AED',
      secondary: '#111827',
      accent: '#D4AF37',
      headerBackground: '#FFFFFF',
      headerText: '#111827',
      tableHeaderBackground: '#FFFFFF',
      tableHeaderText: '#7C3AED',
      tableAltRow: '#FAF9FF',
      border: '#E9E5F5',
      text: '#1F2937',
      muted: '#6B7280',
    },
    layout: { header: 'classic', accentBar: false, highlightedTotal: true, footerBand: false },
    table: { style: 'lined', headerStyle: 'underlined', cellPadding: 11, borderRadius: 0 },
    typography: {
      headingFont: 'Times-Bold',
      bodyFont: 'Times-Roman',
      titleSize: 24,
      baseSize: 10,
      titleWeight: 'bold',
      uppercaseTitles: false,
      letterSpacing: 0.4,
    },
    visibility: { ...baseVisibility },
  },
  {
    key: 'btp',
    name: 'Construction & BTP',
    description: 'Conçu pour les chantiers : quantités, unités et remises bien visibles.',
    category: 'Sectoriel',
    badge: 'BTP',
    premium: false,
    sectionGap: 24,
    pagePadding: 46,
    colors: {
      primary: '#B45309',
      secondary: '#1C1917',
      accent: '#F59E0B',
      headerBackground: '#1C1917',
      headerText: '#FFFFFF',
      tableHeaderBackground: '#B45309',
      tableHeaderText: '#FFFFFF',
      tableAltRow: '#FFFBEB',
      border: '#E7E5E4',
      text: '#1C1917',
      muted: '#78716C',
    },
    layout: { header: 'banner', accentBar: true, highlightedTotal: true, footerBand: true },
    table: { style: 'boxed', headerStyle: 'filled', cellPadding: 10, borderRadius: 2 },
    typography: {
      headingFont: 'Helvetica-Bold',
      bodyFont: 'Helvetica',
      titleSize: 21,
      baseSize: 9,
      titleWeight: 'bold',
      uppercaseTitles: true,
      letterSpacing: 0.8,
    },
    visibility: { ...baseVisibility, signature: true },
  },
  {
    key: 'freelance',
    name: 'Freelance',
    description: 'Personnel et direct : votre marque au centre, conditions claires.',
    category: 'Essentiel',
    premium: false,
    sectionGap: 24,
    pagePadding: 48,
    colors: {
      primary: '#0F766E',
      secondary: '#134E4A',
      accent: '#14B8A6',
      headerBackground: '#FFFFFF',
      headerText: '#134E4A',
      tableHeaderBackground: '#F0FDFA',
      tableHeaderText: '#0F766E',
      tableAltRow: '#F7FEFD',
      border: '#CCFBF1',
      text: '#134E4A',
      muted: '#5F8C88',
    },
    layout: { header: 'split', accentBar: false, highlightedTotal: false, footerBand: false },
    table: { style: 'minimal', headerStyle: 'filled', cellPadding: 10, borderRadius: 6 },
    typography: {
      headingFont: 'Helvetica-Bold',
      bodyFont: 'Helvetica',
      titleSize: 23,
      baseSize: 9.5,
      titleWeight: 'bold',
      uppercaseTitles: false,
      letterSpacing: 0,
    },
    visibility: { ...baseVisibility, bankDetails: false },
  },
  {
    key: 'services',
    name: 'Services professionnels',
    description: 'Détaillé et rassurant : idéal pour le conseil et les prestations intellectuelles.',
    category: 'Professionnel',
    premium: false,
    sectionGap: 26,
    pagePadding: 50,
    colors: {
      primary: '#0369A1',
      secondary: '#0C4A6E',
      accent: '#38BDF8',
      headerBackground: '#F0F9FF',
      headerText: '#0C4A6E',
      tableHeaderBackground: '#0369A1',
      tableHeaderText: '#FFFFFF',
      tableAltRow: '#F7FBFE',
      border: '#DBEAFE',
      text: '#0F172A',
      muted: '#64748B',
    },
    layout: { header: 'classic', accentBar: true, highlightedTotal: true, footerBand: false },
    table: { style: 'striped', headerStyle: 'filled', cellPadding: 10, borderRadius: 4 },
    typography: {
      headingFont: 'Helvetica-Bold',
      bodyFont: 'Helvetica',
      titleSize: 22,
      baseSize: 9.5,
      titleWeight: 'bold',
      uppercaseTitles: true,
      letterSpacing: 0.5,
    },
    visibility: { ...baseVisibility },
  },
  {
    key: 'commercial',
    name: 'Commercial',
    description: 'Orienté vente : total imposant, remises et conditions de paiement en avant.',
    category: 'Premium',
    badge: 'Premium',
    premium: true,
    sectionGap: 26,
    pagePadding: 48,
    colors: {
      primary: '#E11D48',
      secondary: '#4C0519',
      accent: '#FB7185',
      headerBackground: '#4C0519',
      headerText: '#FFFFFF',
      tableHeaderBackground: '#E11D48',
      tableHeaderText: '#FFFFFF',
      tableAltRow: '#FFF1F2',
      border: '#FECDD3',
      text: '#1F2937',
      muted: '#6B7280',
    },
    layout: { header: 'banner', accentBar: true, highlightedTotal: true, footerBand: true },
    table: { style: 'boxed', headerStyle: 'filled', cellPadding: 11, borderRadius: 4 },
    typography: {
      headingFont: 'Helvetica-Bold',
      bodyFont: 'Helvetica',
      titleSize: 24,
      baseSize: 10,
      titleWeight: 'bold',
      uppercaseTitles: false,
      letterSpacing: 0,
    },
    visibility: { ...baseVisibility },
  },
];

export const DEFAULT_TEMPLATE_KEY = 'minimaliste';

export function getTemplate(key: string | null | undefined): TemplateStyle {
  return QUOTATION_TEMPLATES.find((template) => template.key === key) ?? QUOTATION_TEMPLATES[0];
}

export function getTemplateName(key: string | null | undefined): string {
  return getTemplate(key).name;
}

export function isPremiumTemplate(key: string | null | undefined): boolean {
  return getTemplate(key).premium;
}

/** Fusionne la personnalisation utilisateur avec le modèle de base. */
export function mergeTemplateStyle(
  key: string | null | undefined,
  customization: TemplateCustomization | null | undefined,
): TemplateStyle {
  const base = getTemplate(key);
  if (!customization) return base;
  return {
    ...base,
    colors: { ...base.colors, ...(customization.colors ?? {}) },
    layout: { ...base.layout, ...(customization.layout ?? {}) },
    table: { ...base.table, ...(customization.table ?? {}) },
    typography: { ...base.typography, ...(customization.typography ?? {}) },
    visibility: { ...base.visibility, ...(customization.visibility ?? {}) },
    sectionGap: customization.sectionGap ?? base.sectionGap,
    pagePadding: customization.pagePadding ?? base.pagePadding,
  };
}

export interface TemplateCustomization {
  colors?: Partial<TemplateColors>;
  layout?: Partial<TemplateLayout>;
  table?: Partial<TemplateTable>;
  typography?: Partial<TemplateTypography>;
  visibility?: Partial<TemplateVisibility>;
  sectionGap?: number;
  pagePadding?: number;
}

export const FONT_OPTIONS = [
  { value: 'Helvetica', label: 'Helvetica (sans serif neutre)' },
  { value: 'Helvetica-Bold', label: 'Helvetica Bold' },
  { value: 'Times-Roman', label: 'Times (serif classique)' },
  { value: 'Times-Bold', label: 'Times Bold' },
  { value: 'Courier', label: 'Courier (technique)' },
] as const;
