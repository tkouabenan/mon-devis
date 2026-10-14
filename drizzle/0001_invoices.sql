CREATE TYPE "public"."invoice_payment_method" AS ENUM('BANK_TRANSFER', 'MOBILE_MONEY', 'CASH', 'CARD', 'CHEQUE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"product_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit" text DEFAULT 'unité' NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"discount_type" "discount_type",
	"discount_value" numeric(9, 4) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(7, 4) DEFAULT '18' NOT NULL,
	"line_gross" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_discount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_net" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_tax" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(18, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"method" "invoice_payment_method" DEFAULT 'BANK_TRANSFER' NOT NULL,
	"reference" text,
	"note" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"from_status" "invoice_status",
	"to_status" "invoice_status" NOT NULL,
	"actor_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" text,
	"quotation_id" text,
	"created_by_id" text,
	"number" text NOT NULL,
	"title" text DEFAULT 'Facture' NOT NULL,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"locale" text DEFAULT 'fr-FR' NOT NULL,
	"issue_date" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"source_quotation_number" text,
	"customer_reference" text,
	"reference" text,
	"template_key" text DEFAULT 'minimaliste' NOT NULL,
	"customization" jsonb,
	"prices_include_tax" boolean DEFAULT false NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_discount_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"global_discount_type" "discount_type",
	"global_discount_value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"global_discount_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"net_before_tax" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(18, 2) DEFAULT '0' NOT NULL,
	"company_snapshot" jsonb,
	"customer_snapshot" jsonb,
	"terms" jsonb,
	"notes" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "invoice_numbering_format" text DEFAULT 'FAC-{YYYY}-{SEQ:4}' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "invoice_numbering_next_value" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "invoice_numbering_year" integer;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "invoice_due_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_status_history" ADD CONSTRAINT "invoice_status_history_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "invoice_payments_invoice_idx" ON "invoice_payments" USING btree ("invoice_id","paid_at");--> statement-breakpoint
CREATE INDEX "invoice_payments_org_idx" ON "invoice_payments" USING btree ("organization_id","paid_at");--> statement-breakpoint
CREATE INDEX "invoice_status_history_invoice_idx" ON "invoice_status_history" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_number_unique" ON "invoices" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "invoices_org_status_idx" ON "invoices" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "invoices_org_issue_date_idx" ON "invoices" USING btree ("organization_id","issue_date");--> statement-breakpoint
CREATE INDEX "invoices_org_due_date_idx" ON "invoices" USING btree ("organization_id","due_date");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_quotation_idx" ON "invoices" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "invoices_org_archived_idx" ON "invoices" USING btree ("organization_id","is_archived");