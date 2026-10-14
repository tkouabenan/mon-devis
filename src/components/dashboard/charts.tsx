'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@/components/ui/display';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

/**
 * Graphiques Recharts du tableau de bord et de la page Statistiques.
 * Palette alignée sur la charte : bleu royal, émeraude, ardoise, ambre, rose.
 */

const PALETTE = ['#2563EB', '#10B981', '#0F172A', '#F59E0B', '#EF4444', '#8B5CF6', '#64748B'];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94A3B8',
  SENT: '#2563EB',
  PENDING: '#F59E0B',
  ACCEPTED: '#10B981',
  REJECTED: '#EF4444',
  EXPIRED: '#8B5CF6',
  CANCELLED: '#64748B',
};

interface TooltipPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
  currency,
  mode = 'currency',
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  currency: string;
  mode?: 'currency' | 'count';
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-elevated backdrop-blur">
      {label ? <p className="mb-1 font-semibold">{label}</p> : null}
      <ul className="space-y-0.5">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: entry.color ?? PALETTE[index % PALETTE.length] }} aria-hidden />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-semibold tabular-nums">
              {mode === 'currency'
                ? formatCurrency(Number(entry.value ?? 0), currency, 'fr-FR', { compact: true })
                : Number(entry.value ?? 0).toLocaleString('fr-FR')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartCard({
  title,
  description,
  children,
  action,
  className,
  empty,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  empty?: boolean;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-2">
        {empty ? (
          <EmptyState
            title="Pas encore de données"
            description="Les graphiques se rempliront dès que vous aurez créé et envoyé vos premiers devis sur cette période."
            className="py-10"
          />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Graphiques                                                                 */
/* -------------------------------------------------------------------------- */

export function MonthlyTrendChart({
  data,
  currency,
  metric = 'amount',
  height = 280,
}: {
  data: { label: string; count: number; amount: number; accepted: number }[];
  currency: string;
  metric?: 'amount' | 'count';
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="grad-amount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="grad-accepted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={metric === 'amount' ? 78 : 36}
            stroke="hsl(var(--muted-foreground))"
            tickFormatter={(value: number) =>
              metric === 'amount' ? formatCurrency(value, currency, 'fr-FR', { compact: true }) : value.toLocaleString('fr-FR')
            }
          />
          <Tooltip content={<ChartTooltip currency={currency} mode={metric === 'amount' ? 'currency' : 'count'} />} />
          {metric === 'amount' ? (
            <>
              <Area
                type="monotone"
                dataKey="amount"
                name="Montant émis"
                stroke="#2563EB"
                strokeWidth={2}
                fill="url(#grad-amount)"
              />
              <Area
                type="monotone"
                dataKey="accepted"
                name="Montant accepté"
                stroke="#10B981"
                strokeWidth={2}
                fill="url(#grad-accepted)"
              />
            </>
          ) : (
            <Area type="monotone" dataKey="count" name="Devis créés" stroke="#2563EB" strokeWidth={2} fill="url(#grad-amount)" />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusDonutChart({ data }: { data: { status: string; label: string; count: number }[] }) {
  const filtered = data.filter((entry) => entry.count > 0);
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="count"
            nameKey="label"
            innerRadius={62}
            outerRadius={96}
            paddingAngle={2}
            strokeWidth={0}
          >
            {filtered.map((entry) => (
              <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#64748B'} />
            ))}
          </Pie>
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
          />
          <Tooltip content={<ChartTooltip currency="XOF" mode="count" />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopCustomersChart({ data, currency }: { data: { name: string; amount: number }[]; currency: string }) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            stroke="hsl(var(--muted-foreground))"
            tickFormatter={(value: number) => formatCurrency(value, currency, 'fr-FR', { compact: true })}
          />
          <YAxis
            type="category"
            dataKey="name"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={140}
            stroke="hsl(var(--muted-foreground))"
          />
          <Tooltip content={<ChartTooltip currency={currency} mode="currency" />} />
          <Bar dataKey="amount" name="Montant total" fill="#2563EB" radius={[0, 6, 6, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AcceptanceTrendChart({ data, height = 260 }: { data: { label: string; count: number; accepted: number }[]; height?: number }) {
  const enriched = data.map((entry) => ({
    ...entry,
    rate: entry.count === 0 ? 0 : Math.round((entry.accepted / entry.count) * 1000) / 10,
  }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={enriched} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={44}
            unit=" %"
            domain={[0, 100]}
            stroke="hsl(var(--muted-foreground))"
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const point = payload[0].payload as { count: number; accepted: number; rate: number };
              return (
                <div className="rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-elevated backdrop-blur">
                  <p className="mb-1 font-semibold">{label}</p>
                  <p className="text-muted-foreground">
                    {point.accepted} accepté(s) sur {point.count} devis
                  </p>
                  <p className="font-semibold tabular-nums">{point.rate.toLocaleString('fr-FR')} % d’acceptation</p>
                </div>
              );
            }}
          />
          <Line type="monotone" dataKey="rate" name="Taux d’acceptation" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CurrencySplitChart({ data, baseCurrency }: { data: { currency: string; amount: number }[]; baseCurrency: string }) {
  const multi = data.length > 1;
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="currency" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={78}
            stroke="hsl(var(--muted-foreground))"
            tickFormatter={(value: number) => formatCurrency(value, baseCurrency, 'fr-FR', { compact: true })}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              return (
                <div className="rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-elevated backdrop-blur">
                  <p className="mb-1 font-semibold">{label}</p>
                  <p className="tabular-nums">{Number(payload[0].value ?? 0).toLocaleString('fr-FR')}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="amount" name="Montant" radius={[6, 6, 0, 0]} barSize={42}>
            {data.map((entry, index) => (
              <Cell key={entry.currency} fill={entry.currency === baseCurrency ? '#2563EB' : PALETTE[index % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {multi ? (
        <p className={cn('mt-1 text-center text-xs text-muted-foreground')}>
          Les montants ne sont jamais additionnés entre devises : chaque barre est libellée dans sa propre devise.
        </p>
      ) : null}
    </div>
  );
}
