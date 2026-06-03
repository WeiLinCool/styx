CREATE TYPE "public"."generated_media_asset_status" AS ENUM('ready', 'deleted');--> statement-breakpoint
CREATE TABLE "generated_media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"kind" "agent_artifact_kind" NOT NULL,
	"title" text NOT NULL,
	"source_provider" text NOT NULL,
	"source_model" text NOT NULL,
	"source_url" text,
	"source_expires_at" timestamp with time zone,
	"storage_provider" text DEFAULT 'tencent_cos' NOT NULL,
	"bucket" text NOT NULL,
	"region" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" numeric(10, 2),
	"status" "generated_media_asset_status" DEFAULT 'ready' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"save_requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "storage_quota_bytes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "storage_used_bytes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_media_assets" ADD CONSTRAINT "generated_media_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_media_assets" ADD CONSTRAINT "generated_media_assets_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_media_assets_user_id_idx" ON "generated_media_assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "generated_media_assets_run_id_idx" ON "generated_media_assets" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "generated_media_assets_conversation_id_idx" ON "generated_media_assets" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "generated_media_assets_artifact_id_idx" ON "generated_media_assets" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "generated_media_assets_status_idx" ON "generated_media_assets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_media_assets_object_key_unique_idx" ON "generated_media_assets" USING btree ("object_key");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_storage_quota_bytes_non_negative" CHECK ("users"."storage_quota_bytes" >= 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_storage_used_bytes_non_negative" CHECK ("users"."storage_used_bytes" >= 0);