import { db } from '@/db';
import { emailMessages } from '@/db/schema';
import { env } from '@/lib/env';

/**
 * Envoi d'e-mails transactionnels.
 *
 * Principe de vérité : aucune interface n'annonce « e-mail envoyé » tant que le
 * fournisseur n'a pas accepté la requête. En mode `console` (développement sans
 * configuration), le message est enregistré en base avec le statut SKIPPED et un
 * avertissement est retourné à l'appelant.
 */

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  template: string;
  html: string;
  text: string;
  metadata?: Record<string, unknown>;
  replyTo?: string;
  /** Pièces jointes (PDF du devis, par exemple). */
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  /** Le message a-t-il réellement été remis à un fournisseur ? */
  delivered: boolean;
  /** Statut enregistré en base. */
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  /** Message lisible par l'utilisateur (interface). */
  message: string;
  providerMessageId?: string;
}

async function deliverViaSmtp(input: SendEmailInput): Promise<SendEmailResult> {
  // Transport SMTP optionnel : chargé dynamiquement pour ne pas alourdir le bundle.
  const { createTransport } = await import('nodemailer');
  const transport = createTransport({
    host: env.email.smtp.host,
    port: env.email.smtp.port,
    secure: env.email.smtp.port === 465,
    auth: { user: env.email.smtp.user, pass: env.email.smtp.password },
  });
  const info = await transport.sendMail({
    from: env.email.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
    attachments: input.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
    })),
  });
  return {
    delivered: true,
    status: 'SENT',
    message: 'E-mail envoyé.',
    providerMessageId: info.messageId,
  };
}

async function deliverViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.email.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.email.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content.toString('base64'),
      })),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend a refusé l'envoi (${response.status}) : ${detail.slice(0, 200)}`);
  }
  const payload = (await response.json()) as { id?: string };
  return { delivered: true, status: 'SENT', message: 'E-mail envoyé.', providerMessageId: payload.id };
}

async function deliverViaPostmark(input: SendEmailInput): Promise<SendEmailResult> {
  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': env.email.postmarkToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      From: env.email.from,
      To: input.to,
      Subject: input.subject,
      HtmlBody: input.html,
      TextBody: input.text,
      MessageStream: 'outbound',
      Attachments: input.attachments?.map((attachment) => ({
        Name: attachment.filename,
        Content: attachment.content.toString('base64'),
        ContentType: attachment.contentType ?? 'application/octet-stream',
      })),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Postmark a refusé l'envoi (${response.status}) : ${detail.slice(0, 200)}`);
  }
  const payload = (await response.json()) as { MessageID?: string };
  return { delivered: true, status: 'SENT', message: 'E-mail envoyé.', providerMessageId: payload.MessageID };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const bodyPreview = input.text.slice(0, 500);

  if (!env.email.canDeliver) {
    // Développement : le message est journalisé et conservé en base pour inspection.
    console.info(
      `[email:console] → ${input.to} | ${input.subject} | gabarit=${input.template}\n${input.text.slice(0, 400)}`,
    );
    await db
      .insert(emailMessages)
      .values({
        to: input.to,
        subject: input.subject,
        template: input.template,
        status: 'SKIPPED',
        provider: 'console',
        bodyPreview,
        metadata: input.metadata ?? null,
      })
      .catch(() => undefined);
    return {
      delivered: false,
      status: 'SKIPPED',
      message:
        "Aucun service d'e-mail n'est configuré : le message n'a pas été envoyé. Configurez EMAIL_DRIVER (smtp, resend ou postmark) pour activer l'envoi réel.",
    };
  }

  try {
    let result: SendEmailResult;
    switch (env.email.driver) {
      case 'smtp':
        result = await deliverViaSmtp(input);
        break;
      case 'resend':
        result = await deliverViaResend(input);
        break;
      case 'postmark':
        result = await deliverViaPostmark(input);
        break;
      default:
        throw new Error(`Fournisseur d'e-mail inconnu : ${env.email.driver}`);
    }

    await db
      .insert(emailMessages)
      .values({
        to: input.to,
        subject: input.subject,
        template: input.template,
        status: 'SENT',
        provider: env.email.driver,
        providerMessageId: result.providerMessageId ?? null,
        bodyPreview,
        metadata: input.metadata ?? null,
        sentAt: new Date(),
      })
      .catch(() => undefined);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    await db
      .insert(emailMessages)
      .values({
        to: input.to,
        subject: input.subject,
        template: input.template,
        status: 'FAILED',
        provider: env.email.driver,
        error: message.slice(0, 500),
        bodyPreview,
        metadata: input.metadata ?? null,
      })
      .catch(() => undefined);

    return {
      delivered: false,
      status: 'FAILED',
      message: `L'envoi a échoué : ${message}`,
    };
  }
}
