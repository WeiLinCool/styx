ALTER TYPE "public"."activation_work_order_status" RENAME TO "activation_work_order_status_old";--> statement-breakpoint
CREATE TYPE "public"."activation_work_order_status" AS ENUM('pending', 'processing', 'closed', 'archived');--> statement-breakpoint
ALTER TABLE "activation_work_orders" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "activation_work_orders"
ALTER COLUMN "status" TYPE "public"."activation_work_order_status"
USING (
  CASE
    WHEN "status"::text = 'pending' THEN 'pending'
    WHEN "status"::text = 'approved' THEN 'closed'
    WHEN "status"::text = 'rejected' THEN 'closed'
    WHEN "status"::text = 'expired' THEN 'archived'
    ELSE 'pending'
  END
)::"public"."activation_work_order_status";--> statement-breakpoint
ALTER TABLE "activation_work_orders" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
DROP TYPE "public"."activation_work_order_status_old";
