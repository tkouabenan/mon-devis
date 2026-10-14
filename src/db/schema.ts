/**
 * MON DEVIS — schéma de base de données (PostgreSQL / Drizzle ORM).
 *
 * Principes :
 *  - isolation multi-tenant : toute donnée métier est rattachée à une organisation ;
 *  - contexte historique : les lignes de devis conservent un instantané des noms,
 *    descriptions, prix et taux (modifier le catalogue n'altère pas un devis existant) ;
 *  - montants en `numeric` (jamais en flottant) pour une arithmétique financière exacte ;
 *  - clés primaires UUID v7 (ordonnées dans le temps, non énumérables).
 */

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { newId } from '@/lib/id';

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => newId());

const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const orgRoleEnum = pgEnum('org_role', ['OWNER', 'ADMIN', 'MEMBER']);
export const quotationStatusEnum = pgEnum('quotation_status', [
  'DRAFT',
  'SENT',
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);
export const decisionSourceEnum = pgEnum('decision_source', ['MANUAL', 'CUSTOMER_LINK', 'SYSTEM']);
export const discountTypeEnum = pgEnum('discount_type', ['PERCENTAGE', 'FIXED']);
export const customerTypeEnum = pgEnum('customer_type', ['INDIVIDUAL', 'COMPANY']);
export const productStatusEnum = pgEnum('product_status', ['ACTIVE', 'ARCHIVED']);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'TRIALING',
  'ACTIVE',
  'PENDING_PAYMENT',
  'PAST_DUE',
  'CANCELED',
  'EXPIRED',
]);
export const billingIntervalEnum = pgEnum('billing_interval', ['MONTHLY', 'YEARLY']);
export const paymentStatusEnum = pgEnum('payment_status', ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED']);
export const paymentProviderEnum = pgEnum('payment_provider', [
  'MANUAL',
  'STRIPE',
  'ORANGE_MONEY',
  'WAVE',
  'MTN_MOMO',
  'CINETPAY',
  'PAYSTACK',
]);
export const notificationTypeEnum = pgEnum('notification_type', [
  'QUOTATION_CREATED',
  'QUOTATION_SENT',
  'QUOTATION_VIEWED',
  'QUOTATION_ACCEPTED',
  'QUOTATION_REJECTED',
  'QUOTATION_EXPIRING',
  'QUOTATION_EXPIRED',
  'EXPORT_READY',
  'SUBSCRIPTION_UPDATE',
  'ACCOUNT_EVENT',
  'TEAM_INVITE',
  'SUPPORT_REPLY',
]);
export const approvalActionEnum = pgEnum('approval_action', ['VIEWED', 'APPROVED', 'REJECTED', 'COMMENTED']);
export const emailStatusEnum = pgEnum('email_status', ['QUEUED', 'SENT', 'FAILED', 'SKIPPED']);
export const ticketStatusEnum = pgEnum('ticket_status', ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
export const ticketPriorityEnum = pgEnum('ticket_priority', ['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const themePreferenceEnum = pgEnum('theme_preference', ['LIGHT', 'DARK', 'SYSTEM']);

// ---------------------------------------------------------------------------
// Utilisateurs, organisations, accès
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    avatarUrl: text('avatar_url'),
    locale: text('locale').notNull().default('fr-FR'),
    theme: themePreferenceEnum('theme').notNull().default('SYSTEM'),
    timezone: text('timezone').notNull().default('Africa/Abidjan'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    isSuspended: boolean('is_suspended').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email), index('users_created_at_idx').on(table.createdAt)],
);

export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('organizations_slug_unique').on(table.slug), index('organizations_owner_idx').on(table.ownerId)],
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgRoleEnum('role').notNull().default('MEMBER'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('organization_members_unique').on(table.organizationId, table.userId),
    index('organization_members_user_idx').on(table.userId),
  ],
);

export const organizationInvites = pgTable(
  'organization_invites',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: orgRoleEnum('role').notNull().default('MEMBER'),
    tokenHash: text('token_hash').notNull(),
    invitedById: text('invited_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('organization_invites_token_unique').on(table.tokenHash),
    index('organization_invites_org_email_idx').on(table.organizationId, table.email),
  ],
);

export const organizationSettings = pgTable(
  'organization_settings',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    defaultCurrency: text('default_currency').notNull().default('XOF'),
    locale: text('locale').notNull().default('fr-FR'),
    defaultTaxRate: numeric('default_tax_rate', { precision: 7, scale: 4 }).notNull().default('18'),
    defaultValidityDays: integer('default_validity_days').notNull().default(30),
    defaultTemplateKey: text('default_template_key').notNull().default('minimaliste'),
    numberingFormat: text('numbering_format').notNull().default('DEV-{YYYY}-{SEQ:4}'),
    numberingNextValue: integer('numbering_next_value').notNull().default(1),
    numberingResetYearly: boolean('numbering_reset_yearly').notNull().default(true),
    numberingYear: integer('numbering_year'),
    pricesIncludeTax: boolean('prices_include_tax').notNull().default(false),
    defaultPaymentTerms: text('default_payment_terms'),
    defaultTerms: text('default_terms'),
    defaultNotes: text('default_notes'),
    brandColor: text('brand_color').notNull().default('#2563EB'),
    brandColorSecondary: text('brand_color_secondary').notNull().default('#0F172A'),
    logoPosition: text('logo_position').notNull().default('LEFT'),
    emailReminders: boolean('email_reminders').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('organization_settings_org_unique').on(table.organizationId)],
);

export const companyProfiles = pgTable(
  'company_profiles',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    logoUrl: text('logo_url'),
    logoMimeType: text('logo_mime_type'),
    logoWidthPx: integer('logo_width_px'),
    logoPosition: text('logo_position').notNull().default('LEFT'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    postalCode: text('postal_code'),
    city: text('city'),
    country: text('country').notNull().default("Côte d'Ivoire"),
    countryCode: text('country_code').notNull().default('CI'),
    phone: text('phone'),
    email: text('email'),
    website: text('website'),
    registrationNumber: text('registration_number'),
    taxId: text('tax_id'),
    legalInfo: text('legal_info'),
    bankDetails: text('bank_details'),
    paymentInfo: text('payment_info'),
    signatureLabel: text('signature_label'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('company_profiles_org_idx').on(table.organizationId, table.isDefault)],
);

// ---------------------------------------------------------------------------
// CRM clients
// ---------------------------------------------------------------------------

export const customers = pgTable(
  'customers',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: customerTypeEnum('type').notNull().default('COMPANY'),
    name: text('name').notNull(),
    companyName: text('company_name'),
    email: text('email'),
    phone: text('phone'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    postalCode: text('postal_code'),
    city: text('city'),
    country: text('country').notNull().default("Côte d'Ivoire"),
    countryCode: text('country_code').notNull().default('CI'),
    taxId: text('tax_id'),
    notes: text('notes'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('customers_org_archived_idx').on(table.organizationId, table.isArchived),
    index('customers_org_name_idx').on(table.organizationId, table.name),
    index('customers_org_email_idx').on(table.organizationId, table.email),
  ],
);

// ---------------------------------------------------------------------------
// Catalogue produits & services
// ---------------------------------------------------------------------------

export const products = pgTable(
  'products',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    description: text('description'),
    category: text('category'),
    unit: text('unit').notNull().default('unité'),
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),
    taxRate: numeric('tax_rate', { precision: 7, scale: 4 }).notNull().default('18'),
    currency: text('currency').notNull().default('XOF'),
    status: productStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('products_org_code_unique').on(table.organizationId, table.code),
    index('products_org_status_idx').on(table.organizationId, table.status),
    index('products_org_category_idx').on(table.organizationId, table.category),
    index('products_org_name_idx').on(table.organizationId, table.name),
  ],
);

// ---------------------------------------------------------------------------
// Modèles de documents
// ---------------------------------------------------------------------------

export const quotationTemplates = pgTable(
  'quotation_templates',
  {
    id: id(),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    style: jsonb('style').notNull().default(sql`'{}'::jsonb`),
    isPlatform: boolean('is_platform').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('quotation_templates_org_key_unique').on(table.organizationId, table.key),
    index('quotation_templates_platform_idx').on(table.isPlatform, table.isActive),
  ],
);

// ---------------------------------------------------------------------------
// Devis
// ---------------------------------------------------------------------------

export const quotations = pgTable(
  'quotations',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    customerId: text('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    number: text('number').notNull(),
    title: text('title').notNull().default('Devis'),
    status: quotationStatusEnum('status').notNull().default('DRAFT'),
    reference: text('reference'),
    customerReference: text('customer_reference'),
    currency: text('currency').notNull().default('XOF'),
    locale: text('locale').notNull().default('fr-FR'),
    issueDate: timestamp('issue_date', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true, mode: 'date' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    decisionSource: decisionSourceEnum('decision_source'),
    viewedAt: timestamp('viewed_at', { withTimezone: true, mode: 'date' }),
    templateId: text('template_id'),
    templateKey: text('template_key').notNull().default('minimaliste'),
    customization: jsonb('customization'),
    pricesIncludeTax: boolean('prices_include_tax').notNull().default(false),

    subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull().default('0'),
    lineDiscountTotal: numeric('line_discount_total', { precision: 18, scale: 2 }).notNull().default('0'),
    globalDiscountType: discountTypeEnum('global_discount_type'),
    globalDiscountValue: numeric('global_discount_value', { precision: 9, scale: 4 }).notNull().default('0'),
    globalDiscountTotal: numeric('global_discount_total', { precision: 18, scale: 2 }).notNull().default('0'),
    netBeforeTax: numeric('net_before_tax', { precision: 18, scale: 2 }).notNull().default('0'),
    taxTotal: numeric('tax_total', { precision: 18, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 18, scale: 2 }).notNull().default('0'),
    amountDue: numeric('amount_due', { precision: 18, scale: 2 }).notNull().default('0'),
    depositAmount: numeric('deposit_amount', { precision: 18, scale: 2 }).notNull().default('0'),

    companySnapshot: jsonb('company_snapshot'),
    customerSnapshot: jsonb('customer_snapshot'),
    terms: jsonb('terms'),
    notes: text('notes'),
    internalNotes: text('internal_notes'),

    isArchived: boolean('is_archived').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('quotations_org_number_unique').on(table.organizationId, table.number),
    index('quotations_org_status_idx').on(table.organizationId, table.status),
    index('quotations_org_issue_date_idx').on(table.organizationId, table.issueDate),
    index('quotations_org_created_idx').on(table.organizationId, table.createdAt),
    index('quotations_org_archived_idx').on(table.organizationId, table.isArchived),
    index('quotations_customer_idx').on(table.customerId),
    index('quotations_validity_idx').on(table.validUntil, table.status),
  ],
);

export const quotationItems = pgTable(
  'quotation_items',
  {
    id: id(),
    quotationId: text('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
    position: integer('position').notNull().default(0),
    name: text('name').notNull(),
    description: text('description'),
    unit: text('unit').notNull().default('unité'),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),
    discountType: discountTypeEnum('discount_type'),
    discountValue: numeric('discount_value', { precision: 9, scale: 4 }).notNull().default('0'),
    taxRate: numeric('tax_rate', { precision: 7, scale: 4 }).notNull().default('18'),
    lineGross: numeric('line_gross', { precision: 18, scale: 2 }).notNull().default('0'),
    lineDiscount: numeric('line_discount', { precision: 18, scale: 2 }).notNull().default('0'),
    lineNet: numeric('line_net', { precision: 18, scale: 2 }).notNull().default('0'),
    lineTax: numeric('line_tax', { precision: 18, scale: 2 }).notNull().default('0'),
    lineTotal: numeric('line_total', { precision: 18, scale: 2 }).notNull().default('0'),
  },
  (table) => [index('quotation_items_quotation_idx').on(table.quotationId, table.position)],
);

export const quotationStatusHistory = pgTable(
  'quotation_status_history',
  {
    id: id(),
    quotationId: text('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    fromStatus: quotationStatusEnum('from_status'),
    toStatus: quotationStatusEnum('to_status').notNull(),
    source: decisionSourceEnum('source').notNull().default('MANUAL'),
    actorUserId: text('actor_user_id'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (table) => [index('quotation_status_history_quotation_idx').on(table.quotationId, table.createdAt)],
);

export const quotationShares = pgTable(
  'quotation_shares',
  {
    id: id(),
    quotationId: text('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    allowFeedback: boolean('allow_feedback').notNull().default(true),
    viewCount: integer('view_count').notNull().default(0),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('quotation_shares_token_unique').on(table.tokenHash),
    index('quotation_shares_quotation_idx').on(table.quotationId, table.revokedAt),
  ],
);

export const quotationApprovalEvents = pgTable(
  'quotation_approval_events',
  {
    id: id(),
    quotationId: text('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    shareId: text('share_id').references(() => quotationShares.id, { onDelete: 'set null' }),
    action: approvalActionEnum('action').notNull(),
    source: decisionSourceEnum('source').notNull().default('CUSTOMER_LINK'),
    actorUserId: text('actor_user_id'),
    actorName: text('actor_name'),
    actorEmail: text('actor_email'),
    feedback: text('feedback'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (table) => [index('quotation_approval_events_quotation_idx').on(table.quotationId, table.createdAt)],
);

// ---------------------------------------------------------------------------
// Abonnements & paiements
// ---------------------------------------------------------------------------

export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    tagline: text('tagline'),
    description: text('description'),
    currency: text('currency').notNull().default('EUR'),
    priceMonthly: numeric('price_monthly', { precision: 12, scale: 2 }).notNull().default('0'),
    priceYearly: numeric('price_yearly', { precision: 12, scale: 2 }).notNull().default('0'),
    yearlyDiscountPercent: numeric('yearly_discount_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    features: jsonb('features').notNull().default(sql`'[]'::jsonb`),
    limits: jsonb('limits').notNull().default(sql`'{}'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
    isPublic: boolean('is_public').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('subscription_plans_code_unique').on(table.code)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: text('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
    status: subscriptionStatusEnum('status').notNull().default('ACTIVE'),
    interval: billingIntervalEnum('interval').notNull().default('MONTHLY'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true, mode: 'date' }).notNull(),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'date' }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),
    provider: paymentProviderEnum('provider').notNull().default('MANUAL'),
    providerSubscriptionId: text('provider_subscription_id'),
    seats: integer('seats').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('subscriptions_org_status_idx').on(table.organizationId, table.status),
    index('subscriptions_plan_idx').on(table.planId),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subscriptionId: text('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
    provider: paymentProviderEnum('provider').notNull().default('MANUAL'),
    status: paymentStatusEnum('status').notNull().default('PENDING'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('EUR'),
    interval: billingIntervalEnum('interval').notNull().default('MONTHLY'),
    planCode: text('plan_code'),
    invoiceNumber: text('invoice_number').notNull(),
    providerReference: text('provider_reference'),
    providerPayload: jsonb('provider_payload'),
    failureReason: text('failure_reason'),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('payments_invoice_unique').on(table.invoiceNumber),
    index('payments_org_status_idx').on(table.organizationId, table.status),
    index('payments_created_idx').on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Notifications, e-mails, support
// ---------------------------------------------------------------------------

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quotationAccepted: boolean('quotation_accepted').notNull().default(true),
    quotationRejected: boolean('quotation_rejected').notNull().default(true),
    quotationViewed: boolean('quotation_viewed').notNull().default(true),
    quotationExpiring: boolean('quotation_expiring').notNull().default(true),
    quotationExpired: boolean('quotation_expired').notNull().default(true),
    exportReady: boolean('export_ready').notNull().default(true),
    subscriptionUpdates: boolean('subscription_updates').notNull().default(true),
    accountEvents: boolean('account_events').notNull().default(true),
    emailEnabled: boolean('email_enabled').notNull().default(true),
    reminderDaysBefore: integer('reminder_days_before').notNull().default(3),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('notification_preferences_user_unique').on(table.userId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (table) => [index('notifications_user_idx').on(table.userId, table.readAt, table.createdAt)],
);

export const emailMessages = pgTable(
  'email_messages',
  {
    id: id(),
    to: text('to').notNull(),
    subject: text('subject').notNull(),
    template: text('template').notNull(),
    status: emailStatusEnum('status').notNull().default('QUEUED'),
    provider: text('provider'),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    bodyPreview: text('body_preview'),
    metadata: jsonb('metadata'),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (table) => [index('email_messages_created_idx').on(table.createdAt), index('email_messages_status_idx').on(table.status)],
);

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    message: text('message').notNull(),
    status: ticketStatusEnum('status').notNull().default('OPEN'),
    priority: ticketPriorityEnum('priority').notNull().default('NORMAL'),
    adminReply: text('admin_reply'),
    repliedAt: timestamp('replied_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('support_tickets_status_idx').on(table.status, table.createdAt)],
);

// ---------------------------------------------------------------------------
// Sécurité, sessions, audit, paramètres
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('sessions_token_unique').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId, table.revokedAt),
    index('sessions_expiry_idx').on(table.expiresAt),
  ],
);

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('auth_tokens_hash_unique').on(table.tokenHash),
    index('auth_tokens_user_idx').on(table.userId, table.purpose),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    metadata: jsonb('metadata'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (table) => [
    index('audit_logs_org_idx').on(table.organizationId, table.createdAt),
    index('audit_logs_action_idx').on(table.action, table.createdAt),
    index('audit_logs_actor_idx').on(table.actorUserId, table.createdAt),
  ],
);

export const applicationSettings = pgTable('application_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedAt: updatedAt(),
  updatedById: text('updated_by_id'),
});

export const usageCounters = pgTable(
  'usage_counters',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    metric: text('metric').notNull(),
    period: text('period').notNull(),
    value: integer('value').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('usage_counters_unique').on(table.organizationId, table.metric, table.period),
    index('usage_counters_org_metric_idx').on(table.organizationId, table.metric),
  ],
);

// ---------------------------------------------------------------------------
// Relations (API de requêtes Drizzle)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many, one }) => ({
  memberships: many(organizationMembers),
  sessions: many(sessions),
  notificationPreference: one(notificationPreferences),
  notifications: many(notifications),
}));

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  owner: one(users, { fields: [organizations.ownerId], references: [users.id] }),
  members: many(organizationMembers),
  settings: one(organizationSettings),
  companyProfiles: many(companyProfiles),
  customers: many(customers),
  products: many(products),
  quotations: many(quotations),
  subscriptions: many(subscriptions),
  payments: many(payments),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, { fields: [organizationMembers.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));

export const organizationSettingsRelations = relations(organizationSettings, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationSettings.organizationId],
    references: [organizations.id],
  }),
}));

export const companyProfilesRelations = relations(companyProfiles, ({ one }) => ({
  organization: one(organizations, { fields: [companyProfiles.organizationId], references: [organizations.id] }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  organization: one(organizations, { fields: [customers.organizationId], references: [organizations.id] }),
  quotations: many(quotations),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  organization: one(organizations, { fields: [products.organizationId], references: [organizations.id] }),
  quotationItems: many(quotationItems),
}));

export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  organization: one(organizations, { fields: [quotations.organizationId], references: [organizations.id] }),
  customer: one(customers, { fields: [quotations.customerId], references: [customers.id] }),
  createdBy: one(users, { fields: [quotations.createdById], references: [users.id] }),
  items: many(quotationItems),
  statusHistory: many(quotationStatusHistory),
  shares: many(quotationShares),
  approvalEvents: many(quotationApprovalEvents),
}));

export const quotationItemsRelations = relations(quotationItems, ({ one }) => ({
  quotation: one(quotations, { fields: [quotationItems.quotationId], references: [quotations.id] }),
  product: one(products, { fields: [quotationItems.productId], references: [products.id] }),
}));

export const quotationSharesRelations = relations(quotationShares, ({ one, many }) => ({
  quotation: one(quotations, { fields: [quotationShares.quotationId], references: [quotations.id] }),
  createdBy: one(users, { fields: [quotationShares.createdById], references: [users.id] }),
  approvalEvents: many(quotationApprovalEvents),
}));

export const quotationApprovalEventsRelations = relations(quotationApprovalEvents, ({ one }) => ({
  quotation: one(quotations, { fields: [quotationApprovalEvents.quotationId], references: [quotations.id] }),
  share: one(quotationShares, { fields: [quotationApprovalEvents.shareId], references: [quotationShares.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  organization: one(organizations, { fields: [subscriptions.organizationId], references: [organizations.id] }),
  plan: one(subscriptionPlans, { fields: [subscriptions.planId], references: [subscriptionPlans.id] }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  organization: one(organizations, { fields: [payments.organizationId], references: [organizations.id] }),
  subscription: one(subscriptions, { fields: [payments.subscriptionId], references: [subscriptions.id] }),
}));

// ---------------------------------------------------------------------------
// Types inférés
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type OrganizationSettings = typeof organizationSettings.$inferSelect;
export type CompanyProfile = typeof companyProfiles.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Quotation = typeof quotations.$inferSelect;
export type NewQuotation = typeof quotations.$inferInsert;
export type QuotationItem = typeof quotationItems.$inferSelect;
export type NewQuotationItem = typeof quotationItems.$inferInsert;
export type QuotationShare = typeof quotationShares.$inferSelect;
export type QuotationStatusHistory = typeof quotationStatusHistory.$inferSelect;
export type QuotationApprovalEvent = typeof quotationApprovalEvents.$inferSelect;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type QuotationTemplate = typeof quotationTemplates.$inferSelect;

export type OrgRole = (typeof orgRoleEnum.enumValues)[number];
export type QuotationStatus = (typeof quotationStatusEnum.enumValues)[number];
export type DecisionSource = (typeof decisionSourceEnum.enumValues)[number];
export type DiscountKind = (typeof discountTypeEnum.enumValues)[number];
export type CustomerType = (typeof customerTypeEnum.enumValues)[number];
export type ProductStatus = (typeof productStatusEnum.enumValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];
export type BillingInterval = (typeof billingIntervalEnum.enumValues)[number];
export type PaymentProviderKind = (typeof paymentProviderEnum.enumValues)[number];
export type NotificationKind = (typeof notificationTypeEnum.enumValues)[number];
