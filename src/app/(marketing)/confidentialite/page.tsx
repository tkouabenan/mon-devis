import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/display';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Comment MON DEVIS collecte, utilise et protège vos données personnelles et celles de vos clients.',
};

const sections = [
  {
    title: '1. Données collectées',
    body: [
      'Données de compte : nom, adresse e-mail, mot de passe haché (bcrypt), préférences de langue et de thème, horodatage des connexions et adresse IP tronquée/hachée à des fins de sécurité.',
      'Données professionnelles : informations de votre entreprise, logos, clients, produits et services, devis, conditions générales de vente et mentions légales que vous saisissez.',
      'Données d’usage : journaux d’audit (création, modification, envoi, acceptation d’un devis), notifications et préférences associées.',
    ],
  },
  {
    title: '2. Finalités du traitement',
    body: [
      'Fournir le service de création et de suivi de devis, authentifier les utilisateurs, appliquer les limites de formule, produire les exports et statistiques demandés, assurer la sécurité (détection d’abus, limitation de débit) et répondre aux demandes de support.',
    ],
  },
  {
    title: '3. Cloisonnement des données',
    body: [
      'Chaque organisation dispose de son propre espace logique. Toutes les requêtes applicatives sont filtrées par l’identifiant d’organisation de l’utilisateur connecté : un utilisateur ne peut jamais lire ni modifier les devis d’une autre organisation.',
      'L’accès aux données est journalisé. Les administrateurs de la plateforme n’ont pas accès aux contenus métier (devis, clients, produits) depuis le panneau d’administration.',
    ],
  },
  {
    title: '4. Partage des liens de devis',
    body: [
      'Le partage d’un devis génère un lien public contenant un jeton aléatoire long, révocable et à durée limitée. Le destinataire peut consulter, accepter ou refuser le devis ; chaque décision est horodatée avec l’adresse IP et le type d’appareil, et conserve une trace dans le journal d’audit du devis.',
      'Vous pouvez révoquer un lien à tout moment : il devient immédiatement inutilisable.',
    ],
  },
  {
    title: '5. Durée de conservation',
    body: [
      'Les données sont conservées pendant la durée d’utilisation du compte, puis supprimées sur demande. Les journaux de sécurité sont conservés 12 mois maximum.',
    ],
  },
  {
    title: '6. Vos droits',
    body: [
      'Vous pouvez accéder à vos données, les corriger, les exporter (PDF, Word, Excel, CSV) ou demander leur suppression depuis les paramètres de votre compte ou en contactant le support.',
    ],
  },
  {
    title: '7. Sous-traitants et intégrations',
    body: [
      'La plateforme peut être connectée à des services tiers uniquement lorsqu’un administrateur en a fourni les identifiants : hébergement de base de données, stockage de fichiers (S3 compatible), envoi d’e-mails (SMTP ou API), facturation (prestataire de paiement).',
      'Aucune donnée n’est transmise à un service tiers non configuré. En l’absence de configuration, les fonctionnalités concernées restent inactives et l’interface l’indique explicitement.',
    ],
  },
  {
    title: '8. Sécurité',
    body: [
      'Mots de passe hachés, jetons à usage unique stockés sous forme d’empreinte, sessions révocables, validation systématique des entrées côté serveur, téléversements contrôlés (type réel du fichier, taille, nettoyage des SVG) et limitation du débit sur les points sensibles.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="container-page py-14 sm:py-20">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="label-caps text-primary-600 dark:text-primary-400">Document juridique</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Politique de confidentialité</h1>
          <p className="text-sm text-muted-foreground">
            Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' })} ·{' '}
            <Link href="/cgu" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
              Conditions générales
            </Link>
          </p>
        </header>

        <Alert variant="info" title="Modèle à adapter">
          Adaptez ce document à votre entité et au cadre légal applicable (RGPD, loi ivoirienne n° 2013-450 relative à
          la protection des données à caractère personnel, etc.) avant toute exploitation commerciale.
        </Alert>

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.title} className="space-y-2.5">
              <h2 className="font-display text-xl font-bold tracking-tight">{section.title}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index} className="text-sm leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
