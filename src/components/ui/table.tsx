'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { StatusBadge } from '@/components/status-badge';

export function TableShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('surface overflow-hidden', className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('table-base', className)} {...props} />;
}

export function SortableHeader({
  label,
  field,
  currentSort,
  align = 'left',
  className,
}: {
  label: string;
  field: string;
  currentSort?: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <th className={cn(align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {currentSort === field ? (
          <ArrowUp className="size-3.5 text-primary" />
        ) : currentSort === `-${field}` ? (
          <ArrowDown className="size-3.5 text-primary" />
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-40" />
        )}
      </span>
    </th>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  basePath,
  query = {},
  labels,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  basePath: string;
  query?: Record<string, string | undefined>;
  labels?: { one: string; many: string };
}) {
  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    if (target > 1) params.set('page', String(target));
    const search = params.toString();
    return `${basePath}${search ? `?${search}` : ''}`;
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const noun = labels ? (total > 1 ? labels.many : labels.one) : 'résultat(s)';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <p className="text-muted-foreground">
        {total === 0 ? 'Aucun résultat' : `${from}–${to} sur ${total} ${noun}`}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild disabled={page <= 1}>
          {page <= 1 ? (
            <span className="pointer-events-none opacity-50">
              <ChevronLeft className="size-4" /> Précédent
            </span>
          ) : (
            <Link href={buildHref(page - 1)}>
              <ChevronLeft className="size-4" /> Précédent
            </Link>
          )}
        </Button>
        <span className="px-1 text-xs font-medium text-muted-foreground">
          Page {page} / {Math.max(pageCount, 1)}
        </span>
        <Button variant="outline" size="sm" asChild disabled={page >= pageCount}>
          {page >= pageCount ? (
            <span className="pointer-events-none opacity-50">
              Suivant <ChevronRight className="size-4" />
            </span>
          ) : (
            <Link href={buildHref(page + 1)}>
              Suivant <ChevronRight className="size-4" />
            </Link>
          )}
        </Button>
      </div>
    </div>
  );
}

export { StatusBadge };
