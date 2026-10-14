'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bell,
  Building2,
  Download,
  FileText,
  ImageUp,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserCog,
} from 'lucide-react';
import {
  addOrganizationAction,
  changeOwnPasswordAction,
  createSupportTicketAction,
  requestAccountDeletionAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  setActiveOrganizationAction,
  updateDocumentSettingsAction,
  updateNotificationPreferencesAction,
  updateProfileAction,
  uploadAvatarAction,
} from '@/app/actions/settings';
import type { ActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, DefinitionList } from '@/components/ui/display';
import { Checkbox, FieldError, FormField, Input, Label, Select, SwitchRow, Textarea } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/overlay';
import { CURRENCIES } from '@/lib/currency';
import { COUNTRIES } from '@/lib/constants';
import { QUOTATION_TEMPLATES } from '@/lib/templates';

export interface SettingsData {
  profile: {
    name: string;
    email: string;
    phone: string | null;
    locale: string;
    theme: 'LIGHT' | 'DARK' | 'SYSTEM';
    avatarUrl: string | null;
    emailVerified: boolean;
    createdAt: string;
  };
  company: {
    organizationName: string;
    logoUrl: string | null;
    countryCode: string;
  };
  documents: {
    defaultCurrency: string;
    defaultTaxRate: string;
    defaultValidityDays: number;
    defaultTemplateKey: string;
    numberingFormat: string;
    numberingResetYearly: boolean;
    invoiceNumberingFormat: string;
    invoiceDueDays: number;
    pricesIncludeTax: boolean;
    defaultPaymentTerms: string | null;
    defaultTerms: string | null;
    defaultNotes: string | null;
    brandColor: string;
    brandColorSecondary: string;
    logoPosition: string;
    emailReminders: boolean;
    numberingNextValue: number;
    invoiceNumberingNextValue: number;
  };
  notifications: {
    quotationViewed: boolean;
    quotationAccepted: boolean;
    quotationRejected: boolean;
    quotationExpiring: boolean;
    quotationExpired: boolean;
    exportReady: boolean;
    subscriptionUpdates: boolean;
    accountEvents: boolean;
    emailEnabled: boolean;
    reminderDaysBefore: number;
  };
  organizations: { id: string; name: string; role: string; planName: string; isActive: boolean }[];
  sessions: { id: string; userAgent: string | null; createdAt: string; lastSeenAt: string; isCurrent: boolean }[];
  deletionRequested: boolean;
}

/**
 * Interrupteur relié à un champ de formulaire : `SwitchRow` ne porte pas de nom,
 * on ajoute donc un champ caché qui suit l'état contrôlé.
 */
function SwitchFormRow({
  id,
  name,
  label,
  description,
  defaultChecked = false,
}: {
  id: string;
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
}) {
  const [checked, setChecked] = React.useState(defaultChecked);
  return (
    <div>
      <input type="hidden" name={name} value={checked ? 'on' : ''} />
      <SwitchRow label={label} description={description} checked={checked} onCheckedChange={setChecked} />
    </div>
  );
}

const TABS = [
  { id: 'profil', label: 'Profil', icon: UserCog },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'securite', label: 'Sécurité', icon: ShieldCheck },
  { id: 'organisations', label: 'Organisations', icon: Building2 },
  { id: 'donnees', label: 'Données & compte', icon: Trash2 },
] as const;

type TabId = (typeof TABS)[number]['id'];

function useActionFeedback<T>(state: ActionResult<T> | undefined) {
  const handled = React.useRef<typeof state>(undefined);
  const router = useRouter();
  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.success) {
      toast.success(state.message ?? 'Enregistré.');
      router.refresh();
    } else {
      toast.error(state.message ?? 'Une erreur est survenue.');
    }
  }, [state, router]);
  return state && !state.success ? (state.errors ?? {}) : {};
}

/* -------------------------------------------------------------------------- */
/* Profil                                                                     */
/* -------------------------------------------------------------------------- */

function ProfilePanel({ data }: { data: SettingsData }) {
  const router = useRouter();
  const [state, formAction, pending] = React.useActionState<ActionResult | undefined, FormData>(updateProfileAction, undefined);
  const [avatarState, avatarAction, avatarPending] = React.useActionState<ActionResult<{ url: string }> | undefined, FormData>(
    uploadAvatarAction,
    undefined,
  );
  const errors = useActionFeedback(state);
  useActionFeedback(avatarState);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photo de profil</CardTitle>
          <CardDescription>Affichée dans l’en-tête de l’espace de travail. PNG ou JPG, 2 Mo maximum.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border bg-muted">
            {data.profile.avatarUrl ? (
              <Image src={data.profile.avatarUrl} alt="Photo de profil" width={64} height={64} className="h-16 w-16 object-cover" unoptimized />
            ) : (
              <span className="text-lg font-semibold text-muted-foreground">
                {data.profile.name
                  .split(' ')
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join('')}
              </span>
            )}
          </div>
          <form action={avatarAction} className="flex flex-wrap items-end gap-3">
            <FormField label="Changer la photo" htmlFor="avatar">
              <Input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg" required />
            </FormField>
            <Button type="submit" variant="outline" disabled={avatarPending}>
              {avatarPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <ImageUp className="mr-2 h-4 w-4" aria-hidden />}
              Envoyer
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Vérification e-mail :{' '}
            {data.profile.emailVerified ? (
              <Badge variant="success">vérifiée</Badge>
            ) : (
              <Link href="/verifier-email" className="underline underline-offset-4">
                non vérifiée — envoyer le lien
              </Link>
            )}
          </p>
        </CardContent>
      </Card>

      <form action={formAction} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informations personnelles</CardTitle>
            <CardDescription>Votre nom apparaît sur les devis que vous créez et dans l’historique.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nom complet" htmlFor="name" required error={errors.name}>
              <Input id="name" name="name" defaultValue={data.profile.name} required minLength={2} />
            </FormField>
            <FormField label="Adresse e-mail" htmlFor="email" hint="La modification de l’adresse e-mail passe par la vérification par e-mail.">
              <Input id="email" value={data.profile.email} disabled readOnly />
            </FormField>
            <FormField label="Téléphone" htmlFor="phone" error={errors.phone}>
              <Input id="phone" name="phone" defaultValue={data.profile.phone ?? ''} placeholder="+225 07 00 00 00 00" />
            </FormField>
            <FormField label="Langue de l’interface" htmlFor="locale" hint="L’interface est en français ; d’autres langues arrivent prochainement.">
              <Select id="locale" name="locale" defaultValue={data.profile.locale}>
                <option value="fr">Français</option>
                <option value="en">English (bêta)</option>
              </Select>
            </FormField>
            <FormField label="Apparence" htmlFor="theme">
              <Select id="theme" name="theme" defaultValue={data.profile.theme}>
                <option value="SYSTEM">Système</option>
                <option value="LIGHT">Clair</option>
                <option value="DARK">Sombre</option>
              </Select>
            </FormField>
          </CardContent>
          <CardContent className="pt-0">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}
              Enregistrer le profil
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

function DocumentsPanel({ data }: { data: SettingsData }) {
  const [state, formAction, pending] = React.useActionState<ActionResult | undefined, FormData>(
    updateDocumentSettingsAction,
    undefined,
  );
  const errors = useActionFeedback(state);
  const [currency, setCurrency] = React.useState(data.documents.defaultCurrency);
  const [includeTax, setIncludeTax] = React.useState(data.documents.pricesIncludeTax);

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Valeurs par défaut des devis</CardTitle>
          <CardDescription>Appliquées à chaque nouveau devis ; chaque document reste modifiable individuellement.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Devise" htmlFor="defaultCurrency">
            <Select id="defaultCurrency" name="defaultCurrency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {CURRENCIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} — {item.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Taux de TVA par défaut (%)" htmlFor="defaultTaxRate" error={errors.defaultTaxRate}>
            <Input id="defaultTaxRate" name="defaultTaxRate" type="number" step="0.25" min="0" max="100" defaultValue={data.documents.defaultTaxRate} required />
          </FormField>
          <FormField label="Durée de validité (jours)" htmlFor="defaultValidityDays" error={errors.defaultValidityDays}>
            <Input id="defaultValidityDays" name="defaultValidityDays" type="number" min="1" max="365" defaultValue={data.documents.defaultValidityDays} required />
          </FormField>
          <FormField label="Modèle par défaut" htmlFor="defaultTemplateKey">
            <Select id="defaultTemplateKey" name="defaultTemplateKey" defaultValue={data.documents.defaultTemplateKey}>
              {QUOTATION_TEMPLATES.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.name}
                  {template.premium ? ' (Premium)' : ''}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Conditions de paiement" htmlFor="defaultPaymentTerms" className="sm:col-span-2">
            <Textarea id="defaultPaymentTerms" name="defaultPaymentTerms" rows={2} defaultValue={data.documents.defaultPaymentTerms ?? ''} placeholder="30 % à la commande, solde à la livraison." />
          </FormField>
          <FormField label="Conditions générales" htmlFor="defaultTerms" className="sm:col-span-2">
            <Textarea id="defaultTerms" name="defaultTerms" rows={3} defaultValue={data.documents.defaultTerms ?? ''} placeholder="Devis valable 30 jours. Toute commande implique l’acceptation des présentes conditions." />
          </FormField>
          <FormField label="Notes de bas de devis" htmlFor="defaultNotes" className="sm:col-span-2">
            <Textarea id="defaultNotes" name="defaultNotes" rows={2} defaultValue={data.documents.defaultNotes ?? ''} placeholder="Merci de votre confiance." />
          </FormField>
          <div className="sm:col-span-2">
            <input type="hidden" name="pricesIncludeTax" value={includeTax ? 'on' : ''} />
            <SwitchRow
              label="Saisir les prix TTC"
              description="Si activé, les prix saisis dans l’éditeur sont considérés comme TTC et la TVA est extraite."
              checked={includeTax}
              onCheckedChange={setIncludeTax}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Numérotation</CardTitle>
          <CardDescription>
            Jetons disponibles : <code>{'{YYYY}'}</code>, <code>{'{MM}'}</code>, <code>{'{SEQ:n}'}</code> (compteur, largeur n),
            <code> {'{PREFIX}'}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Format des devis" htmlFor="numberingFormat" error={errors.numberingFormat}>
            <Input id="numberingFormat" name="numberingFormat" defaultValue={data.documents.numberingFormat} placeholder="DEV-{YYYY}-{SEQ:4}" />
          </FormField>
          <FormField label="Prochain numéro de devis" hint={`La séquence reprendra à ${data.documents.numberingNextValue}.`}>
            <Input value={data.documents.numberingResetYearly ? `${data.documents.numberingNextValue} (remis à 1 chaque année)` : String(data.documents.numberingNextValue)} disabled readOnly />
          </FormField>
          <FormField label="Format des factures" htmlFor="invoiceNumberingFormat">
            <Input id="invoiceNumberingFormat" name="invoiceNumberingFormat" defaultValue={data.documents.invoiceNumberingFormat} placeholder="FAC-{YYYY}-{SEQ:4}" />
          </FormField>
          <FormField label="Délai de règlement (jours)" htmlFor="invoiceDueDays" hint="Sert à calculer la date d’échéance des factures.">
            <Input id="invoiceDueDays" name="invoiceDueDays" type="number" min="0" max="365" defaultValue={data.documents.invoiceDueDays} />
          </FormField>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox id="numberingResetYearly" name="numberingResetYearly" defaultChecked={data.documents.numberingResetYearly} />
            <Label htmlFor="numberingResetYearly">Réinitialiser la numérotation chaque année</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identité visuelle des documents</CardTitle>
          <CardDescription>Couleurs utilisées par les modèles personnalisables et position du logo.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FormField label="Couleur principale" htmlFor="brandColor">
            <Input id="brandColor" name="brandColor" type="color" defaultValue={data.documents.brandColor} className="h-10 w-24 p-1" />
          </FormField>
          <FormField label="Couleur secondaire" htmlFor="brandColorSecondary">
            <Input id="brandColorSecondary" name="brandColorSecondary" type="color" defaultValue={data.documents.brandColorSecondary} className="h-10 w-24 p-1" />
          </FormField>
          <FormField label="Position du logo" htmlFor="logoPosition">
            <Select id="logoPosition" name="logoPosition" defaultValue={data.documents.logoPosition}>
              <option value="LEFT">À gauche</option>
              <option value="CENTER">Centré</option>
              <option value="RIGHT">À droite</option>
            </Select>
          </FormField>
          <div className="sm:col-span-3">
            <SwitchFormRow
              id="emailReminders"
              name="emailReminders"
              label="Rappels automatiques par e-mail"
              description="Nous vous prévenons avant l’expiration d’un devis et avant l’échéance d’une facture."
              defaultChecked={data.documents.emailReminders}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}
          Enregistrer les réglages
        </Button>
        <Button asChild variant="outline">
          <Link href="/modeles">Voir la galerie de modèles</Link>
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

function NotificationsPanel({ data }: { data: SettingsData }) {
  const [state, formAction, pending] = React.useActionState<ActionResult | undefined, FormData>(
    updateNotificationPreferencesAction,
    undefined,
  );
  useActionFeedback(state);

  const items: { name: keyof Omit<SettingsData['notifications'], 'reminderDaysBefore'>; label: string; description: string }[] = [
    { name: 'quotationViewed', label: 'Devis consulté par le client', description: 'Uniquement lorsque la consultation est réellement observée sur un lien de partage.' },
    { name: 'quotationAccepted', label: 'Devis accepté', description: 'Notification immédiate dès l’acceptation par le client.' },
    { name: 'quotationRejected', label: 'Devis refusé', description: 'Inclut le motif laissé par le client.' },
    { name: 'quotationExpiring', label: 'Devis bientôt expiré', description: 'Alerte avant la date de validité, selon le délai choisi ci-dessous.' },
    { name: 'quotationExpired', label: 'Devis expiré', description: 'Lorsque la date de validité est dépassée sans réponse.' },
    { name: 'exportReady', label: 'Export généré', description: 'Confirmation lorsqu’un export de document ou de statistiques est produit.' },
    { name: 'subscriptionUpdates', label: 'Abonnement', description: 'Fin d’essai, changement de formule, échéance de facturation.' },
    { name: 'accountEvents', label: 'Compte et sécurité', description: 'Connexion depuis un nouvel appareil, changement de mot de passe.' },
  ];

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertes reçues</CardTitle>
          <CardDescription>
            Les alertes apparaissent dans la cloche de l’en-tête. Les e-mails sont envoyés uniquement si un fournisseur d’envoi est
            configuré pour votre espace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchFormRow
            id="emailEnabled"
            name="emailEnabled"
            label="Recevoir ces alertes par e-mail"
            description="Si désactivé, les alertes restent visibles dans la cloche de l’en-tête."
            defaultChecked={data.notifications.emailEnabled}
          />

          {items.map((item) => (
            <SwitchFormRow
              key={item.name}
              id={item.name}
              name={item.name}
              label={item.label}
              description={item.description}
              defaultChecked={data.notifications[item.name]}
            />
          ))}

          <FormField
            label="Prévenir combien de jours avant l’expiration d’un devis ?"
            htmlFor="reminderDaysBefore"
            hint="Entre 1 et 30 jours."
          >
            <Input
              id="reminderDaysBefore"
              name="reminderDaysBefore"
              type="number"
              min={1}
              max={30}
              defaultValue={data.notifications.reminderDaysBefore}
              className="w-32"
            />
          </FormField>
        </CardContent>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}
        Enregistrer mes préférences
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Sécurité                                                                   */
/* -------------------------------------------------------------------------- */

function SecurityPanel({ data }: { data: SettingsData }) {
  const router = useRouter();
  const [state, formAction, pending] = React.useActionState<ActionResult | undefined, FormData>(changeOwnPasswordAction, undefined);
  const errors = useActionFeedback(state);
  const [revoking, setRevoking] = React.useState<string | null>(null);
  const [revokingAll, setRevokingAll] = React.useState(false);

  const revoke = async (sessionId: string) => {
    setRevoking(sessionId);
    const result = await revokeSessionAction(sessionId);
    setRevoking(null);
    if (!result.success) {
      toast.error(result.message ?? 'Action impossible.');
      return;
    }
    toast.success(result.message ?? 'Session déconnectée.');
    router.refresh();
  };

  const revokeAll = async () => {
    setRevokingAll(true);
    const result = await revokeOtherSessionsAction();
    setRevokingAll(false);
    if (!result.success) {
      toast.error(result.message ?? 'Action impossible.');
      return;
    }
    toast.success(result.message ?? 'Sessions déconnectées.');
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden />
              Mot de passe
            </CardTitle>
            <CardDescription>
              12 caractères minimum, avec minuscule, majuscule, chiffre et caractère spécial. Les mots de passe sont hachés avec bcrypt.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField label="Mot de passe actuel" htmlFor="currentPassword" required error={errors.currentPassword}>
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
            </FormField>
            <FormField label="Nouveau mot de passe" htmlFor="password" required error={errors.password}>
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} />
            </FormField>
            <FormField label="Confirmation" htmlFor="confirmPassword" required error={errors.confirmPassword}>
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} />
            </FormField>
          </CardContent>
          <CardContent className="pt-0">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />}
              Mettre à jour le mot de passe
            </Button>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="h-4 w-4 text-primary" aria-hidden />
            Sessions actives
          </CardTitle>
          <CardDescription>Chaque connexion crée une session révocable individuellement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.sessions.map((session) => (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="space-y-0.5 text-sm">
                <p className="font-medium">
                  {session.userAgent?.slice(0, 70) ?? 'Appareil inconnu'} {session.isCurrent ? <Badge variant="success">session actuelle</Badge> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Créée le {new Date(session.createdAt).toLocaleString('fr-FR')} · dernière activité{' '}
                  {new Date(session.lastSeenAt).toLocaleString('fr-FR')}
                </p>
              </div>
              {!session.isCurrent ? (
                <Button variant="outline" size="sm" disabled={revoking === session.id} onClick={() => revoke(session.id)}>
                  {revoking === session.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <LogOut className="mr-2 h-4 w-4" aria-hidden />}
                  Déconnecter
                </Button>
              ) : null}
            </div>
          ))}
          <Button variant="outline" onClick={revokeAll} disabled={revokingAll || data.sessions.length <= 1}>
            {revokingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <LogOut className="mr-2 h-4 w-4" aria-hidden />}
            Déconnecter toutes les autres sessions
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Organisations                                                              */
/* -------------------------------------------------------------------------- */

function OrganizationsPanel({ data }: { data: SettingsData }) {
  const router = useRouter();
  const [switching, setSwitching] = React.useState<string | null>(null);
  const [state, formAction, pending] = React.useActionState<ActionResult<{ id: string }> | undefined, FormData>(
    addOrganizationAction,
    undefined,
  );
  useActionFeedback(state);

  const activate = async (organizationId: string) => {
    setSwitching(organizationId);
    const result = await setActiveOrganizationAction(organizationId);
    setSwitching(null);
    if (!result.success) {
      toast.error(result.message ?? 'Bascule impossible.');
      return;
    }
    toast.success(result.message ?? 'Organisation active mise à jour.');
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mes organisations</CardTitle>
          <CardDescription>
            Les données (devis, clients, produits, factures) sont strictement cloisonnées entre organisations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.organizations.map((organization) => (
            <div key={organization.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="space-y-0.5">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {organization.name}
                  {organization.isActive ? <Badge variant="default">active</Badge> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Rôle : {organization.role === 'OWNER' ? 'propriétaire' : organization.role === 'ADMIN' ? 'administrateur' : 'membre'} ·
                  Formule : {organization.planName}
                </p>
              </div>
              {!organization.isActive ? (
                <Button variant="outline" size="sm" disabled={switching === organization.id} onClick={() => activate(organization.id)}>
                  {switching === organization.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                  Basculer sur cet espace
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <form action={formAction} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nouvelle organisation</CardTitle>
            <CardDescription>
              Utile pour séparer plusieurs activités. Vous en devenez propriétaire et démarrez sur la formule gratuite.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nom de l’organisation" htmlFor="organization-name" required>
              <Input id="organization-name" name="name" required minLength={2} maxLength={120} placeholder="Ma deuxième activité" />
            </FormField>
            <div className="flex items-end gap-2 pb-2">
              <Checkbox id="withTrial" name="withTrial" />
              <Label htmlFor="withTrial">Démarrer un essai Pro de 30 jours</Label>
            </div>
          </CardContent>
          <CardContent className="pt-0">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Plus className="mr-2 h-4 w-4" aria-hidden />}
              Créer l’organisation
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Données & compte                                                           */
/* -------------------------------------------------------------------------- */

function DataPanel({ data }: { data: SettingsData }) {
  const router = useRouter();
  const [deletionState, deletionAction, deleting] = React.useActionState<ActionResult | undefined, FormData>(
    requestAccountDeletionAction,
    undefined,
  );
  const [ticketState, ticketAction, sending] = React.useActionState<ActionResult | undefined, FormData>(createSupportTicketAction, undefined);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingDeletion, setPendingDeletion] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  useActionFeedback(deletionState);
  useActionFeedback(ticketState);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-primary" aria-hidden />
            Exporter mes données
          </CardTitle>
          <CardDescription>
            Vous pouvez exporter à tout moment vos listes (clients, produits) et vos statistiques au format Excel ou PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/api/clients/export">Clients (CSV)</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/api/produits/export">Produits & services (CSV)</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/api/statistiques/export?format=xlsx&periode=12m">Statistiques (Excel)</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/api/statistiques/export?format=pdf&periode=12m">Statistiques (PDF)</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demander une assistance</CardTitle>
          <CardDescription>Votre demande est transmise à l’équipe et reste consultable depuis la page Aide &amp; support.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={ticketAction} className="space-y-4">
            <FormField label="Objet" htmlFor="subject" required>
              <Input id="subject" name="subject" required minLength={3} maxLength={160} placeholder="Problème d’export PDF" />
            </FormField>
            <FormField label="Message" htmlFor="message" required>
              <Textarea id="message" name="message" rows={4} required minLength={10} maxLength={4000} placeholder="Décrivez votre besoin, avec le numéro du devis concerné le cas échéant." />
            </FormField>
            <FormField label="Priorité" htmlFor="priority">
              <Select id="priority" name="priority" defaultValue="NORMAL">
                <option value="LOW">Basse</option>
                <option value="NORMAL">Normale</option>
                <option value="HIGH">Haute</option>
                <option value="URGENT">Urgente</option>
              </Select>
            </FormField>
            <Button type="submit" disabled={sending}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Envoyer la demande
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-rose-200 dark:border-rose-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            Supprimer mon compte
          </CardTitle>
          <CardDescription>
            La suppression est <strong>définitive</strong> : devis, clients, produits et factures de vos organisations seront
            supprimés. Les documents comptables légalement obligatoires sont conservés par l’administration pendant la durée légale.
            La demande est vérifiée par un administrateur avant exécution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.deletionRequested ? (
            <Alert variant="warning">
              Une demande de suppression est déjà enregistrée pour cet espace. L’administration la traitera après vérification ; vous
              pouvez la contester en répondant à notre e-mail de confirmation.
            </Alert>
          ) : (
            <form
              ref={formRef}
              action={deletionAction}
              className="space-y-4"
              onSubmit={(event) => {
                if (pendingDeletion) return;
                event.preventDefault();
                setConfirmOpen(true);
              }}
            >
              <FormField label="Mot de passe" htmlFor="deletion-password" required>
                <Input id="deletion-password" name="password" type="password" required autoComplete="current-password" />
              </FormField>
              <FormField label="Saisissez SUPPRIMER pour confirmer" htmlFor="confirmation" required>
                <Input id="confirmation" name="confirmation" required placeholder="SUPPRIMER" />
              </FormField>
              <Button type="submit" variant="destructive" disabled={deleting}>
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="mr-2 h-4 w-4" aria-hidden />}
                Demander la suppression
              </Button>
              <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Confirmer la demande de suppression"
                description="Votre espace de travail sera transmis à l’administration en vue de sa suppression définitive. Cette action ne peut pas être annulée une fois traitée."
                confirmLabel="Demander la suppression"
                loading={deleting}
                onConfirm={() => {
                  setPendingDeletion(true);
                  setConfirmOpen(false);
                  // Soumet le formulaire (le mot de passe et la confirmation ont déjà été saisis).
                  formRef.current?.requestSubmit();
                }}
              />
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Conteneur                                                                  */
/* -------------------------------------------------------------------------- */

export function SettingsTabs({ data, initialTab }: { data: SettingsData; initialTab?: string }) {
  const [tab, setTab] = React.useState<TabId>(
    (TABS.find((entry) => entry.id === initialTab)?.id ?? 'profil') as TabId,
  );

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Sections des paramètres" className="flex flex-wrap gap-2 border-b pb-3">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = entry.id === tab;
          return (
            <button
              key={entry.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(entry.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {entry.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {tab === 'profil' ? <ProfilePanel data={data} /> : null}
        {tab === 'documents' ? <DocumentsPanel data={data} /> : null}
        {tab === 'notifications' ? <NotificationsPanel data={data} /> : null}
        {tab === 'securite' ? <SecurityPanel data={data} /> : null}
        {tab === 'organisations' ? <OrganizationsPanel data={data} /> : null}
        {tab === 'donnees' ? <DataPanel data={data} /> : null}
      </div>

      <Card className="border-dashed">
        <CardContent className="py-5">
          <DefinitionList
            items={[
              { label: 'Compte créé le', value: new Date(data.profile.createdAt).toLocaleDateString('fr-FR') },
              { label: 'Organisation', value: data.company.organizationName },
              { label: 'Pays de facturation', value: COUNTRIES.find((country) => country.code === data.company.countryCode)?.name ?? data.company.countryCode },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
