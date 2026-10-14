import { z } from 'zod';
import { CURRENCIES } from '@/lib/currency';
import { validatePasswordPolicy } from '@/lib/auth/password-policy';
import { validateNumberingFormat } from '@/lib/numbering';

/**
 * Schémas de validation partagés (serveur et client) : les mêmes règles
 * s'appliquent dans les formulaires et dans les actions serveur.
 */

const emailSchema = z
  .string()
  .trim()
  .min(1, "L'adresse e-mail est obligatoire.")
  .email('Adresse e-mail invalide.')
  .max(200, 'Adresse e-mail trop longue.');

const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(200, 'Le mot de passe est trop long.')
  .superRefine((value, context) => {
    const result = validatePasswordPolicy(value);
    if (!result.valid && result.message) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
    }
  });

const optionalString = (max = 200) => z.string().trim().max(max).optional().nullable();
const optionalEmail = z.union([z.literal(''), emailSchema]).optional().nullable();

/* -------------------------------------------------------------------------- */
/* Authentification                                                           */
/* -------------------------------------------------------------------------- */

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Indiquez votre nom (2 caractères minimum).').max(120),
  email: emailSchema,
  password: passwordSchema,
  companyName: optionalString(160),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Vous devez accepter les conditions générales.' }),
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Le mot de passe est obligatoire.'),
  remember: z.boolean().optional().default(false),
  redirectTo: optionalString(200),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, 'Lien de réinitialisation invalide.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Saisissez votre mot de passe actuel.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Indiquez votre nom complet.').max(120),
  phone: optionalString(40),
  locale: z.enum(['fr', 'en']).optional(),
  theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
});

/* -------------------------------------------------------------------------- */
/* Entreprise                                                                 */
/* -------------------------------------------------------------------------- */

export const companyProfileSchema = z.object({
  name: z.string().trim().min(1, "Le nom de l'entreprise est obligatoire.").max(160),
  logoUrl: z.string().max(600).optional().nullable(),
  logoMimeType: optionalString(60),
  logoPosition: z.enum(['LEFT', 'CENTER', 'RIGHT']).optional(),
  addressLine1: optionalString(180),
  addressLine2: optionalString(180),
  postalCode: optionalString(24),
  city: optionalString(80),
  country: z.string().trim().min(1, 'Le pays est obligatoire.').max(80),
  countryCode: z.string().trim().length(2, 'Code pays invalide (2 lettres).').toUpperCase().or(z.literal('OTHER')),
  phone: optionalString(40),
  email: optionalEmail,
  website: optionalString(160),
  registrationNumber: optionalString(60),
  taxId: optionalString(60),
  legalInfo: optionalString(500),
  bankDetails: optionalString(600),
  paymentInfo: optionalString(600),
  signatureLabel: optionalString(120),
});

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "Le nom de l'organisation est obligatoire.").max(160),
});

/* -------------------------------------------------------------------------- */
/* Clients                                                                    */
/* -------------------------------------------------------------------------- */

export const customerSchema = z.object({
  type: z.enum(['INDIVIDUAL', 'COMPANY']).default('COMPANY'),
  name: z.string().trim().min(1, 'Le nom du contact est obligatoire.').max(160),
  companyName: optionalString(160),
  email: optionalEmail,
  phone: optionalString(40),
  addressLine1: optionalString(180),
  addressLine2: optionalString(180),
  postalCode: optionalString(24),
  city: optionalString(80),
  country: z.string().trim().max(80, 'Nom de pays trop long.').default("Côte d'Ivoire"),
  countryCode: z.string().trim().max(8, 'Code pays invalide.').default('CI'),
  taxId: optionalString(60),
  notes: optionalString(1000),
});

/* -------------------------------------------------------------------------- */
/* Produits & services                                                        */
/* -------------------------------------------------------------------------- */

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du produit ou service est obligatoire.').max(200),
  code: optionalString(60),
  description: optionalString(800),
  category: optionalString(80),
  unit: z.string().trim().min(1, 'Indiquez une unité.').max(40, 'Unité trop longue.').default('unité'),
  unitPrice: z.coerce.number().min(0, 'Le prix ne peut pas être négatif.').max(1_000_000_000),
  taxRate: z.coerce.number().min(0, 'Le taux ne peut pas être négatif.').max(100, 'Le taux ne peut pas dépasser 100 %.'),
  currency: z.string().trim().length(3).toUpperCase().default('XOF'),
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
});

/* -------------------------------------------------------------------------- */
/* Devis                                                                      */
/* -------------------------------------------------------------------------- */

export const quotationItemSchema = z.object({
  id: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  name: z.string().trim().min(1, 'Le libellé de la ligne est obligatoire.').max(300),
  description: optionalString(800),
  unit: optionalString(40),
  quantity: z.coerce.number().gt(0, 'La quantité doit être supérieure à zéro.').max(1_000_000),
  unitPrice: z.coerce.number().min(0, 'Le prix unitaire ne peut pas être négatif.').max(1_000_000_000),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).nullish(),
  discountValue: z.coerce.number().min(0).max(1_000_000_000).optional().default(0),
  taxRate: z.coerce.number().min(0).max(100).default(18),
});

const termsSchema = z
  .object({
    validityPeriod: optionalString(600),
    paymentTerms: optionalString(600),
    deliveryTime: optionalString(400),
    warranty: optionalString(600),
    specialConditions: optionalString(1000),
    paymentInstructions: optionalString(600),
    notes: optionalString(1000),
    legalMentions: optionalString(1000),
    blocks: z
      .array(z.object({ id: z.string(), label: z.string().max(120), content: z.string().max(1200) }))
      .max(10)
      .optional(),
  })
  .optional()
  .nullable();

export const quotationSchema = z.object({
  title: z.string().trim().min(1, "L'intitulé du devis est obligatoire.").max(200),
  customerId: z.string().optional().nullable(),
  reference: optionalString(80),
  customerReference: optionalString(80),
  status: z.enum(['DRAFT', 'SENT', 'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED']).default('DRAFT'),
  currency: z.string().trim().length(3, 'Devise invalide.').toUpperCase(),
  issueDate: z.coerce.date(),
  validUntil: z.coerce.date().nullish(),
  templateKey: z.string().trim().min(1).max(40),
  pricesIncludeTax: z.boolean().default(false),
  globalDiscountType: z.enum(['PERCENTAGE', 'FIXED']).nullish(),
  globalDiscountValue: z.coerce.number().min(0).max(1_000_000_000).optional().default(0),
  depositAmount: z.coerce.number().min(0).max(1_000_000_000).optional().default(0),
  notes: optionalString(2000),
  internalNotes: optionalString(2000),
  terms: termsSchema,
  items: z.array(quotationItemSchema).min(1, 'Ajoutez au moins une ligne au devis.').max(200, 'Un devis ne peut pas dépasser 200 lignes.'),
  customization: z
    .object({
      colors: z
        .object({
          primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide.').optional(),
          secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide.').optional(),
          accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide.').optional(),
        })
        .optional(),
      typography: z.object({ headingFont: z.string().max(40).optional(), bodyFont: z.string().max(40).optional() }).optional(),
      visibility: z.record(z.boolean()).optional(),
      layout: z.record(z.union([z.boolean(), z.string()])).optional(),
    })
    .nullish(),
});

/* -------------------------------------------------------------------------- */
/* Réglages                                                                   */
/* -------------------------------------------------------------------------- */

export const organizationSettingsSchema = z
  .object({
    defaultCurrency: z
      .string()
      .trim()
      .length(3)
      .toUpperCase()
      .refine((code) => CURRENCIES.some((currency) => currency.code === code), 'Devise non prise en charge.'),
    defaultTaxRate: z.coerce.number().min(0).max(100),
    defaultValidityDays: z.coerce.number().int().min(1, 'La validité doit être d’au moins 1 jour.').max(365),
    defaultTemplateKey: z.string().trim().min(1).max(40),
    numberingFormat: z.string().trim().min(1).max(40),
    numberingResetYearly: z.boolean().default(true),
    pricesIncludeTax: z.boolean().default(false),
    defaultPaymentTerms: optionalString(1000),
    defaultTerms: optionalString(2000),
    defaultNotes: optionalString(2000),
    brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide.').default('#2563EB'),
    brandColorSecondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide.').default('#0F172A'),
    logoPosition: z.enum(['LEFT', 'CENTER', 'RIGHT']).default('LEFT'),
    emailReminders: z.boolean().default(true),
  })
  .superRefine((data, context) => {
    const result = validateNumberingFormat(data.numberingFormat);
    if (!result.valid) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: result.error ?? 'Format de numérotation invalide.', path: ['numberingFormat'] });
    }
  });

export const supportTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Indiquez un objet.').max(160),
  message: z.string().trim().min(10, 'Décrivez votre demande (10 caractères minimum).').max(4000),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type QuotationInputSchema = z.infer<typeof quotationSchema>;
export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;
export type OrganizationSettingsInput = z.infer<typeof organizationSettingsSchema>;
