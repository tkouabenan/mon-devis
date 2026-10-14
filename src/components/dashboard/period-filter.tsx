'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { FormField, Input, Select } from '@/components/ui/form';
import { CURRENCIES } from '@/lib/currency';
import { cn } from '@/lib/utils';

/**
 * Filtre de période : préréglages rapides (7 j, 30 j, 90 j, 12 mois, année)
 * et plage personnalisée. Le filtre met à jour l'URL : les liens restent
 * partageables et le rechargement conserve le contexte.
 */

const PRESETS = [
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: '90d', label: '90 derniers jours' },
  { value: '12m', label: '12 derniers mois' },
  { value: 'year', label: 'Année en cours' },
] as const;

export function PeriodFilter({
  preset,
  label,
  from,
  to,
  currencies,
  currency,
}: {
  preset: string;
  label: string;
  from: string;
  to: string;
  currencies: string[];
  currency: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customFrom, setCustomFrom] = React.useState(from);
  const [customTo, setCustomTo] = React.useState(to);
  const [open, setOpen] = React.useState(false);

  const update = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      {currencies.length > 1 ? (
        <Select
          aria-label="Devise analysée"
          value={currency}
          onChange={(event) => update({ devise: event.target.value })}
          className="h-10 w-[132px]"
        >
          {currencies.map((code) => {
            const definition = CURRENCIES.find((item) => item.code === code);
            return (
              <option key={code} value={code}>
                {code}
                {definition ? ` — ${definition.name}` : ''}
              </option>
            );
          })}
        </Select>
      ) : null}

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <CalendarRange className="size-4" aria-hidden />
            <span className="max-w-40 truncate">{label}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Période d’analyse</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {PRESETS.map((item) => (
            <DropdownMenuItem
              key={item.value}
              onSelect={() => {
                update({ periode: item.value, du: null, au: null });
                setOpen(false);
              }}
              className={cn(preset === item.value && 'bg-accent font-medium')}
            >
              {item.label}
              {preset === item.value ? <Check className="ml-auto size-4" aria-hidden /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <div className="space-y-3 p-3" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plage personnalisée</p>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Du" htmlFor="period-from">
                <Input
                  id="period-from"
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </FormField>
              <FormField label="Au" htmlFor="period-to">
                <Input
                  id="period-to"
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </FormField>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                update({ periode: 'custom', du: customFrom, au: customTo });
                setOpen(false);
              }}
              disabled={!customFrom || !customTo}
            >
              Appliquer la plage
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
