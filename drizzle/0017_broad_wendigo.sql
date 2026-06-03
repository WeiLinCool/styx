CREATE TYPE "public"."permission_resource_type" AS ENUM('menu', 'page', 'action', 'api');--> statement-breakpoint
CREATE TABLE "membership_plan_permission_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"permission_resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"resource_type" "permission_resource_type" NOT NULL,
	"module" text NOT NULL,
	"description" text,
	"route_pattern" text,
	"action_key" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_plan_permission_bindings" ADD CONSTRAINT "membership_plan_permission_bindings_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan_permission_bindings" ADD CONSTRAINT "membership_plan_permission_bindings_permission_resource_id_permission_resources_id_fk" FOREIGN KEY ("permission_resource_id") REFERENCES "public"."permission_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plan_permission_bindings_unique_idx" ON "membership_plan_permission_bindings" USING btree ("plan_id","permission_resource_id");--> statement-breakpoint
CREATE INDEX "membership_plan_permission_bindings_plan_idx" ON "membership_plan_permission_bindings" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "membership_plan_permission_bindings_resource_idx" ON "membership_plan_permission_bindings" USING btree ("permission_resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_resources_code_unique_idx" ON "permission_resources" USING btree ("code");--> statement-breakpoint
CREATE INDEX "permission_resources_type_idx" ON "permission_resources" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "permission_resources_module_idx" ON "permission_resources" USING btree ("module");--> statement-breakpoint
CREATE INDEX "permission_resources_active_idx" ON "permission_resources" USING btree ("is_active");