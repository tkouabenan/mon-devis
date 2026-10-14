ALTER TABLE "organization_settings" ADD COLUMN "template_customization" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "deletion_requested_at" timestamp with time zone;