'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BadgeCheck, Check, Crown, Eye, FilePlus2, Loader2, Palette, RotateCcw } from 'lucide-react';
import { setDefaultTemplateAction, resetTemplateCustomizationAction } from '@/app/actions/templates';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/display';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/overlay';
import type { TemplateStyle } from '@/lib/templates';
import { cn } from '@/lib/utils';

/**
 * Galerie des modèles de devis.
 *
 * Chaque vignette est un aperçu **structurel** du modèle (en-tête, tableau,
 * couleurs, pied de page) construit à partir du style réel du modèle.
 * Aucun montant ni client fictif n'est affiché : pour voir le modèle sur
 * vos propres données, ouvrez-le dans l'éditeur de devis.
 */

function TemplateWireframe({ style, large = false }: { style: TemplateStyle; large?: boolean }) {
  const { colors, layout, table, typography } = style;
  const rows = large ? [0, 1, 2, 3, 4] : [0, 1, 2];
  const headerStyle =
    layout.header === 'banner' || layout.header === 'split'
      ? { background: colors.headerBackground === '#FFFFFF' ? colors.primary : colors.headerBackground, color: colors.headerText }
      : { background: colors.headerBackground, color: colors.headerText };

  return (
    <div
      className={cn('overflow-hidden rounded-lg border shadow-sm', large ? 'aspect-[1/1.3]' : 'aspect-[1/1.25]')}
      style={{ borderColor: colors.border, background: '#FFFFFF' }}
      aria-hidden
    >
      {/* En-tête */}
      <div className="flex items-start justify-between gap-2 px-3 py-2.5" style={{ background: headerStyle.background, color: headerStyle.color }}>
        <div className="space-y-1">
          <div className="h-2 w-16 rounded-sm" style={{ background: colors.primary }} />
          <div className="h-1.5 w-10 rounded-sm" style={{ background: colors.muted, opacity: 0.6 }} />
        </div>
        <div className="space-y-1 text-right">
          <div
            className="ml-auto h-2 w-14 rounded-sm"
            style={{ background: colors.text }}
          />
          <div className="ml-auto h-1.5 w-10 rounded-sm" style={{ background: colors.muted, opacity: 0.6 }} />
        </div>
      </div>

      {layout.accentBar ? <div className="h-1.5 w-full" style={{ background: colors.accent }} /> : null}

      {/* Bloc destinataire + méta */}
      <div className="grid grid-cols-2 gap-2 px-3 py-2.5">
        <div className="space-y-1">
          <div className="h-1.5 w-8 rounded-sm" style={{ background: colors.muted, opacity: 0.5 }} />
          <div className="h-1.5 w-16 rounded-sm" style={{ background: colors.text, opacity: 0.35 }} />
          <div className="h-1.5 w-12 rounded-sm" style={{ background: colors.text, opacity: 0.25 }} />
        </div>
        <div className="space-y-1">
          <div className="ml-auto h-1.5 w-10 rounded-sm" style={{ background: colors.muted, opacity: 0.5 }} />
          <div className="ml-auto h-1.5 w-14 rounded-sm" style={{ background: colors.text, opacity: 0.3 }} />
        </div>
      </div>

      {/* Tableau */}
      <div className="px-3">
        <div
          className="flex items-center justify-between px-2 py-1.5 text-[7px] font-semibold uppercase"
          style={{
            background: colors.tableHeaderBackground,
            color: colors.tableHeaderText,
            borderBottom: table.headerStyle === 'underlined' ? `1px solid ${colors.border}` : 'none',
            borderRadius: table.borderRadius ? `${table.borderRadius}px` : 0,
          }}
        >
          <span>Désignation</span>
          <span>Total</span>
        </div>
        {rows.map((row) => (
          <div
            key={row}
            className="flex items-center justify-between px-2 py-1.5"
            style={{
              background: table.style === 'striped' && row % 2 === 1 ? colors.tableAltRow : 'transparent',
              borderBottom: table.style === 'lined' || table.style === 'boxed' ? `1px solid ${colors.border}` : 'none',
            }}
          >
            <div className="h-1.5 w-20 rounded-sm" style={{ background: colors.text, opacity: 0.3 }} />
            <div className="h-1.5 w-8 rounded-sm" style={{ background: colors.text, opacity: 0.3 }} />
          </div>
        ))}
      </div>

      {/* Totaux */}
      <div className="mt-2 px-3">
        <div className="ml-auto w-2/3 space-y-1">
          <div className="flex items-center justify-between">
            <div className="h-1.5 w-10 rounded-sm" style={{ background: colors.muted, opacity: 0.5 }} />
            <div className="h-1.5 w-12 rounded-sm" style={{ background: colors.text, opacity: 0.3 }} />
          </div>
          <div
            className="flex items-center justify-between rounded px-1.5 py-1"
            style={{
              background: layout.highlightedTotal ? colors.primary : 'transparent',
              color: layout.highlightedTotal ? '#FFFFFF' : colors.text,
            }}
          >
            {layout.highlightedTotal ? (
              <>
                <span className="text-[7px] font-semibold uppercase">Total</span>
                <div className="h-1.5 w-12 rounded-sm bg-white/70" />
              </>
            ) : (
              <>
                <div className="h-1.5 w-10 rounded-sm" style={{ background: colors.muted, opacity: 0.6 }} />
                <div className="h-1.5 w-14 rounded-sm" style={{ background: colors.text, opacity: 0.45 }} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Pied de page */}
      <div
        className="mt-3 px-3 py-2"
        style={{ background: layout.footerBand ? colors.primary : 'transparent', color: layout.footerBand ? '#FFFFFF' : colors.muted }}
      >
        <div className="h-1 w-full rounded-sm" style={{ background: layout.footerBand ? 'rgba(255,255,255,0.7)' : colors.border }} />
        <div className="mt-1 h-1 w-2/3 rounded-sm" style={{ background: layout.footerBand ? 'rgba(255,255,255,0.5)' : colors.border }} />
      </div>

      <div className="px-3 pb-2 pt-1">
        <p className="text-[7px]" style={{ color: colors.muted, fontFamily: typography.bodyFont }}>
          {typography.headingFont} · {typography.baseSize} pt
        </p>
      </div>
    </div>
  );
}

export function TemplateGallery({
  templates,
  defaultTemplateKey,
  hasCustomization,
  canUsePremium,
  isFree,
}: {
  templates: TemplateStyle[];
  defaultTemplateKey: string;
  hasCustomization: boolean;
  canUsePremium: boolean;
  isFree: boolean;
}) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [previewKey, setPreviewKey] = React.useState<string | null>(null);
  const [resetting, setResetting] = React.useState(false);
  const preview = templates.find((template) => template.key === previewKey) ?? null;

  const applyTemplate = async (template: TemplateStyle) => {
    setPendingKey(template.key);
    const result = await setDefaultTemplateAction(template.key);
    setPendingKey(null);
    if (!result?.success) {
      toast.error(result?.message ?? 'Impossible d’appliquer ce modèle.');
      return;
    }
    toast.success(result.message ?? 'Modèle appliqué.');
    router.refresh();
  };

  const resetCustomization = async () => {
    setResetting(true);
    const result = await resetTemplateCustomizationAction();
    setResetting(false);
    if (!result?.success) {
      toast.error(result?.message ?? 'Réinitialisation impossible.');
      return;
    }
    toast.success(result.message ?? 'Personnalisation réinitialisée.');
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {templates.length} modèles prêts à l’emploi. Le modèle par défaut est appliqué à chaque nouveau devis et utilisé par les
          exports PDF, Word et Excel.
        </p>
        {hasCustomization ? (
          <Button variant="outline" size="sm" onClick={resetCustomization} disabled={resetting}>
            {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="mr-2 h-4 w-4" aria-hidden />}
            Réinitialiser la personnalisation
          </Button>
        ) : null}
      </div>

      {isFree ? (
        <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
            <span className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-600" aria-hidden />
              Votre formule actuelle donne accès aux modèles essentiels. Les modèles marqués <strong>Premium</strong> sont réservés aux
              formules payantes.
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href="/abonnement">Voir les formules</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const isDefault = template.key === defaultTemplateKey;
          const locked = template.premium && !canUsePremium;

          return (
            <Card key={template.key} className={cn('overflow-hidden', isDefault && 'ring-2 ring-primary/40')}>
              <CardContent className="space-y-4 pt-5">
                <TemplateWireframe style={template} />

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold">{template.name}</h3>
                    <Badge variant="secondary">{template.category}</Badge>
                    {template.badge ? <Badge variant="success">{template.badge}</Badge> : null}
                    {template.premium ? (
                      <Badge variant="warning">
                        <Crown className="mr-1 h-3 w-3" aria-hidden />
                        Premium
                      </Badge>
                    ) : null}
                    {isDefault ? (
                      <Badge variant="default">
                        <Check className="mr-1 h-3 w-3" aria-hidden />
                        Par défaut
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPreviewKey(template.key)}>
                    <Eye className="mr-2 h-4 w-4" aria-hidden />
                    Aperçu
                  </Button>

                  {locked ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/abonnement">
                        <Crown className="mr-2 h-4 w-4" aria-hidden />
                        Débloquer
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant={isDefault ? 'secondary' : 'default'} disabled={isDefault || pendingKey === template.key} onClick={() => applyTemplate(template)}>
                      {pendingKey === template.key ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <BadgeCheck className="mr-2 h-4 w-4" aria-hidden />
                      )}
                      {isDefault ? 'Modèle actuel' : 'Définir par défaut'}
                    </Button>
                  )}

                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/devis/nouveau?modele=${template.key}`}>
                      <FilePlus2 className="mr-2 h-4 w-4" aria-hidden />
                      Créer un devis
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => (open ? undefined : setPreviewKey(null))}>
        <DialogContent className="max-w-3xl">
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle>{preview.name}</DialogTitle>
                <DialogDescription>
                  {preview.description} — en-tête « {preview.layout.header} », tableau « {preview.table.style} », police{' '}
                  {preview.typography.bodyFont}.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <TemplateWireframe style={preview} large />
                <div className="space-y-3 text-sm">
                  <div className="space-y-1">
                    <p className="font-medium">Couleurs</p>
                    <div className="flex gap-2">
                      {[preview.colors.primary, preview.colors.secondary, preview.colors.accent, preview.colors.tableHeaderBackground].map(
                        (color) => (
                          <span
                            key={color}
                            className="flex h-8 w-8 items-center justify-center rounded-md border text-[9px] font-medium text-white"
                            style={{ background: color }}
                            title={color}
                          >
                            {color.slice(1, 3)}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">Éléments inclus</p>
                    <ul className="grid grid-cols-2 gap-1 text-muted-foreground">
                      {Object.entries(preview.visibility)
                        .filter(([, enabled]) => enabled)
                        .map(([key]) => (
                          <li key={key} className="flex items-center gap-1.5">
                            <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                            {key}
                          </li>
                        ))}
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {preview.premium && !canUsePremium ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href="/abonnement">
                          <Crown className="mr-2 h-4 w-4" aria-hidden />
                          Nécessite une formule payante
                        </Link>
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => applyTemplate(preview)} disabled={pendingKey === preview.key}>
                        {pendingKey === preview.key ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Palette className="mr-2 h-4 w-4" aria-hidden />
                        )}
                        Définir par défaut
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/devis/nouveau?modele=${preview.key}`}>Créer un devis avec ce modèle</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
