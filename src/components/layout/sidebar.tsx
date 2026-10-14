'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, PanelLeftClose, X } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { NAV_SECTIONS } from '@/components/layout/nav-items';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Barre latérale repliable.
 * État conservé en `localStorage` : l'utilisateur retrouve sa préférence au
 * rechargement. Sur mobile, la navigation s'ouvre dans un tiroir.
 */

const STORAGE_KEY = 'mon-devis:sidebar-collapsed';

interface SidebarProps {
  organizationName: string;
  planName: string;
  isAdmin: boolean;
  unreadCount: number;
}

export function SidebarContent({
  collapsed,
  organizationName,
  planName,
  isAdmin,
  unreadCount,
  onNavigate,
  onToggle,
}: SidebarProps & { collapsed: boolean; onNavigate?: () => void; onToggle?: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string, match?: string[]) => {
    if (href === '/devis' && pathname.startsWith('/devis/') && pathname !== '/devis/nouveau') return true;
    if (match?.some((prefix) => pathname.startsWith(prefix))) return true;
    return pathname === href;
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto px-3 py-4">
      <div className={cn('flex items-center px-1 pb-2', collapsed ? 'justify-center' : 'justify-between')}>
        <Link href="/tableau-de-bord" onClick={onNavigate} aria-label="MON DEVIS — tableau de bord">
          <Logo size="sm" showWordmark={!collapsed} />
        </Link>
        {!collapsed && onToggle ? (
          <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Replier la navigation">
            <PanelLeftClose className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      <div className={cn('rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3', collapsed && 'hidden')}>
        <p className="truncate text-sm font-semibold text-sidebar-foreground">{organizationName}</p>
        <p className="mt-0.5 text-xs text-sidebar-foreground/60">Formule {planName}</p>
      </div>

      <nav className="flex-1 space-y-5" aria-label="Navigation principale">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            <p
              className={cn(
                'px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45',
                collapsed && 'sr-only',
              )}
            >
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href, item.match);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                        collapsed && 'justify-center px-2',
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
                      {item.href === '/aide' && unreadCount > 0 && !collapsed ? (
                        <span className="ml-auto rounded-full bg-primary-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {isAdmin ? (
          <div className="space-y-1">
            <p className={cn('px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45', collapsed && 'sr-only')}>
              Plateforme
            </p>
            <Link
              href="/admin"
              onClick={onNavigate}
              title={collapsed ? 'Administration' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg border border-dashed border-sidebar-border px-2.5 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent',
                collapsed && 'justify-center px-2',
              )}
            >
              <ChevronsLeft className="size-4 shrink-0" aria-hidden />
              <span className={cn(collapsed && 'sr-only')}>Administration</span>
            </Link>
          </div>
        ) : null}
      </nav>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === '1') setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((current) => {
      window.localStorage.setItem(STORAGE_KEY, current ? '0' : '1');
      return !current;
    });
  };

  return (
    <>
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex lg:flex-col',
          collapsed ? 'w-[76px]' : 'w-64',
        )}
      >
        {collapsed ? (
          <div className="flex justify-center pt-4">
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Déplier la navigation">
              <ChevronsLeft className="size-4 rotate-180" aria-hidden />
            </Button>
          </div>
        ) : null}
        <SidebarContent {...props} collapsed={collapsed} onToggle={toggle} />
      </aside>

      {/* Tiroir mobile */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fermer la navigation"
            className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-sidebar-border bg-sidebar shadow-xl">
            <div className="flex justify-end px-3 pt-3">
              <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(false)} aria-label="Fermer">
                <X className="size-4" aria-hidden />
              </Button>
            </div>
            <SidebarContent {...props} collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <MobileNavBridge onOpen={() => setMobileOpen(true)} />
    </>
  );
}

/** Expose l'ouverture du tiroir au bouton de la barre supérieure (sans contexte React global). */
function MobileNavBridge({ onOpen }: { onOpen: () => void }) {
  React.useEffect(() => {
    const handler = () => onOpen();
    window.addEventListener('mon-devis:open-nav', handler);
    return () => window.removeEventListener('mon-devis:open-nav', handler);
  }, [onOpen]);
  return null;
}
