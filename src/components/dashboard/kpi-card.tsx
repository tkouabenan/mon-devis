import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card, CardContent, Skeleton } from '@/components/ui/display';
import { cn } from '@/lib/utils';

/**
 * Carte d'indicateur : valeur, variation par rapport à la période précédente
 * et contexte. Le sens de lecture d'une variation dépend de l'indicateur
 * (« inverted » pour les indicateurs où une baisse est positive, ex. refus).
 */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  change,
  changeLabel,
  inverted = false,
  tone = 'primary',
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  change?: number | null;
  changeLabel?: string;
  inverted?: boolean;
  tone?: 'primary' | 'success' | 'warning' | 'navy';
}) {
  const tones = {
    primary: 'bg-primary/10 text-primary-600 dark:text-primary-400',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    navy: 'bg-navy-900/10 text-navy-900 dark:bg-white/10 dark:text-white',
  };

  const isPositive = change !== null && change !== undefined && (inverted ? change < 0 : change > 0);
  const isNegative = change !== null && change !== undefined && (inverted ? change > 0 : change < 0);
  const ChangeIcon = change === null || change === undefined || change === 0 ? ArrowRight : change > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="transition-shadow hover:shadow-card">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span className={cn('inline-flex size-9 items-center justify-center rounded-xl', tones[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        </div>

        <p className="font-display text-2xl font-bold tracking-tight tabular-nums">{value}</p>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {change === null || change === undefined ? (
            <span className="text-muted-foreground">{changeLabel ?? 'Pas de comparaison disponible'}</span>
          ) : (
            <>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold tabular-nums',
                  isPositive
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : isNegative
                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                <ChangeIcon className="size-3" aria-hidden />
                {change > 0 ? '+' : ''}
                {change.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
              </span>
              <span className="text-muted-foreground">{changeLabel ?? 'vs période précédente'}</span>
            </>
          )}
        </div>

        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function KpiSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-5 w-40" />
      </CardContent>
    </Card>
  );
}
