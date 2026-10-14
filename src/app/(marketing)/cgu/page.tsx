import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/display';

export const metadata: Metadata = {
  title: 'Conditions générales d’utilisation',
  description: 'Conditions générales d’utilisation de la plateforme MON DEVIS : droits, obligations et responsabilités.',
};

const sections = [
  {
    title: '1. Objet',
    body: [
      'MON DEVIS est une plateforme de création et de suivi de devis destinée aux entreprises, artisans et travailleurs indépendants. L’utilisation du service implique l’acceptation pleine et entière des présentes conditions générales.',
    ],
  },
  {
    title: '2. Compte utilisateur',
    body: [
      'La création d’un compte requiert une adresse e-mail valide et un mot de passe conforme à la politique de sécurité. Vous êtes responsable de la confidentialité de vos identifiants et de l’activité réalisée depuis votre compte.',
      'Chaque compte peut être rattaché à une ou plusieurs organisations. Au sein d’une organisation, les droits d’accès dépendent du rôle attribué (propriétaire, administrateur ou membre).',
    ],
  },
  {
    title: '3. Contenus et données',
    body: [
      'Vous conservez l’intégralité des droits sur les contenus que vous créez (devis, clients, produits, logos, mentions légales). MON DEVIS n’exploite ni ne revend ces contenus.',
      'Vous garantissez disposer des droits nécessaires sur les éléments que vous téléversez, notamment les logos et les données de vos clients.',
      'Les données de chaque organisation sont cloisonnées : aucun utilisateur extérieur à l’organisation ne peut y accéder, hors administrateurs de la plateforme pour les seuls besoins techniques (voir la politique de confidentialité).',
    ],
  },
  {
    title: '4. Formules et limites',
    body: [
      'Les formules Gratuit, Pro et Business donnent accès à des fonctionnalités et à des limites d’usage différentes (nombre de devis, de clients, de produits, de membres, exports disponibles, fonctionnalités de partage).',
      'Les tarifs des formules payantes sont configurables par l’éditeur de la plateforme et affichés dans l’application. Aucun paiement n’est simulé : si aucun prestataire de paiement n’est configuré, le changement de formule est enregistré comme une demande à traiter.',
    ],
  },
  {
    title: '5. Disponibilité et maintenance',
    body: [
      'Le service est fourni « en l’état ». L’éditeur s’efforce d’assurer une disponibilité continue mais peut interrompre temporairement l’accès pour maintenance ou en cas d’incident technique.',
    ],
  },
  {
    title: '6. Responsabilité',
    body: [
      'Les calculs, exports et documents générés par la plateforme sont des outils d’aide à la rédaction. Vous restez responsable de la conformité fiscale, comptable et juridique des devis que vous émettez.',
      'L’éditeur ne peut être tenu responsable des dommages indirects résultant de l’utilisation ou de l’impossibilité d’utiliser le service.',
    ],
  },
  {
    title: '7. Résiliation',
    body: [
      'Vous pouvez supprimer votre compte à tout moment depuis les paramètres. Vos données vous sont alors restituées au format d’export (PDF, Word, Excel, CSV) avant suppression définitive.',
    ],
  },
  {
    title: '8. Droit applicable',
    body: [
      'Les présentes conditions sont soumises au droit ivoirien. En cas de litige, les parties rechercheront une solution amiable avant toute action judiciaire.',
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="container-page py-14 sm:py-20">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="label-caps text-primary-600 dark:text-primary-400">Document juridique</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Conditions générales d’utilisation
          </h1>
          <p className="text-sm text-muted-foreground">
            Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' })} ·{' '}
            <Link href="/confidentialite" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
              Politique de confidentialité
            </Link>
          </p>
        </header>

        <Alert variant="info" title="Modèle à adapter">
          Ce texte constitue un modèle de départ. Faites-le valider par un conseil juridique et adaptez-le à votre
          entité (dénomination, adresse, juridiction) avant une mise en production commerciale.
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

        <div className="rounded-2xl border border-border bg-muted/40 p-5">
          <p className="text-sm text-muted-foreground">
            Une question sur ces conditions ?{' '}
            <Link href="/inscription" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
              Créez votre compte
            </Link>{' '}
            puis ouvrez un ticket depuis « Aide & support ».
          </p>
        </div>
      </div>
    </div>
  );
}
