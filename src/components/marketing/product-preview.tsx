import { ArrowUpRight, BadgeCheck, Clock, FileText, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Aperçu produit réaliste (construit en HTML/CSS, donc net sur tous les écrans) :
 * un tableau de bord MON DEVIS accompagné d'un document de devis flottant.
 */
export function ProductPreview({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)}>
      {/* Halo décoratif */}
      <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 bg-gradient-to-tr from-primary/20 via-emerald-400/10 to-transparent blur-3xl" aria-hidden />

      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-elevated">
        {/* Barre de fenêtre */}
        <div className="flex items-center gap-2 border-b border-border/70 bg-muted/60 px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-rose-400" />
            <span className="size-2.5 rounded-full bg-amber-400" />
            <span className="size-2.5 rounded-full bg-emerald-400" />
          </span>
          <div className="ml-2 flex h-6 flex-1 items-center rounded-md bg-card px-2.5 text-[11px] text-muted-foreground ring-1 ring-border/70">
            mon-devis.app/tableau-de-bord
          </div>
        </div>

        <div className="flex">
          {/* Barre latérale */}
          <aside className="hidden w-40 shrink-0 border-r border-border/70 bg-muted/30 p-3 sm:block">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-white">MD</span>
              <span className="text-[11px] font-semibold">MON DEVIS</span>
            </div>
            <nav className="space-y-1">
              {['Tableau de bord', 'Mes devis', 'Nouveau devis', 'Clients', 'Produits', 'Statistiques', 'Modèles', 'Mon entreprise'].map(
                (item, index) => (
                  <div
                    key={item}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-[10.5px] font-medium',
                      index === 0 ? 'bg-primary/10 text-primary-700 dark:text-primary-300' : 'text-muted-foreground',
                    )}
                  >
                    <span className={cn('size-1.5 rounded-full', index === 0 ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600')} />
                    {item}
                  </div>
                ),
              )}
            </nav>
          </aside>

          {/* Contenu */}
          <div className="min-w-0 flex-1 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-sm font-semibold">Tableau de bord</p>
                <p className="text-[10.5px] text-muted-foreground">Bonjour Aïcha — 4 devis attendent une réponse</p>
              </div>
              <span className="hidden rounded-lg bg-primary px-2.5 py-1.5 text-[10.5px] font-semibold text-white sm:inline-flex">
                + Nouveau devis
              </span>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {[
                { label: 'Devis créés', value: '42', trend: '+12 %', icon: FileText, tone: 'text-primary' },
                { label: 'Montant total', value: '28,4 M', trend: '+8,3 %', icon: TrendingUp, tone: 'text-emerald-600' },
                { label: 'Acceptés', value: '16', trend: '+3 ce mois', icon: BadgeCheck, tone: 'text-emerald-600' },
                { label: "Taux d'accept.", value: '38 %', trend: '+4,1 pts', icon: ArrowUpRight, tone: 'text-amber-600' },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{kpi.label}</span>
                    <kpi.icon className={cn('size-3.5', kpi.tone)} />
                  </div>
                  <p className="mt-1.5 font-display text-lg font-bold leading-none">{kpi.value}</p>
                  <p className="mt-1 text-[10px] text-emerald-600">{kpi.trend}</p>
                </div>
              ))}
            </div>

            {/* Graphique */}
            <div className="mt-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold">Activité des devis — 6 derniers mois</span>
                <span className="text-[10px] text-muted-foreground">Acceptés / envoyés</span>
              </div>
              <div className="flex h-24 items-end gap-2">
                {[
                  [46, 78],
                  [58, 84],
                  [40, 66],
                  [72, 96],
                  [64, 88],
                  [84, 100],
                ].map(([accepted, sent], index) => (
                  <div key={index} className="flex flex-1 items-end gap-1">
                    <div className="w-1/2 rounded-t bg-primary/25" style={{ height: `${sent}%` }} />
                    <div className="w-1/2 rounded-t bg-primary" style={{ height: `${accepted}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[9px] text-muted-foreground">
                {['Sep', 'Oct', 'Nov', 'Déc', 'Jan', 'Fév'].map((month) => (
                  <span key={month}>{month}</span>
                ))}
              </div>
            </div>

            {/* Tableau */}
            <div className="mt-3 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
              <div className="grid grid-cols-[1.4fr_1fr_0.8fr_0.6fr] gap-2 border-b border-border/70 px-3 py-2 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Devis</span>
                <span>Client</span>
                <span className="text-right">Montant</span>
                <span className="text-right">Statut</span>
              </div>
              {[
                { number: 'DEV-2026-0042', client: 'Résidence Les Palmiers', amount: '2 629 217', status: 'Accepté', tone: 'bg-emerald-100 text-emerald-700' },
                { number: 'DEV-2026-0041', client: 'Groupe SIFCA', amount: '8 940 000', status: 'Envoyé', tone: 'bg-blue-100 text-blue-700' },
                { number: 'DEV-2026-0040', client: 'Clinique Saint-Jean', amount: '1 236 500', status: 'En attente', tone: 'bg-amber-100 text-amber-700' },
              ].map((row) => (
                <div key={row.number} className="grid grid-cols-[1.4fr_1fr_0.8fr_0.6fr] items-center gap-2 px-3 py-2 text-[10.5px]">
                  <span className="font-medium">{row.number}</span>
                  <span className="truncate text-muted-foreground">{row.client}</span>
                  <span className="text-right font-medium">{row.amount}</span>
                  <span className="flex justify-end">
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold', row.tone)}>{row.status}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Document flottant */}
      <div className="pointer-events-none absolute -bottom-10 -right-4 hidden w-[280px] rotate-[-2deg] rounded-xl border border-border bg-white p-4 shadow-elevated lg:block dark:bg-slate-900">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-[13px] font-bold text-navy-900 dark:text-white">DEVIS</p>
            <p className="text-[9.5px] text-slate-500">DEV-2026-0042</p>
          </div>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary-700">PDF · Word · Excel</span>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 text-[9px] text-slate-500">
          <Clock className="size-3" /> Valable jusqu’au 12 mars 2026
        </div>
        <div className="mt-2.5 space-y-1.5">
          {[
            ['Travaux de maçonnerie', '562 500'],
            ['Peinture intérieure', '513 000'],
            ['Carrelage 60×60', '727 650'],
            ['Main d’œuvre électricité', '425 000'],
          ].map(([label, amount]) => (
            <div key={label} className="flex items-center justify-between gap-2 border-b border-dashed border-slate-200 pb-1 text-[9.5px] dark:border-slate-700">
              <span className="truncate text-slate-600 dark:text-slate-300">{label}</span>
              <span className="font-medium text-slate-800 dark:text-slate-100">{amount}</span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 rounded-lg bg-navy-900 px-2.5 py-2 text-white">
          <div className="flex items-center justify-between text-[9.5px] text-slate-300">
            <span>Total HT</span>
            <span>2 228 150 FCFA</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[9.5px] text-slate-300">
            <span>TVA 18 %</span>
            <span>401 067 FCFA</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-white/15 pt-1 text-[11px] font-bold">
            <span>Total TTC</span>
            <span>2 629 217 FCFA</span>
          </div>
        </div>
      </div>
    </div>
  );
}
