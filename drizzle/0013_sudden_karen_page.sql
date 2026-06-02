CREATE TYPE "public"."subscription_work_order_result" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."subscription_work_order_status" AS ENUM('pending', 'processing', 'closed', 'archived');--> statement-breakpoint
CREATE TABLE "subscription_work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" "subscription_work_order_status" DEFAULT 'pending' NOT NULL,
	"result" "subscription_work_order_result",
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"submitted_payment_method" text NOT NULL,
	"submitted_amount_cents" integer NOT NULL,
	"submitted_paid_at" timestamp with time zone NOT NULL,
	"submitted_reference" text NOT NULL,
	"submitted_note" text,
	"processor_admin_id" uuid,
	"processed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"decision_note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_work_orders_amount_non_negative" CHECK ("subscription_work_orders"."submitted_amount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "subscription_work_orders" ADD CONSTRAINT "subscription_work_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_work_orders" ADD CONSTRAINT "subscription_work_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_work_orders" ADD CONSTRAINT "subscription_work_orders_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_work_orders" ADD CONSTRAINT "subscription_work_orders_processor_admin_id_users_id_fk" FOREIGN KEY ("processor_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_work_orders_code_unique_idx" ON "subscription_work_orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "subscription_work_orders_user_id_idx" ON "subscription_work_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscription_work_orders_order_id_idx" ON "subscription_work_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "subscription_work_orders_plan_id_idx" ON "subscription_work_orders" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscription_work_orders_status_idx" ON "subscription_work_orders" USING btree ("status");