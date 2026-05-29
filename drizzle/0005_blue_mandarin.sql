CREATE TYPE "public"."ai_model_entitlement_requirement_type" AS ENUM('none', 'membership_plan', 'benefit_code', 'user_grant');--> statement-breakpoint
CREATE TYPE "public"."ai_model_status" AS ENUM('enabled', 'disabled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_status" AS ENUM('enabled', 'disabled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_type" AS ENUM('openai_compatible', 'development');--> statement-breakpoint
CREATE TYPE "public"."credit_ledger_entry_type" AS ENUM('grant', 'debit', 'adjustment');--> statement-breakpoint
CREATE TABLE "ai_model_entitlement_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"requirement_type" "ai_model_entitlement_requirement_type" NOT NULL,
	"requirement_value" text,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_model_entitlement_requirements_value_shape" CHECK (("ai_model_entitlement_requirements"."requirement_type" = 'none' and "ai_model_entitlement_requirements"."requirement_value" is null) or ("ai_model_entitlement_requirements"."requirement_type" <> 'none' and "ai_model_entitlement_requirements"."requirement_value" is not null))
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"model" text NOT NULL,
	"status" "ai_model_status" DEFAULT 'enabled' NOT NULL,
	"supports_chat" boolean DEFAULT false NOT NULL,
	"is_default_chat" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"pricing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"provider_type" "ai_provider_type" NOT NULL,
	"status" "ai_provider_status" DEFAULT 'enabled' NOT NULL,
	"base_url" text,
	"credential_env_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid,
	"entry_type" "credit_ledger_entry_type" NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer,
	"idempotency_key" text NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_model_entitlement_requirements" ADD CONSTRAINT "ai_model_entitlement_requirements_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_model_entitlement_requirements_model_id_idx" ON "ai_model_entitlement_requirements" USING btree ("model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_entitlement_requirements_natural_unique_idx" ON "ai_model_entitlement_requirements" USING btree ("model_id","requirement_type",coalesce("requirement_value", ''));--> statement-breakpoint
CREATE UNIQUE INDEX "ai_models_code_unique_idx" ON "ai_models" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ai_models_provider_id_idx" ON "ai_models" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "ai_models_status_idx" ON "ai_models" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_models_chat_idx" ON "ai_models" USING btree ("supports_chat");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_providers_code_unique_idx" ON "ai_providers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ai_providers_status_idx" ON "ai_providers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "credit_ledger_entries_user_id_idx" ON "credit_ledger_entries" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_entries_idempotency_key_unique_idx" ON "credit_ledger_entries" USING btree ("idempotency_key");
