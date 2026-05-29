CREATE TYPE "public"."password_reset_work_order_status" AS ENUM('pending', 'processing', 'closed', 'archived');--> statement-breakpoint
CREATE TABLE "password_reset_work_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "phone" text NOT NULL,
  "reason" text NOT NULL,
  "status" "public"."password_reset_work_order_status" DEFAULT 'pending' NOT NULL,
  "temporary_password" text,
  "processed_by_user_id" uuid,
  "processed_at" timestamp with time zone,
  "archived_by_user_id" uuid,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "password_reset_work_orders" ADD CONSTRAINT "password_reset_work_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_work_orders" ADD CONSTRAINT "password_reset_work_orders_processed_by_user_id_users_id_fk" FOREIGN KEY ("processed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_work_orders" ADD CONSTRAINT "password_reset_work_orders_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_reset_work_orders_user_id_idx" ON "password_reset_work_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_work_orders_status_idx" ON "password_reset_work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "password_reset_work_orders_created_at_idx" ON "password_reset_work_orders" USING btree ("created_at");--> statement-breakpoint
