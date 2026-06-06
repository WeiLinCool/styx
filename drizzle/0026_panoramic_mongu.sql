ALTER TYPE "public"."agent_artifact_kind" ADD VALUE 'audio' BEFORE 'video';--> statement-breakpoint
CREATE TABLE "membership_plan_video_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"allowed_durations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_resolutions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_duration" integer NOT NULL,
	"default_resolution" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_style_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_plan_video_configs" ADD CONSTRAINT "membership_plan_video_configs_plan_version_id_membership_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."membership_plan_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plan_video_configs_plan_version_unique_idx" ON "membership_plan_video_configs" USING btree ("plan_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "video_style_presets_code_unique_idx" ON "video_style_presets" USING btree ("code");--> statement-breakpoint
CREATE INDEX "video_style_presets_enabled_sort_idx" ON "video_style_presets" USING btree ("enabled","sort_order");