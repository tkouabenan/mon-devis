import type { Metadata } from 'next';
import { Palette } from 'lucide-react';
import { requireOrganization } from '@/lib/auth/guards';
import { getOrganizationSettings } from '@/lib/services/quotations';
import { getOrganizationSubscription } from '@/lib/services/subscription';
import { QUOTATION_TEMPLATES, mergeTemplateStyle, type TemplateCustomization } from '@/lib/templates';
import { TemplateGallery } from '@/components/templates/template-gallery';
import { Card, CardContent } from '@/components/ui/display';

export const metadata: Metadata = {
  title: 'Modèles de devis',
  description: 'Huit modèles professionnels, un modèle par défaut appliqué à vos devis et à vos exports.',
};

export default async function TemplatesPage() {
  const context = await requireOrganization();
  const organizationId = context.organization.id;

  const [settings, subscription] = await Promise.all([
    getOrganizationSettings(organizationId),
    getOrganizationSubscription(organizationId),
  ]);

  const customization = (settings?.templateCustomization ?? null) as TemplateCustomization | null;
  const defaultTemplateKey = settings?.defaultTemplateKey ?? 'minimaliste';
  const canUsePremium = !subscription.isFree;

  // Chaque modèle est présenté avec la personnalisation éventuellement appliquée
  // (couleurs de marque), exactement telle qu'elle apparaîtra dans les documents.
  const templates = QUOTATION_TEMPLATES.map((template) =>
    template.key === defaultTemplateKey ? mergeTemplateStyle(template.key, customization) : template,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Modèles de devis</h1>
        <p className="text-sm text-muted-foreground">
          Choisissez l’apparence de vos documents pour <span className="font-medium text-foreground">{context.organization.name}</span>.
          Le modèle retenu s’applique à l’aperçu, au PDF, au fichier Word et à l’Excel.
        </p>
      </div>

      {!settings ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Les réglages de votre organisation sont en cours d’initialisation. Rechargez la page dans quelques instants.
          </CardContent>
        </Card>
      ) : null}

      <TemplateGallery
        templates={templates}
        defaultTemplateKey={defaultTemplateKey}
        hasCustomization={Boolean(customization)}
        canUsePremium={canUsePremium}
        isFree={subscription.isFree}
      />

      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 py-5 text-sm text-muted-foreground">
          <Palette className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p>
            Les couleurs de marque (couleur principale et secondaire) se règlent dans{' '}
            <a href="/mon-entreprise" className="font-medium text-foreground underline-offset-4 hover:underline">
              Mon entreprise
            </a>{' '}
            et s’appliquent aux modèles personnalisables. Votre logo apparaît sur chaque document.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
