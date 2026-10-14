import { env } from '@/lib/env';
import { formatCurrency, formatDate } from '@/lib/format';

/** Gabarits d'e-mails transactionnels (HTML + texte), en français. */

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

const BRAND = {
  primary: '#2563EB',
  navy: '#0F172A',
  slate: '#64748B',
  border: '#E2E8F0',
  background: '#F8FAFC',
};

function layout(title: string, content: string, footerNote?: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1E293B;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.background};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid ${BRAND.border};">
          <span style="font-size:18px;font-weight:700;color:${BRAND.navy};letter-spacing:-0.02em;">MON DEVIS</span>
          <span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:600;color:${BRAND.primary};background:#EFF6FF;border-radius:999px;padding:3px 10px;">Devis professionnels</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${BRAND.navy};">${escapeHtml(title)}</h1>
          ${content}
        </td></tr>
        <tr><td style="padding:20px 28px;border-top:1px solid ${BRAND.border};background:${BRAND.background};">
          <p style="margin:0;font-size:12px;color:${BRAND.slate};line-height:1.6;">
            ${footerNote ? `${escapeHtml(footerNote)}<br />` : ''}
            Cet e-mail vous a été envoyé par MON DEVIS. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:${BRAND.slate};">MON DEVIS — ${escapeHtml(env.appUrl)}</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:10px;background:${BRAND.primary};">
    <a href="${url}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#334155;">${text}</p>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function verificationEmail(params: { name: string; url: string; expiresInHours: number }): EmailTemplate {
  const title = 'Confirmez votre adresse e-mail';
  const content = [
    paragraph(`Bonjour ${escapeHtml(params.name)},`),
    paragraph(
      `Merci d'avoir créé votre compte MON DEVIS. Confirmez votre adresse e-mail pour activer toutes les fonctionnalités de votre espace.`,
    ),
    button('Confirmer mon adresse e-mail', params.url),
    paragraph(
      `<span style="color:${BRAND.slate};font-size:13px;">Ce lien expire dans ${params.expiresInHours} heures.</span>`,
    ),
  ].join('');
  return {
    subject: 'Confirmez votre adresse e-mail — MON DEVIS',
    html: layout(title, content),
    text: `Bonjour ${params.name},\n\nConfirmez votre adresse e-mail en ouvrant ce lien : ${params.url}\n\nCe lien expire dans ${params.expiresInHours} heures.\n\n— MON DEVIS`,
  };
}

export function passwordResetEmail(params: { name: string; url: string; expiresInMinutes: number }): EmailTemplate {
  const title = 'Réinitialisation de votre mot de passe';
  const content = [
    paragraph(`Bonjour ${escapeHtml(params.name)},`),
    paragraph('Vous avez demandé la réinitialisation de votre mot de passe MON DEVIS.'),
    button('Choisir un nouveau mot de passe', params.url),
    paragraph(
      `<span style="color:${BRAND.slate};font-size:13px;">Ce lien expire dans ${params.expiresInMinutes} minutes et ne peut être utilisé qu'une seule fois. Si vous n'avez pas fait cette demande, votre mot de passe reste inchangé.</span>`,
    ),
  ].join('');
  return {
    subject: 'Réinitialisation de votre mot de passe — MON DEVIS',
    html: layout(title, content),
    text: `Bonjour ${params.name},\n\nRéinitialisez votre mot de passe : ${params.url}\n\nCe lien expire dans ${params.expiresInMinutes} minutes.\n\n— MON DEVIS`,
  };
}

export function newLoginEmail(params: { name: string; ip: string | null; userAgent: string | null; date: Date }): EmailTemplate {
  const title = 'Nouvelle connexion à votre compte';
  const content = [
    paragraph(`Bonjour ${escapeHtml(params.name)},`),
    paragraph('Une connexion à votre compte MON DEVIS vient d’être enregistrée.'),
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:13px;color:#334155;">
      <tr><td style="padding:4px 12px 4px 0;color:${BRAND.slate};">Date</td><td>${escapeHtml(formatDate(params.date, 'fr-FR'))}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:${BRAND.slate};">Appareil</td><td>${escapeHtml(params.userAgent ?? 'Inconnu')}</td></tr>
    </table>`,
    paragraph(
      `<span style="color:${BRAND.slate};font-size:13px;">Si vous n'êtes pas à l'origine de cette connexion, changez immédiatement votre mot de passe depuis les paramètres de sécurité.</span>`,
    ),
  ].join('');
  return {
    subject: 'Nouvelle connexion à votre compte — MON DEVIS',
    html: layout(title, content),
    text: `Bonjour ${params.name},\n\nUne nouvelle connexion a été enregistrée le ${formatDate(params.date)}.\n\nSi vous n'êtes pas à l'origine de cette connexion, changez votre mot de passe.\n\n— MON DEVIS`,
  };
}

export function quotationShareEmail(params: {
  customerName: string;
  companyName: string;
  quotationNumber: string;
  quotationTitle: string;
  total: string;
  currency: string;
  validUntil: Date | null;
  url: string;
  message?: string | null;
  senderName: string;
  senderEmail: string;
}): EmailTemplate {
  const title = `Devis ${params.quotationNumber}`;
  const content = [
    paragraph(`Bonjour ${escapeHtml(params.customerName)},`),
    paragraph(
      `<strong>${escapeHtml(params.companyName)}</strong> vous adresse le devis <strong>${escapeHtml(params.quotationTitle)}</strong> (référence ${escapeHtml(params.quotationNumber)}).`,
    ),
    params.message ? paragraph(escapeHtml(params.message).replace(/\n/g, '<br />')) : '',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid ${BRAND.border};border-radius:12px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND.slate};">Montant total</p>
        <p style="margin:0;font-size:22px;font-weight:700;color:${BRAND.navy};">${escapeHtml(params.total)}</p>
        ${params.validUntil ? `<p style="margin:8px 0 0;font-size:13px;color:${BRAND.slate};">Valable jusqu'au ${escapeHtml(formatDate(params.validUntil, 'fr-FR'))}</p>` : ''}
      </td></tr>
    </table>`,
    button('Consulter et répondre au devis', params.url),
    paragraph(
      `<span style="color:${BRAND.slate};font-size:13px;">Vous pouvez accepter ou refuser ce devis directement en ligne. Le lien est personnel et sécurisé.</span>`,
    ),
  ].join('');
  return {
    subject: `${params.companyName} — Devis ${params.quotationNumber} (${params.total})`,
    html: layout(title, content, `Message envoyé par ${params.senderName} (${params.senderEmail}).`),
    text: `Bonjour ${params.customerName},\n\n${params.companyName} vous adresse le devis ${params.quotationNumber} — ${params.quotationTitle}.\nMontant : ${params.total}\n${params.validUntil ? `Valable jusqu'au ${formatDate(params.validUntil)}.\n` : ''}\nConsulter le devis : ${params.url}\n\n— ${params.companyName}`,
  };
}

export function invoiceSentEmail(params: {
  customerName: string;
  companyName: string;
  invoiceNumber: string;
  total: string;
  currency: string;
  dueDate: Date | null;
  senderName: string;
  senderEmail: string;
  message?: string | null;
}): EmailTemplate {
  const title = `Facture ${params.invoiceNumber}`;
  const content = [
    paragraph(`Bonjour ${escapeHtml(params.customerName)},`),
    paragraph(
      `<strong>${escapeHtml(params.companyName)}</strong> vous adresse la facture <strong>${escapeHtml(params.invoiceNumber)}</strong> pour un montant de <strong>${escapeHtml(params.total)}</strong>.`,
    ),
    params.message ? paragraph(escapeHtml(params.message).replace(/\n/g, '<br />')) : '',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid ${BRAND.border};border-radius:12px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND.slate};">Montant total</p>
        <p style="margin:0;font-size:22px;font-weight:700;color:${BRAND.navy};">${escapeHtml(params.total)}</p>
        ${params.dueDate ? `<p style="margin:8px 0 0;font-size:13px;color:${BRAND.slate};">Échéance : ${escapeHtml(formatDate(params.dueDate, 'fr-FR'))}</p>` : ''}
      </td></tr>
    </table>`,
    paragraph(
      `<span style="color:${BRAND.slate};font-size:13px;">La facture est jointe en PDF. Les coordonnées de règlement figurent dans le document.</span>`,
    ),
  ].join('');
  return {
    subject: `${params.companyName} — Facture ${params.invoiceNumber} (${params.total})`,
    html: layout(title, content, `Facture émise par ${params.senderName} (${params.senderEmail}).`),
    text: `Bonjour ${params.customerName},\n\n${params.companyName} vous adresse la facture ${params.invoiceNumber}.\nMontant : ${params.total}\n${params.dueDate ? `Échéance : ${formatDate(params.dueDate)}.\n` : ''}\nLa facture est jointe en PDF.\n\n— ${params.companyName}`,
  };
}

export function quotationDecisionEmail(params: {
  recipientName: string;
  quotationNumber: string;
  customerName: string;
  decision: 'accepted' | 'rejected';
  total: string;
  currency: string;
  feedback?: string | null;
  url: string;
}): EmailTemplate {
  const accepted = params.decision === 'accepted';
  const title = accepted ? `Devis ${params.quotationNumber} accepté 🎉` : `Devis ${params.quotationNumber} refusé`;
  const content = [
    paragraph(`Bonjour ${escapeHtml(params.recipientName)},`),
    paragraph(
      accepted
        ? `Bonne nouvelle : <strong>${escapeHtml(params.customerName)}</strong> a accepté votre devis <strong>${escapeHtml(params.quotationNumber)}</strong> pour un montant de <strong>${escapeHtml(params.total)}</strong>.`
        : `<strong>${escapeHtml(params.customerName)}</strong> a refusé votre devis <strong>${escapeHtml(params.quotationNumber)}</strong> (${escapeHtml(params.total)}).`,
    ),
    params.feedback ? paragraph(`<em>Commentaire du client : « ${escapeHtml(params.feedback)} »</em>`) : '',
    button('Ouvrir le devis', params.url),
  ].join('');
  return {
    subject: title,
    html: layout(title, content),
    text: `${title}\n\n${accepted ? 'Votre devis a été accepté.' : 'Votre devis a été refusé.'}\nMontant : ${params.total}\n${params.feedback ? `Commentaire : ${params.feedback}\n` : ''}\nOuvrir : ${params.url}\n\n— MON DEVIS`,
  };
}

export function quotationExpiringEmail(params: {
  recipientName: string;
  quotationNumber: string;
  customerName: string;
  validUntil: Date;
  daysLeft: number;
  total: string;
  currency: string;
  url: string;
}): EmailTemplate {
  const title = `Devis ${params.quotationNumber} : expiration dans ${params.daysLeft} jour${params.daysLeft > 1 ? 's' : ''}`;
  const content = [
    paragraph(`Bonjour ${escapeHtml(params.recipientName)},`),
    paragraph(
      `Le devis <strong>${escapeHtml(params.quotationNumber)}</strong> adressé à <strong>${escapeHtml(params.customerName)}</strong> (${escapeHtml(params.total)}) arrive à expiration le <strong>${escapeHtml(formatDate(params.validUntil, 'fr-FR'))}</strong>.`,
    ),
    button('Relancer le client', params.url),
  ].join('');
  return {
    subject: title,
    html: layout(title, content),
    text: `${title}\n\nLe devis ${params.quotationNumber} expire le ${formatDate(params.validUntil)}.\n${params.url}`,
  };
}

export function subscriptionEmail(params: {
  recipientName: string;
  planName: string;
  status: string;
  periodEnd: Date;
  url: string;
}): EmailTemplate {
  const title = `Votre abonnement ${params.planName}`;
  const content = [
    paragraph(`Bonjour ${escapeHtml(params.recipientName)},`),
    paragraph(
      `Votre abonnement <strong>${escapeHtml(params.planName)}</strong> est désormais <strong>${escapeHtml(params.status)}</strong>. Prochaine échéance : ${escapeHtml(formatDate(params.periodEnd, 'fr-FR'))}.`,
    ),
    button('Gérer mon abonnement', params.url),
  ].join('');
  return {
    subject: title,
    html: layout(title, content),
    text: `${title}\n\nStatut : ${params.status}\nProchaine échéance : ${formatDate(params.periodEnd)}\n${params.url}`,
  };
}

export { formatCurrency };
