/**
 * Accès centralisé à la configuration (variables d'environnement).
 * Aucune clé secrète n'est jamais exposée au client : ce module est serveur uniquement.
 */

function optional(key: string, fallback = ''): string {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function required(key: string, fallback?: string): string {
  const value = optional(key, fallback ?? '');
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${key}. Copiez .env.example vers .env et renseignez cette valeur.`,
    );
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,
  isDevelopment: !isProduction,

  databaseUrl: (() => {
    const url = optional('DATABASE_URL');
    if (!url && isProduction) {
      // En production, une base manquante doit échouer immédiatement et clairement
      // plutôt que de laisser l'application tenter une connexion locale inexistante.
      throw new Error(
        "DATABASE_URL est obligatoire en production. Renseignez la chaîne de connexion de votre PostgreSQL managé " +
          '(Neon, Supabase, Vercel Postgres, Railway…), puis relancez le déploiement.',
      );
    }
    return url;
  })(),

  authSecret: (() => {
    const secret = optional('AUTH_SECRET');
    if (!secret && isProduction) {
      throw new Error("AUTH_SECRET est obligatoire en production (32 caractères minimum).");
    }
    return secret || 'mon-devis-developpement-secret-non-configure';
  })(),

  appName: optional('APP_NAME', 'MON DEVIS'),
  appUrl: optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000').replace(/\/$/, ''),

  ipHashSalt: optional('IP_HASH_SALT', 'mon-devis-dev-salt'),

  rateLimit: {
    windowSeconds: Number(optional('RATE_LIMIT_WINDOW_SECONDS', '60')),
    maxRequests: Number(optional('RATE_LIMIT_MAX_REQUESTS', '120')),
  },

  storage: {
    driver: (optional('STORAGE_DRIVER', 'local') as 'local' | 's3'),
    localDir: optional('STORAGE_LOCAL_DIR', './var/uploads'),
    s3: {
      endpoint: optional('S3_ENDPOINT'),
      region: optional('S3_REGION'),
      bucket: optional('S3_BUCKET'),
      accessKeyId: optional('S3_ACCESS_KEY_ID'),
      secretAccessKey: optional('S3_SECRET_ACCESS_KEY'),
      publicBaseUrl: optional('S3_PUBLIC_BASE_URL'),
      get configured() {
        return Boolean(this.bucket && this.accessKeyId && this.secretAccessKey);
      },
    },
  },

  email: {
    driver: optional('EMAIL_DRIVER', 'console') as 'console' | 'smtp' | 'resend' | 'postmark',
    from: optional('EMAIL_FROM', 'MON DEVIS <no-reply@mon-devis.app>'),
    smtp: {
      host: optional('SMTP_HOST'),
      port: Number(optional('SMTP_PORT', '587')),
      user: optional('SMTP_USER'),
      password: optional('SMTP_PASSWORD'),
      get configured() {
        return Boolean(this.host && this.user && this.password);
      },
    },
    resendApiKey: optional('RESEND_API_KEY'),
    postmarkToken: optional('POSTMARK_SERVER_TOKEN'),
    /** Un vrai envoi d'e-mail est-il possible avec la configuration actuelle ? */
    get canDeliver() {
      if (this.driver === 'console') return false;
      if (this.driver === 'smtp') return this.smtp.configured;
      if (this.driver === 'resend') return Boolean(this.resendApiKey);
      if (this.driver === 'postmark') return Boolean(this.postmarkToken);
      return false;
    },
  },

  payments: {
    provider: optional('PAYMENT_PROVIDER', 'none') as 'none' | 'stripe' | 'cinetpay' | 'paystack',
    stripe: {
      secretKey: optional('STRIPE_SECRET_KEY'),
      webhookSecret: optional('STRIPE_WEBHOOK_SECRET'),
      prices: {
        proMonthly: optional('STRIPE_PRICE_PRO_MONTHLY'),
        proYearly: optional('STRIPE_PRICE_PRO_YEARLY'),
        businessMonthly: optional('STRIPE_PRICE_BUSINESS_MONTHLY'),
        businessYearly: optional('STRIPE_PRICE_BUSINESS_YEARLY'),
      },
      get configured() {
        return Boolean(this.secretKey);
      },
    },
    cinetpay: {
      apiKey: optional('CINETPAY_API_KEY'),
      siteId: optional('CINETPAY_SITE_ID'),
      get configured() {
        return Boolean(this.apiKey && this.siteId);
      },
    },
    paystack: {
      secretKey: optional('PAYSTACK_SECRET_KEY'),
      get configured() {
        return Boolean(this.secretKey);
      },
    },
    mobileMoney: {
      orangeMoney: {
        clientId: optional('ORANGE_MONEY_CLIENT_ID'),
        clientSecret: optional('ORANGE_MONEY_CLIENT_SECRET'),
        merchantKey: optional('ORANGE_MONEY_MERCHANT_KEY'),
        get configured() {
          return Boolean(this.clientId && this.clientSecret && this.merchantKey);
        },
      },
      wave: {
        apiKey: optional('WAVE_API_KEY'),
        get configured() {
          return Boolean(this.apiKey);
        },
      },
      mtnMomo: {
        subscriptionKey: optional('MTN_MOMO_SUBSCRIPTION_KEY'),
        apiUser: optional('MTN_MOMO_API_USER'),
        apiKey: optional('MTN_MOMO_API_KEY'),
        get configured() {
          return Boolean(this.subscriptionKey && this.apiUser && this.apiKey);
        },
      },
    },
    /** Un paiement en ligne réel peut-il être initié ? */
    get canCharge() {
      if (this.provider === 'stripe') return this.stripe.configured;
      if (this.provider === 'cinetpay') return this.cinetpay.configured;
      if (this.provider === 'paystack') return this.paystack.configured;
      return false;
    },
  },
} as const;

export function assertServerOnly(): void {
  if (typeof window !== 'undefined') {
    throw new Error('Ce module ne peut être importé que côté serveur.');
  }
}

export { required };
