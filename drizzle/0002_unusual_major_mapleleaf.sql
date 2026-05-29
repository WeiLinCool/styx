CREATE TYPE "public"."agent_artifact_kind" AS ENUM('text', 'image', 'video', 'document', 'workflow', 'json');--> statement-breakpoint
CREATE TYPE "public"."agent_capability_kind" AS ENUM('model', 'skill', 'mcp_server', 'plugin');--> statement-breakpoint
CREATE TYPE "public"."agent_capability_status" AS ENUM('enabled', 'disabled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "agent_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" "agent_artifact_kind" NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"body" text,
	"url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "agent_capability_kind" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" "agent_capability_status" DEFAULT 'enabled' NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_capability_bundle_items" (
	"bundle_id" uuid NOT NULL,
	"capability_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_capability_bundle_items_bundle_id_capability_id_pk" PRIMARY KEY("bundle_id","capability_id")
);
--> statement-breakpoint
CREATE TABLE "agent_capability_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"task_type" "ai_job_type" NOT NULL,
	"name" text NOT NULL,
	"status" "agent_capability_status" DEFAULT 'enabled' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"type" text NOT NULL,
	"message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_type" "ai_job_type" NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"prompt" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"capability_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"final_message" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD CONSTRAINT "agent_artifacts_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_capability_bundle_items" ADD CONSTRAINT "agent_capability_bundle_items_bundle_id_agent_capability_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."agent_capability_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_capability_bundle_items" ADD CONSTRAINT "agent_capability_bundle_items_capability_id_agent_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."agent_capabilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_artifacts_run_id_idx" ON "agent_artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_artifacts_kind_idx" ON "agent_artifacts" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_capabilities_code_unique_idx" ON "agent_capabilities" USING btree ("code");--> statement-breakpoint
CREATE INDEX "agent_capabilities_kind_idx" ON "agent_capabilities" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "agent_capabilities_status_idx" ON "agent_capabilities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_capability_bundle_items_capability_idx" ON "agent_capability_bundle_items" USING btree ("capability_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_capability_bundles_code_unique_idx" ON "agent_capability_bundles" USING btree ("code");--> statement-breakpoint
CREATE INDEX "agent_capability_bundles_task_type_idx" ON "agent_capability_bundles" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "agent_run_events_run_id_idx" ON "agent_run_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_run_events_type_idx" ON "agent_run_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "agent_runs_user_id_idx" ON "agent_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_runs_task_type_idx" ON "agent_runs" USING btree ("task_type");--> statement-breakpoint
INSERT INTO "agent_capabilities" ("id", "kind", "code", "name", "status", "scope", "config", "secret_metadata") VALUES
('11111111-1111-4111-8111-111111111111', 'model', 'pi-default', 'Pi 默认模型', 'enabled', 'global', '{"provider":"pi","model":"pi-default"}'::jsonb, '{}'::jsonb),
('22222222-2222-4222-8222-222222222222', 'skill', 'stone-script', '石头印画脚本 Skill', 'enabled', 'global', '{"prompt":"生成石头印画相关脚本。"}'::jsonb, '{}'::jsonb),
('33333333-3333-4333-8333-333333333333', 'mcp_server', 'asset-library', '素材库 MCP', 'enabled', 'global', '{"server":"asset-library"}'::jsonb, '{}'::jsonb),
('44444444-4444-4444-8444-444444444444', 'plugin', 'artifact-export', '产物导出 Plugin', 'enabled', 'global', '{"formats":["text","json"]}'::jsonb, '{}'::jsonb)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "agent_capability_bundles" ("id", "code", "task_type", "name", "status", "metadata") VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'chat-default', 'chat', 'Chat Default', 'enabled', '{}'::jsonb),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'image-default', 'image', 'Image Default', 'enabled', '{}'::jsonb),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'video-default', 'video', 'Video Default', 'enabled', '{}'::jsonb),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'workflow-default', 'workflow', 'Workflow Default', 'enabled', '{}'::jsonb)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "agent_capability_bundle_items" ("bundle_id", "capability_id", "sort_order") VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 0),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 10),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 20),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 0),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 10),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 20),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 0),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333', 10),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '44444444-4444-4444-8444-444444444444', 20),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 0),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '22222222-2222-4222-8222-222222222222', 10),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '33333333-3333-4333-8333-333333333333', 20),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444', 30)
ON CONFLICT ("bundle_id", "capability_id") DO NOTHING;
