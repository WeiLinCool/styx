ALTER TABLE "membership_plan_versions" ALTER COLUMN "media_storage_quota_bytes" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "storage_quota_bytes" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "storage_used_bytes" SET DATA TYPE bigint;