CREATE TABLE "agent_conversation_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"folder_id" uuid,
	"auto_title" text NOT NULL,
	"title_override" text,
	"last_run_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_conversation_folders" ADD CONSTRAINT "agent_conversation_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_folder_id_agent_conversation_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."agent_conversation_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_conversation_folders_user_deleted_idx" ON "agent_conversation_folders" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "agent_conversation_folders_user_sort_idx" ON "agent_conversation_folders" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "agent_conversations_user_deleted_idx" ON "agent_conversations" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "agent_conversations_user_folder_idx" ON "agent_conversations" USING btree ("user_id","folder_id");--> statement-breakpoint
CREATE INDEX "agent_conversations_user_last_run_idx" ON "agent_conversations" USING btree ("user_id","last_run_at");--> statement-breakpoint
INSERT INTO "agent_conversations" (
	"id",
	"user_id",
	"auto_title",
	"last_run_at",
	"created_at",
	"updated_at"
)
SELECT
	grouped.conversation_id,
	grouped.user_id,
	COALESCE(first_run.prompt, '新对话') AS auto_title,
	grouped.last_run_at,
	grouped.created_at,
	grouped.updated_at
FROM (
	SELECT
		COALESCE("conversation_id", "id") AS conversation_id,
		"user_id",
		MIN("created_at") AS created_at,
		MAX(COALESCE("updated_at", "created_at")) AS updated_at,
		MAX(COALESCE("updated_at", "created_at")) AS last_run_at
	FROM "agent_runs"
	WHERE "task_type" = 'chat' AND "deleted_at" IS NULL
	GROUP BY COALESCE("conversation_id", "id"), "user_id"
) grouped
LEFT JOIN LATERAL (
	SELECT "prompt"
	FROM "agent_runs"
	WHERE
		COALESCE("conversation_id", "id") = grouped.conversation_id
		AND "user_id" = grouped.user_id
		AND "task_type" = 'chat'
		AND "deleted_at" IS NULL
	ORDER BY "created_at" ASC
	LIMIT 1
) first_run ON true
ON CONFLICT ("id") DO NOTHING;
