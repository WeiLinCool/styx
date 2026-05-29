CREATE TYPE "public"."activation_work_order_status" AS ENUM('pending', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "activation_work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" "activation_work_order_status" DEFAULT 'pending' NOT NULL,
	"fingerprint_digest" text NOT NULL,
	"device_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"rejected_by_user_id" uuid,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activation_work_orders" ADD CONSTRAINT "activation_work_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_work_orders" ADD CONSTRAINT "activation_work_orders_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_work_orders" ADD CONSTRAINT "activation_work_orders_rejected_by_user_id_users_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activation_work_orders_user_id_idx" ON "activation_work_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activation_work_orders_status_idx" ON "activation_work_orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "activation_work_orders_code_unique_idx" ON "activation_work_orders" USING btree ("code");