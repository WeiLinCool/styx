ALTER TABLE "agent_runs" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
UPDATE "agent_runs" SET "conversation_id" = "id" WHERE "conversation_id" IS NULL;--> statement-breakpoint
CREATE INDEX "agent_runs_conversation_id_idx" ON "agent_runs" USING btree ("conversation_id");
