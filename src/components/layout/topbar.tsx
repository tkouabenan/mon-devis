'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  ChevronDown,
  FilePlus2,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  UserRound,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { logoutAction } from '@/app/actions/auth';
import { loadNotificationsAction, markNotificationsReadAction } from '@/app/actions/notifications';
import { Button } from '@/components/ui/button';
import { Avatar, Badge } from '@/components/ui/display';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { Input } from '@/components/ui/form';
import { NOTIFICATION_TYPE_LABELS } from '@/lib/constants';
import { formatRelative } from '@/lib/utils';

interface TopbarProps {
  user: { name: string; email: string; avatarUrl: string | null; isPlatformAdmin: boolean };
  organization: { id: string; name: string };
  initialUnread: number;
  canCreateQuotation: boolean;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Barre supérieure : recherche globale, notifications, création rapide et menu
 * de profil. La recherche interroge les devis et les clients du serveur.
 */
export function Topbar({ user, organization, initialUnread, canCreateQuotation }: TopbarProps) {
  const router = useRouter();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<{ quotations: { id: string; label: string; hint: string }[]; customers: { id: string; label: string; hint: string }[] } | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [unread, setUnread] = React.useState(initialUnread);
  const [loadingNotifications, setLoadingNotifications] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);

  // Recherche globale (débouncée).
  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/recherche?q=${encodeURIComponent(term)}`, { headers: { accept: 'application/json' } });
        if (response.ok) {
          const payload = (await response.json()) as {
            quotations: { id: string; label: string; hint: string }[];
            customers: { id: string; label: string; hint: string }[];
          };
          setResults(payload);
        }
      } catch {
        setResults(null);
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [query]);

  const openNotifications = React.useCallback(async () => {
    setLoadingNotifications(true);
    try {
      const payload = await loadNotificationsAction();
      setNotifications(payload.notifications);
      setUnread(payload.unread);
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  const markAllRead = async () => {
    await markNotificationsReadAction();
    setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? new Date().toISOString() })));
    setUnread(0);
    toast.success('Notifications marquées comme lues.');
  };

  const currentTheme = resolvedTheme ?? theme;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Ouvrir la navigation"
          onClick={() => window.dispatchEvent(new Event('mon-devis:open-nav'))}
        >
          <Menu className="size-4" aria-hidden />
        </Button>

        {/* Recherche globale */}
        <div className="relative hidden max-w-md flex-1 sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un devis, un client…"
            aria-label="Recherche globale"
            className="pl-9"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && query.trim()) {
                router.push(`/devis?q=${encodeURIComponent(query.trim())}`);
                setResults(null);
              }
              if (event.key === 'Escape') setResults(null);
            }}
          />

          {query.trim().length >= 2 ? (
            <div className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-xl border border-border bg-popover shadow-elevated">
              {searching ? (
                <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Recherche…
                </p>
              ) : results && (results.quotations.length > 0 || results.customers.length > 0) ? (
                <div className="max-h-80 overflow-y-auto py-1">
                  {results.quotations.length > 0 ? (
                    <>
                      <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Devis</p>
                      {results.quotations.map((item) => (
                        <Link
                          key={item.id}
                          href={`/devis/${item.id}`}
                          className="block px-4 py-2 text-sm hover:bg-accent"
                          onClick={() => {
                            setResults(null);
                            setQuery('');
                          }}
                        >
                          <span className="font-medium">{item.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{item.hint}</span>
                        </Link>
                      ))}
                    </>
                  ) : null}
                  {results.customers.length > 0 ? (
                    <>
                      <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Clients</p>
                      {results.customers.map((item) => (
                        <Link
                          key={item.id}
                          href={`/clients/${item.id}`}
                          className="block px-4 py-2 text-sm hover:bg-accent"
                          onClick={() => {
                            setResults(null);
                            setQuery('');
                          }}
                        >
                          <span className="font-medium">{item.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{item.hint}</span>
                        </Link>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="px-4 py-3 text-sm text-muted-foreground">Aucun résultat pour « {query.trim()} ».</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="hidden md:inline-flex" asChild={canCreateQuotation}>
            {canCreateQuotation ? (
              <Link href="/devis/nouveau">
                <FilePlus2 className="size-4" aria-hidden />
                Nouveau devis
              </Link>
            ) : (
              <span title="Limite de votre formule atteinte">
                <FilePlus2 className="size-4" aria-hidden />
                Nouveau devis
              </span>
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={currentTheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
            onClick={() => setTheme(currentTheme === 'dark' ? 'light' : 'dark')}
          >
            {currentTheme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          </Button>

          {/* Notifications */}
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) void openNotifications();
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="relative" aria-label={`Notifications${unread > 0 ? ` (${unread} non lues)` : ''}`}>
                <Bell className="size-4" aria-hidden />
                {unread > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {unread > 9 ? '9+' : unread}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0">
              <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <p className="text-sm font-semibold">Notifications</p>
                {unread > 0 ? (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    <Check className="size-3.5" aria-hidden /> Tout marquer comme lu
                  </button>
                ) : null}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {loadingNotifications ? (
                  <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Chargement…
                  </p>
                ) : notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Aucune notification pour l’instant. Elles apparaîtront ici dès qu’un client consultera ou acceptera
                    un devis.
                  </p>
                ) : (
                  notifications.map((notification) => (
                    <Link
                      key={notification.id}
                      href={notification.link ?? '/tableau-de-bord'}
                      className={
                        notification.readAt
                          ? 'block border-b border-border/60 px-4 py-3 text-sm transition-colors last:border-0 hover:bg-accent'
                          : 'block border-b border-border/60 bg-primary/5 px-4 py-3 text-sm transition-colors last:border-0 hover:bg-accent'
                      }
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {NOTIFICATION_TYPE_LABELS[notification.type] ?? 'Notification'}
                        </span>
                        <span className="ml-auto text-[11px] text-muted-foreground">{formatRelative(notification.createdAt)}</span>
                      </span>
                      <span className="mt-1 block font-medium">{notification.title}</span>
                      {notification.body ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">{notification.body}</span>
                      ) : null}
                    </Link>
                  ))
                )}
              </div>

              <div className="border-t border-border p-2">
                <Link
                  href="/parametres#notifications"
                  className="block rounded-lg px-3 py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Gérer mes préférences de notification
                </Link>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Profil */}
          <DropdownMenu open={profileOpen} onOpenChange={setProfileOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 pl-1.5 pr-2">
                <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                <span className="hidden max-w-28 truncate text-sm font-medium sm:block">{user.name}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <span className="block truncate text-sm font-semibold">{user.name}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
                {user.isPlatformAdmin ? (
                  <Badge variant="default" className="mt-2">
                    Administrateur plateforme
                  </Badge>
                ) : null}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/parametres/profil">
                  <UserRound className="size-4" aria-hidden /> Mon profil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/parametres">
                  <Settings className="size-4" aria-hidden /> Paramètres
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/mon-entreprise" className="text-muted-foreground">
                  Organisation : {organization.name}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action={logoutAction}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full">
                    <LogOut className="size-4" aria-hidden /> Se déconnecter
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
