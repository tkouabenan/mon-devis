# MON DEVIS

Plateforme SaaS de création, gestion, suivi et export de **devis professionnels**, avec facturation, catalogue clients/produits, statistiques et validation client en ligne.

Application Next.js (App Router) + TypeScript + PostgreSQL. Interface **française** par défaut, architecture prête pour le multilingue.

---

## Sommaire

- [Ce qui fonctionne aujourd'hui](#ce-qui-fonctionne-aujourdhui)
- [Ce qui reste à faire (état honnête)](#ce-qui-reste-à-faire-état-honnete)
- [Stack technique](#stack-technique)
- [Démarrage local](#démarrage-local)
- [Variables d'environnement](#variables-denvironnement)
- [En cas de problème d'accès](#en-cas-de-problème-daccès)
- [Déploiement](#déploiement)
- [Commandes utiles](#commandes-utiles)
- [Tests](#tests)
- [Sécurité](#sécurité)
- [Structure du projet](#structure-du-projet)

---

## Ce qui fonctionne aujourd'hui

| Module | État |
| --- | --- |
| Landing marketing (hero, fonctionnalités, 3 étapes, formules, FAQ, CGU, confidentialité) | ✅ Données réelles ; contenus de démonstration clairement identifiés, aucune preuve sociale inventée |
| Inscription, connexion, mot de passe oublié/réinitialisé, vérification e-mail, sessions | ✅ bcrypt, jetons hachés en base, limitation de débit |
| Onboarding guidé (entreprise, réglages, logo) | ✅ Reprise possible à chaque étape |
| Tableau de bord (KPI, graphiques, filtres de période) | ✅ 100 % alimenté par la base, états vides explicites |
| Devis : éditeur deux panneaux, aperçu temps réel, calculs, 8 modèles | ✅ Totaux recalculés côté serveur (arithmétique décimale) |
| Statuts de devis (Brouillon → Accepté/Refusé/Expiré) + historique | ✅ Transitions tracées, motifs client conservés |
| Partages client : lien signé, consultation, acceptation/refus/demande de modification | ✅ Jeton haché, expiration, révocation, décision historisée |
| Exports PDF / Word / Excel de devis et factures | ✅ Documents réels, données réelles, pagination, formules Excel vivantes |
| Clients (CRM-lite) et catalogue produits/services | ✅ CRUD, recherche, filtres, export CSV |
| Factures : conversion, règlements partiels, retards, relances | ✅ Snapshot figé du devis d'origine |
| Statistiques (taux d'acceptation, délais, top clients/prestations, année sur année) | ✅ Export Excel et PDF |
| Modèles de devis (galerie, application par défaut) | ✅ Modèles premium contrôlés côté serveur |
| Mon entreprise (mentions légales, logo, coordonnées de paiement) | ✅ Reprises sur chaque document |
| Paramètres (profil, documents, notifications, sécurité, organisations, données) | ✅ Sessions révocables, demande de suppression tracée |
| Abonnement (formule, consommation, limites, comparaison) | ✅ Limites réellement appliquées côté serveur |
| Aide & support (guides, FAQ, tickets) | ✅ Demandes enregistrées en base |
| Santé du déploiement (`/api/health`) | ✅ Vérifie base, migrations, stockage, e-mail, paiements |

## Ce qui reste à faire (état honnête)

1. **Espace Super Admin** (`/admin*`) : le schéma (`isPlatformAdmin`, `subscriptionPlans`, `auditLogs`, `supportTickets`) et la garde `requirePlatformAdmin` existent, **l'interface n'est pas construite**. La gestion des formules et le traitement des demandes se font aujourd'hui en base.
2. **Paiement en ligne** : aucun paiement n'est simulé. L'architecture (formules, limites, essais, gating, champs prestataires Stripe/CinetPay/Paystack/Mobile Money) est en place ; l'activation d'une formule payante passe par une **demande tracée** traitée manuellement, jusqu'à l'intégration d'un prestataire avec vérification serveur et webhooks signés.
3. **Envoi d'e-mails** : les gabarits et la journalisation existent, l'envoi réel dépend de `EMAIL_DRIVER` (smtp/resend/postmark). Sans configuration, les messages sont enregistrés et tracés, **jamais présentés comme envoyés**.
4. **Notifications temps réel** : la cloche fonctionne par rechargement de page (pas de WebSocket).
5. **Modèle de rendu PDF en arabe / RTL** : non pris en charge (encodage WinAnsi des polices standard).
6. **Rappels planifiés** (cron d'expiration de devis, échéances de factures) : la logique de calcul existe (`markOverdueInvoices`, alertes), la planification doit être branchée sur un cron d'hébergement.

---

## Stack technique

- **Next.js 15** (App Router, Server Actions, Server Components) + **React 19** + **TypeScript**
- **Tailwind CSS** + composants maison dérivés de Radix UI + **Lucide** (icônes) + **Recharts** (graphiques) + **Sonner** (toasts)
- **PostgreSQL** + **Drizzle ORM** (migrations SQL versionnées dans `drizzle/`)
- **pdfkit** (PDF), **docx** (Word), **ExcelJS** (Excel)
- Authentification maison : sessions opaques hachées, bcrypt (`bcryptjs`), jetons à usage unique
- Stockage de fichiers : disque local (développement) ou **S3 compatible** (production)
- Tests : **Vitest** (unitaires + intégration sur base réelle)

---

## Démarrage local

### Prérequis

- Node.js **≥ 20.9**
- Aucun PostgreSQL à installer : le projet embarque une base locale (`@embedded-postgres`)

### Mise en route

Sur une machine fraîchement clonée, une seule commande suffit : elle installe les
dépendances, crée le fichier `.env` avec des secrets aléatoires, démarre la base
locale, applique le schéma puis charge le jeu de démonstration.

```bash
npm run setup     # tout préparer (idempotent : relançable sans risque)
npm run dev       # puis démarrez l'application
```

```bash
npm run setup -- --reset     # base repartie de zéro
npm run setup -- --no-seed   # sans le jeu de démonstration
```

<details>
<summary>Mise en route manuelle, étape par étape</summary>

```bash
npm install              # 1. Dépendances
cp .env.example .env     # 2. Configuration (générez AUTH_SECRET, voir plus bas)
npm run db:start         # 3. Base locale PostgreSQL (port 54329)
npm run db:migrate       # 4. Schéma
npm run db:seed          # 5. Données de démonstration (relançable)
npm run dev              # 6. Application — http://localhost:3000
```

</details>

### Comptes de démonstration

Ils sont créés par `npm run db:seed` (chargé par `npm run setup`). En
développement, les trois premiers sont **affichés directement sur la page de
connexion** (`/connexion`) : un clic pré-remplit le formulaire.

| Compte | Mot de passe | Rôle | Formule |
| --- | --- | --- | --- |
| `demo@mon-devis.app` | `Demo2026!` | Propriétaire — Bâtir & Conseil SARL | Pro |
| `commercial@mon-devis.app` | `Demo2026!` | Membre de l'équipe (accès limité) | Pro |
| `studio@mon-devis.app` | `Demo2026!` | Second espace — Studio Créatif Abidjan | Gratuite |
| `admin@mon-devis.app` | `Admin2026!` | Administrateur plateforme — non affiché sur la page de connexion | — |

42 devis, 8 clients, 18 produits, factures et notifications accompagnent le
compte propriétaire.

> Ces comptes sont réservés au développement : `npm run db:seed` **refuse de
> s'exécuter** quand `NODE_ENV=production` (sauf `-- --force` explicite) et le
> panneau « Comptes de démonstration » n'apparaît pas en production.
>
> Le compte administrateur n'a **pas encore d'interface dédiée** (`/admin*`, voir
> « Ce qui reste à faire ») : il donne accès aux gardes serveur `requirePlatformAdmin`
> utilisées par les actions d'administration.
>
> Sans jeu de démonstration, l'application fonctionne : créez simplement un compte
> depuis `/inscription` puis suivez l'onboarding.

---

## Variables d'environnement

Copiez `.env.example` vers `.env` et adaptez. **Rien n'est obligatoire en développement** hormis `DATABASE_URL`.

### Obligatoires

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Chaîne de connexion PostgreSQL. **Obligatoire en production** (Neon, Supabase, Vercel Postgres, Railway…) |
| `AUTH_SECRET` | Secret de signature des sessions, **32 caractères minimum**. Obligatoire en production (`openssl rand -base64 48`) |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'application. Sert aux liens de partage des devis et aux e-mails |

> **Build et exécution.** Le `next build` ne lit **aucun** secret d'exécution : il réussit sans `DATABASE_URL` ni `AUTH_SECRET`, ce qui permet de construire l'application sur un hébergeur qui ne les expose pas au build (Vercel). En revanche, l'application **exige** ces deux variables à l'exécution : sans elles, `/api/health` répond `503` en nommant la variable manquante. Après avoir ajouté une variable sur Vercel, **redéployez** pour qu'elle soit prise en compte.

### Recommandées

| Variable | Description |
| --- | --- |
| `APP_NAME` | Nom affiché (défaut : « MON DEVIS ») |
| `IP_HASH_SALT` | Sel de hachage des adresses IP dans les journaux (RGPD) |
| `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_MAX_REQUESTS` | Fenêtre et quota de limitation de débit par IP |
| `ALLOWED_DEV_ORIGINS` | Hôtes autorisés en développement (aperçus, tunnels) — ignoré en production |
| `TEST_DATABASE_URL` | Base des tests d'intégration (défaut : `mon_devis_test` sur le port 54329). Jamais utilisée par l'application |

### Stockage des fichiers (production : obligatoire)

| Variable | Description |
| --- | --- |
| `STORAGE_DRIVER` | `local` (défaut, développement) ou `s3` (production) |
| `STORAGE_LOCAL_DIR` | Répertoire du stockage local (défaut `./var/uploads`) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` | Stockage objet compatible S3 (AWS, Cloudflare R2, Supabase Storage, MinIO) |

> ⚠️ Sur un hébergement serverless (Vercel, Netlify Functions), le disque est **éphémère et en lecture seule** en dehors de `/tmp` : configurez `STORAGE_DRIVER=s3`, sinon les logos envoyés disparaissent au redéploiement. L'application affiche un message explicite si le disque est en lecture seule.

### E-mail

| Variable | Description |
| --- | --- |
| `EMAIL_DRIVER` | `console` (défaut : journalise, n'envoie rien), `smtp`, `resend`, `postmark` |
| `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `RESEND_API_KEY`, `POSTMARK_SERVER_TOKEN` | Configuration du fournisseur choisi |

### Paiements (facultatif)

| Variable | Description |
| --- | --- |
| `PAYMENT_PROVIDER` | `none` (défaut), `stripe`, `cinetpay`, `paystack` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | Clés Stripe et identifiants de tarifs |
| `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `PAYSTACK_SECRET_KEY` | Autres prestataires |
| `ORANGE_MONEY_*`, `MTN_MOMO_*`, `WAVE_API_KEY` | Mobile Money (préparation) |

> Tant que `PAYMENT_PROVIDER=none`, l'application **ne simule aucun paiement** : la page Abonnement l'indique et enregistre une demande de changement de formule à traiter manuellement.

---

## En cas de problème d'accès

L'application explique elle-même ce qui manque, plutôt que d'afficher une page d'erreur opaque :

| Symptôme | Où regarder |
| --- | --- |
| « Service momentanément indisponible » sur `/connexion` | La bannière indique la cause exacte (hôte introuvable, identifiants refusés, `DATABASE_URL` absente…). Corrigez la variable puis rechargez. |
| `error` sur `/api/health` | Sonde JSON : `database`, `auth`, `storage`, `email`, `payments`. Un `error` renvoie `503` et nomme la variable responsable. |
| Connexion refusée alors que la base répond | Les comptes de démonstration n'existent que si `npm run db:seed` a été exécuté : vérifiez avec `npm run setup`. |
| Tableau de bord qui redirige sans cesse vers `/connexion` | Base injoignable : l'application refuse la session (échec fermé) et l'annonce sur la page de connexion. |

Sous le capot : si PostgreSQL ne répond pas, `getSession()` renvoie « aucune session »
au lieu de faire échouer la page ; la connexion affiche la cause ; les erreurs
restantes sont rendues par un écran d'erreur en français (`src/app/error.tsx`,
`src/app/(app)/error.tsx`) proposant « Réessayer » et un lien vers l'état du service.

---

## Déploiement

### Vercel + PostgreSQL managé (recommandé)

1. **Base de données** — créez une base PostgreSQL (Neon, Supabase, Vercel Postgres…) et récupérez sa chaîne de connexion.

2. **Import du dépôt** — sur Vercel : *Add New → Project → Import Git Repository*, framework détecté automatiquement (Next.js).

3. **Variables d'environnement** (Project → Settings → Environment Variables) :

   ```
   DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
   AUTH_SECRET=<openssl rand -base64 48>
   NEXT_PUBLIC_APP_URL=https://votre-domaine.vercel.app
   STORAGE_DRIVER=s3
   S3_ENDPOINT=… S3_REGION=… S3_BUCKET=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=…
   EMAIL_DRIVER=resend          # ou smtp / postmark
   RESEND_API_KEY=…
   IP_HASH_SALT=<chaîne aléatoire>
   ```

4. **Migrations** — à exécuter une fois, depuis votre machine ou une CI, avec la chaîne de connexion de production :

   ```bash
   DATABASE_URL="postgresql://…" npm run db:migrate:prod
   ```

   (Pour créer la base de démonstration : `DATABASE_URL="…" npm run db:seed`. À éviter en production réelle.)

5. **Déploiement** — cliquez sur *Deploy*. `next build` doit se terminer sans erreur ; la page `/api/health` confirme ensuite l'état réel des connexions (base, migrations, stockage, e-mail, paiements).

6. **Domaine** — ajoutez votre domaine puis mettez à jour `NEXT_PUBLIC_APP_URL` (utilisé par les liens de partage client) et redéployez.

### Supabase (PostgreSQL hébergé)

Le projet utilise PostgreSQL via Drizzle : Supabase sert simplement d'hébergeur,
aucune adaptation de code n'est nécessaire. Récupérez la chaîne dans
*Project Settings → Database → Connection string → URI*.

| Usage | Chaîne à utiliser |
| --- | --- |
| Migrations (depuis votre machine ou une CI) | pooler de **session**, port `5432` : `postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require` |
| Application (variable Vercel) | pooler de **transactions**, port `6543`, utilisateur `postgres.<ref>-pooler` : `postgresql://postgres.<ref>-pooler:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require` |

```bash
# 1. Appliquer les 4 migrations du dossier drizzle/ sur la base Supabase
DATABASE_URL="postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require" \
  npm run db:migrate:prod

# 2. Vérifier depuis l'application déployée
curl https://votre-domaine.vercel.app/api/health
```

Trois pièges rencontrés concrètement :

- **Encodage du mot de passe.** Un caractère spécial doit être encodé (`@` → `%40`,
  espace → `%20`, `#` → `%23`). Sans cela le pilote intègre les caractères suivants
  dans le mot de passe : une URL de la forme `…postgres:motdepasse @db.…` est lue
  avec le mot de passe `motdepasse @` et l'authentification échoue systématiquement.
- **Port du pooler.** Le port `6543` (transactions) ne supporte pas les instructions
  préparées : utilisez le port `5432` (session) pour les migrations.
- **`--reset` est refusé sur une base distante.** `npm run db:reset` supprime tout le
  schéma public ; le script refuse de le faire sur un hôte non local afin de protéger
  la production et ses extensions.

**Stockage des fichiers** : Supabase Storage est compatible S3, donc
`STORAGE_DRIVER=s3` avec `S3_ENDPOINT=https://<ref>.supabase.co/storage/v1/s3`,
`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` issus des clés d'accès S3 du projet,
et `S3_BUCKET` = le nom du bucket créé. Indispensable sur Vercel (système de
fichiers éphémère).

> ⚠️ Le mot de passe de la base et `AUTH_SECRET` ne vont **que** dans les variables
> d'environnement de Vercel. `.env` est ignoré par git et `.env.example` est un
> modèle publié : n'y mettez jamais de valeur réelle.

#### Sans serveur d'aperçu qui écrase le build

Pour vérifier un build en local **sans casser le serveur de développement en cours**, utilisez un répertoire de sortie séparé :

```bash
NEXT_DIST_DIR=.next-build npx next build
```

### Auto-hébergement (VPS, Docker, serveur dédié)

```bash
npm ci
npm run build
DATABASE_URL="postgresql://…" npm run db:migrate:prod
npm run start:prod        # écoute sur 0.0.0.0:${PORT:-3000}
```

Placez l'application derrière un reverse proxy HTTPS (Nginx, Caddy) et définissez `NEXT_PUBLIC_APP_URL` sur l'URL publique. Le stockage `local` fonctionne ici (disque persistant) : pensez à sauvegarder `var/uploads` avec la base.

### Liste de contrôle avant mise en ligne

- [ ] `DATABASE_URL` pointe vers la base de production et les migrations sont appliquées
- [ ] `AUTH_SECRET` fait au moins 32 caractères et n'est pas celui de développement
- [ ] `NEXT_PUBLIC_APP_URL` correspond au domaine réel (liens de partage corrects)
- [ ] `STORAGE_DRIVER=s3` si l'hébergement est serverless
- [ ] `EMAIL_DRIVER` configuré (sinon aucun e-mail ne part — c'est volontaire, mais à savoir)
- [ ] Les comptes de démonstration du seed ne sont pas présents en production
- [ ] `/api/health` répond `200` (aucun `error` : base joignable, migrations appliquées, `AUTH_SECRET` présent)
- [ ] Sauvegardes automatiques de la base activées chez l'hébergeur

---

## Commandes utiles

| Commande | Rôle |
| --- | --- |
| `npm run setup` | Remise en route complète (`.env`, dépendances, base, migrations, démo) |
| `npm run dev` | Serveur de développement (0.0.0.0:3000) |
| `npm run build` / `npm run start:prod` | Build de production et démarrage |
| `npm run typecheck` | Vérification TypeScript (aucune erreur tolérée) |
| `npm test` | Tests unitaires (calculs, exports) |
| `npm run test:integration` | Tests d'intégration (base PostgreSQL réelle) |
| `npm run verify` | `typecheck` + tests unitaires |
| `npm run db:start` / `npm run db:stop` | Base PostgreSQL locale embarquée |
| `npm run db:migrate` | Applique les migrations (`drizzle/`) |
| `npm run db:migrate:prod` | Applique les migrations via Drizzle Kit (sans `tsx`, pour la CI) |
| `npm run db:seed` | Données de démonstration (relançable sans doublon) |
| `npm run db:reset` | Réinitialise et reseede la base locale |
| `npm run db:generate` | Génère une migration après modification du schéma |
| `npm run db:studio` | Explorateur de base Drizzle |

---

## Tests

```bash
npm run verify              # typage + tests unitaires (23 tests)
npm run test:integration    # 63 tests sur la base mon_devis_test
```

`npm run setup` applique automatiquement les migrations aux **deux** bases :
`mon_devis` (développement) et `mon_devis_test` (tests d'intégration, voir
`TEST_DATABASE_URL`). La base de test est vidée par les tests, elle ne contient
jamais les données de démonstration.

Les tests d'intégration vérifient notamment :

- **isolatIon entre organisations** : toute ressource d'une autre organisation renvoie « introuvable »
- **calculs et TVA** : remises par ligne et globales, TVA inclusive/exclusive, acompte et solde
- **cycle de vie des devis** : création, transitions de statut, duplication, suppression logique
- **authentification** : hachage bcrypt, jetons de session/réinitialisation hachés, limitation de débit
- **quotas de formules** : 5 devis/5 factures sur la formule gratuite, illimité sur Pro/Business
- **conversion en facture** : snapshot figé, règlements partiels, retards, exports PDF/Word/Excel non vides
- **liens de partage** : jeton non stocké en clair, expiration, révocation, décision unique

---

## Sécurité

- **Cloisonnement par organisation** : chaque requête est filtrée par `organizationId` ; aucune confiance au client.
- **Mots de passe** : hachage bcrypt ; politique de 12 caractères minimum (minuscule, majuscule, chiffre, caractère spécial).
- **Sessions** : jeton opaque de 256 bits, stocké **haché** (SHA-256), cookie `HttpOnly` + `SameSite=Lax` + `Secure` en production ; révocation individuelle.
- **Jetons de partage** : hachés en base, avec expiration, préfixe d'identification et révocation ; aucun jeton en clair n'est journalisé.
- **Limitation de débit** : inscription, connexion, réinitialisation et décisions client (par IP hachée).
- **Téléversements** : types MIME vérifiés, taille limitée, images ré-encodées, SVG assainis.
- **Paiements** : aucune activation de formule sans règlement réel vérifié ; aucun webhook non signé n'est accepté le jour où un prestataire sera branché.
- **Journaux d'audit** : actions sensibles tracées (créations, modifications, suppressions, exports, changements de formule, connexions).
- **Données personnelles** : les adresses IP sont hachées avec `IP_HASH_SALT`, jamais stockées en clair.
- **Secrets** : `.env` est ignoré par git (vérifiez avec `git check-ignore -v .env`) ; seul le modèle `.env.example` est publié, sans valeur réelle. Un secret committé — même supprimé au commit suivant — reste lisible dans l'historique d'un dépôt public : il faut le **faire tourner** (mot de passe de la base, `AUTH_SECRET`), pas seulement le retirer.

---

## Structure du projet

```
src/
  app/
    (marketing)/          # Landing, CGU, confidentialité
    (auth)/               # Connexion, inscription, mot de passe, vérification e-mail
    (app)/                # Espace de travail : tableau de bord, devis, clients,
                          # produits, factures, statistiques, modèles, mon-entreprise,
                          # abonnement, paramètres, aide
    d/[token]/            # Page publique de validation d'un devis partagé
    api/                  # Exports (devis, factures, clients, produits, statistiques), fichiers, santé
    actions/              # Server Actions (devis, factures, clients, produits, paramètres, abonnement)
  components/             # UI (Radix + Tailwind), graphiques, éditeurs, formulaires
  db/                     # Schéma Drizzle + pool PostgreSQL
  lib/
    services/             # Accès données métier (devis, factures, analytics, abonnements…)
    documents/            # Générateurs PDF, Word, Excel
    auth/                 # Sessions, mots de passe, gardes de routes
    validation/           # Schémas Zod partagés client/serveur
drizzle/                  # Migrations SQL versionnées
scripts/                  # Base locale, migrations, jeu de données
tests/                    # Unitaires + intégration
```

---

## Licence

Projet privé — tous droits réservés.
