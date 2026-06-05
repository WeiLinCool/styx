ALTER TABLE "membership_plan_versions" ADD COLUMN "media_storage_quota_bytes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_plan_versions" ADD COLUMN "media_allow_user_upload" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_plan_versions" ADD COLUMN "media_allow_public_sharing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_plan_versions" ADD CONSTRAINT "membership_plan_versions_media_storage_quota_non_negative" CHECK ("membership_plan_versions"."media_storage_quota_bytes" >= 0);