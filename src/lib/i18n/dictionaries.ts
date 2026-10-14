import type { Locale } from './index';

/**
 * Dictionnaires de traduction.
 * Le français est complet ; les autres locales peuvent ne couvrir qu'une partie
 * des clés : la résolution retombe automatiquement sur le français.
 */

const fr = {
  common: {
    appName: 'MON DEVIS',
    tagline: 'Créez des devis professionnels en quelques clics.',
    supportTagline: 'Créez, personnalisez, envoyez et suivez vos devis depuis une seule plateforme.',
    loading: 'Chargement…',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    saved: 'Enregistré',
    cancel: 'Annuler',
    close: 'Fermer',
    delete: 'Supprimer',
    edit: 'Modifier',
    duplicate: 'Dupliquer',
    archive: 'Archiver',
    restore: 'Restaurer',
    download: 'Télécharger',
    send: 'Envoyer',
    search: 'Rechercher',
    filters: 'Filtres',
    reset: 'Réinitialiser',
    apply: 'Appliquer',
    back: 'Retour',
    next: 'Suivant',
    previous: 'Précédent',
    yes: 'Oui',
    no: 'Non',
    optional: 'facultatif',
    required: 'obligatoire',
    none: 'Aucun',
    all: 'Tous',
    actions: 'Actions',
    status: 'Statut',
    total: 'Total',
    amount: 'Montant',
    date: 'Date',
    client: 'Client',
    error: 'Une erreur est survenue',
    retry: 'Réessayer',
    new: 'Nouveau',
    learnMore: 'En savoir plus',
  },
  nav: {
    dashboard: 'Tableau de bord',
    quotations: 'Mes devis',
    newQuotation: 'Nouveau devis',
    customers: 'Clients',
    products: 'Produits & Services',
    statistics: 'Statistiques',
    templates: 'Modèles de devis',
    company: 'Mon entreprise',
    subscription: 'Abonnement',
    settings: 'Paramètres',
    notifications: 'Notifications',
    support: 'Support',
    admin: 'Administration',
    logout: 'Déconnexion',
    profile: 'Profil',
    search: 'Rechercher un devis, un client…',
    quickAction: 'Nouveau devis',
  },
  landing: {
    nav: {
      home: 'Accueil',
      features: 'Fonctionnalités',
      howItWorks: 'Comment ça marche',
      pricing: 'Tarifs',
      faq: 'FAQ',
      login: 'Connexion',
      cta: 'Créer mon devis gratuitement',
      start: 'Créer mon premier devis',
      discover: 'Découvrir la plateforme',
    },
    hero: {
      badge: 'Nouveau — export Word et Excel inclus',
      title: 'Créez des devis professionnels en moins de 3 minutes.',
      subtitle:
        'Fini les devis compliqués sur Word ou Excel. Avec MON DEVIS, créez, personnalisez et téléchargez vos devis professionnels en quelques clics.',
    },
  },
  auth: {
    login: 'Connexion',
    register: 'Créer un compte',
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    name: 'Nom complet',
    rememberMe: 'Se souvenir de moi',
    forgotPassword: 'Mot de passe oublié ?',
    noAccount: 'Pas encore de compte ?',
    hasAccount: 'Vous avez déjà un compte ?',
    signIn: 'Se connecter',
    signUp: 'Créer mon compte',
    welcomeBack: 'Bon retour parmi nous',
  },
  dashboard: {
    title: 'Tableau de bord',
    totalQuotations: 'Total des devis créés',
    totalAmount: 'Montant total des devis',
    acceptedCount: 'Devis acceptés',
    acceptanceRate: "Taux d'acceptation",
    recent: 'Devis récents',
  },
};

type Dictionary = typeof fr;

const en: DeepPartial<Dictionary> = {
  common: {
    appName: 'MON DEVIS',
    tagline: 'Create professional quotations in just a few clicks.',
    loading: 'Loading…',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    search: 'Search',
  },
  nav: {
    dashboard: 'Dashboard',
    quotations: 'My quotations',
    newQuotation: 'New quotation',
    customers: 'Customers',
    products: 'Products & Services',
    statistics: 'Analytics',
    templates: 'Quotation templates',
    company: 'My company',
    subscription: 'Subscription',
    settings: 'Settings',
    logout: 'Sign out',
  },
  auth: {
    login: 'Sign in',
    register: 'Create account',
    email: 'Email address',
    password: 'Password',
    rememberMe: 'Remember me',
    forgotPassword: 'Forgot your password?',
  },
};

export type { Dictionary };

type DeepPartial<T> = { [Key in keyof T]?: T[Key] extends object ? DeepPartial<T[Key]> : T[Key] };

export const dictionaries: Record<Locale, DeepPartial<Dictionary>> = {
  fr,
  en,
};

/** Récupère une valeur imbriquée par chemin pointé. */
function resolvePath(source: unknown, path: string): string | undefined {
  const value = path.split('.').reduce<unknown>((accumulator, key) => {
    if (accumulator && typeof accumulator === 'object' && key in (accumulator as Record<string, unknown>)) {
      return (accumulator as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
  return typeof value === 'string' ? value : undefined;
}

/** Traduit une clé pour la locale donnée, avec repli sur le français puis la clé brute. */
export function translate(locale: Locale, key: string, variables?: Record<string, string | number>): string {
  const localized = resolvePath(dictionaries[locale], key);
  const fallback = localized ?? resolvePath(fr, key) ?? key;
  if (!variables) return fallback;
  return Object.entries(variables).reduce(
    (text, [name, value]) => text.replace(new RegExp(`{${name}}`, 'g'), String(value)),
    fallback,
  );
}

export function getDictionary(locale: Locale): Dictionary {
  return {
    ...fr,
    ...(dictionaries[locale] as Partial<Dictionary>),
  } as Dictionary;
}
