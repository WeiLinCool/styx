CREATE TYPE "public"."activation_token_purpose" AS ENUM('account_activation', 'identity_binding', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('owner', 'admin', 'operator', 'support', 'auditor');--> statement-breakpoint
CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_job_type" AS ENUM('chat', 'image', 'video', 'workflow');--> statement-breakpoint
CREATE TYPE "public"."benefit_kind" AS ENUM('quota', 'feature', 'discount', 'support');--> statement-breakpoint
CREATE TYPE "public"."content_asset_kind" AS ENUM('image', 'video', 'document', 'page', 'prompt');--> statement-breakpoint
CREATE TYPE "public"."content_asset_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."entitlement_source" AS ENUM('membership', 'order', 'manual', 'promotion');--> statement-breakpoint
CREATE TYPE "public"."identity_provider" AS ENUM('email', 'phone', 'github', 'google', 'wechat');--> statement-breakpoint
CREATE TYPE "public"."order_event_type" AS ENUM('created', 'payment_authorized', 'paid', 'fulfilled', 'cancelled', 'refunded', 'note');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'fulfilled', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."partner_lead_status" AS ENUM('new', 'contacted', 'qualified', 'converted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."plan_billing_period" AS ENUM('month', 'year', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."user_account_state" AS ENUM('pending_activation', 'active', 'suspended', 'archived');--> statement-breakpoint
CREATE TABLE "activation_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"identity_id" uuid,
	"purpose" "activation_token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"user_id" uuid NOT NULL,
	"role" "admin_role" NOT NULL,
	"granted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "ai_job_type" NOT NULL,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"provider" text,
	"model" text,
	"prompt" text,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"target_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "benefit_kind" NOT NULL,
	"quantity" integer,
	"unit" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" "content_asset_kind" NOT NULL,
	"status" "content_asset_status" DEFAULT 'draft' NOT NULL,
	"url" text,
	"body" text,
	"created_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"billing_period" "plan_billing_period" NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_plans_price_non_negative" CHECK ("membership_plans"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" "order_event_type" NOT NULL,
	"actor_user_id" uuid,
	"message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid,
	"plan_id" uuid,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"paid_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_total_non_negative" CHECK ("orders"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "partner_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"status" "partner_lead_status" DEFAULT 'new' NOT NULL,
	"source" text,
	"notes" text,
	"owner_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"inventory_quantity" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_non_negative" CHECK ("products"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_token_hash" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"is_secret" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid,
	"benefit_id" uuid,
	"source" "entitlement_source" NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"remaining_quantity" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "identity_provider" NOT NULL,
	"provider_subject" text NOT NULL,
	"label" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"phone" text,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"account_state" "user_account_state" DEFAULT 'pending_activation' NOT NULL,
	"activated_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activation_tokens" ADD CONSTRAINT "activation_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_tokens" ADD CONSTRAINT "activation_tokens_identity_id_user_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."user_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefits" ADD CONSTRAINT "benefits_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_leads" ADD CONSTRAINT "partner_leads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_benefit_id_benefits_id_fk" FOREIGN KEY ("benefit_id") REFERENCES "public"."benefits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activation_tokens_user_id_idx" ON "activation_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activation_tokens_token_hash_unique_idx" ON "activation_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_roles_role_idx" ON "admin_roles" USING btree ("role");--> statement-breakpoint
CREATE INDEX "ai_jobs_user_id_idx" ON "ai_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_jobs_type_idx" ON "ai_jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_user_id_idx" ON "audit_events" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benefits_plan_code_unique_idx" ON "benefits" USING btree ("plan_id","code");--> statement-breakpoint
CREATE INDEX "benefits_plan_id_idx" ON "benefits" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_assets_slug_unique_idx" ON "content_assets" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "content_assets_status_idx" ON "content_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_assets_kind_idx" ON "content_assets" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plans_code_unique_idx" ON "membership_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "membership_plans_active_idx" ON "membership_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "order_events_order_id_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_events_type_idx" ON "order_events" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_unique_idx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "partner_leads_status_idx" ON "partner_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "partner_leads_owner_user_id_idx" ON "partner_leads" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique_idx" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique_idx" ON "sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "system_settings_secret_idx" ON "system_settings" USING btree ("is_secret");--> statement-breakpoint
CREATE INDEX "user_entitlements_user_id_idx" ON "user_entitlements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_entitlements_expiry_idx" ON "user_entitlements" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_identities_user_id_idx" ON "user_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_provider_subject_unique_idx" ON "user_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_verified_owner_unique_idx" ON "user_identities" USING btree ("provider","provider_subject") WHERE "user_identities"."is_verified" = true;--> statement-breakpoint
CREATE INDEX "users_account_state_idx" ON "users" USING btree ("account_state");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique_idx" ON "users" USING btree ("email") WHERE "users"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique_idx" ON "users" USING btree ("phone") WHERE "users"."phone" is not null;