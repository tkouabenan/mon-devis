ALTER TYPE "public"."notification_type" ADD VALUE 'INVOICE_CREATED' BEFORE 'EXPORT_READY';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'INVOICE_PAID' BEFORE 'EXPORT_READY';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'INVOICE_OVERDUE' BEFORE 'EXPORT_READY';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'PAYMENT_RECEIVED' BEFORE 'EXPORT_READY';