CREATE TYPE "public"."media_asset_share_status" AS ENUM('disabled', 'active');--> statement-breakpoint
CREATE TYPE "public"."media_asset_source_type" AS ENUM('ai_generated', 'user_uploaded');--> statement-breakpoint
ALTER TABLE "generated_media_assets" ALTER COLUMN "run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_media_assets" ALTER COLUMN "conversation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_media_assets" ALTER COLUMN "artifact_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_media_assets" ALTER COLUMN "source_provider" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_media_assets" ALTER COLUMN "source_model" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_media_assets" ADD COLUMN "source_type" "media_asset_source_type" DEFAULT 'ai_generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_media_assets" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "generated_media_assets" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "generated_media_assets" ADD COLUMN "share_id" text;--> statement-breakpoint
ALTER TABLE "generated_media_assets" ADD COLUMN "share_status" "media_asset_share_status" DEFAULT 'disabled' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_media_assets" ADD COLUMN "shared_at" timestamp with time zone;