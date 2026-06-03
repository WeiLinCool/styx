CREATE TYPE "public"."membership_plan_version_status" AS ENUM('draft', 'scheduled', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "membership_plan_version_benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
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
CREATE TABLE "membership_plan_version_permission_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"permission_resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "membership_plan_version_status" DEFAULT 'draft' NOT NULL,
	"effective_from" timestamp with time zone,
	"published_at" timestamp with time zone,
	"display_name" text NOT NULL,
	"description" text,
	"billing_period" "plan_billing_period" NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"change_summary" text,
	"created_by" uuid,
	"published_by" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_plan_versions_price_non_negative" CHECK ("membership_plan_versions"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "user_entitlements" ADD COLUMN "plan_version_id" uuid;--> statement-breakpoint
ALTER TABLE "membership_plan_version_benefits" ADD CONSTRAINT "membership_plan_version_benefits_version_id_membership_plan_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."membership_plan_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan_version_permission_bindings" ADD CONSTRAINT "membership_plan_version_permission_bindings_version_id_membership_plan_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."membership_plan_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan_version_permission_bindings" ADD CONSTRAINT "membership_plan_version_permission_bindings_permission_resource_id_permission_resources_id_fk" FOREIGN KEY ("permission_resource_id") REFERENCES "public"."permission_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan_versions" ADD CONSTRAINT "membership_plan_versions_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan_versions" ADD CONSTRAINT "membership_plan_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan_versions" ADD CONSTRAINT "membership_plan_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plan_version_benefits_version_code_unique_idx" ON "membership_plan_version_benefits" USING btree ("version_id","code");--> statement-breakpoint
CREATE INDEX "membership_plan_version_benefits_version_id_idx" ON "membership_plan_version_benefits" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plan_version_permission_bindings_unique_idx" ON "membership_plan_version_permission_bindings" USING btree ("version_id","permission_resource_id");--> statement-breakpoint
CREATE INDEX "membership_plan_version_permission_bindings_version_idx" ON "membership_plan_version_permission_bindings" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "membership_plan_version_permission_bindings_resource_idx" ON "membership_plan_version_permission_bindings" USING btree ("permission_resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plan_versions_plan_version_unique_idx" ON "membership_plan_versions" USING btree ("plan_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plan_versions_single_draft_idx" ON "membership_plan_versions" USING btree ("plan_id") WHERE "membership_plan_versions"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plan_versions_single_scheduled_idx" ON "membership_plan_versions" USING btree ("plan_id") WHERE "membership_plan_versions"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "membership_plan_versions_status_idx" ON "membership_plan_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "membership_plan_versions_effective_from_idx" ON "membership_plan_versions" USING btree ("effective_from");--> statement-breakpoint
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_plan_version_id_membership_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."membership_plan_versions"("id") ON DELETE set null ON UPDATE no action;