CREATE TABLE "agent_run_stream_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_run_stream_events" ADD CONSTRAINT "agent_run_stream_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_stream_events_run_id_idx" ON "agent_run_stream_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_run_stream_events_event_type_idx" ON "agent_run_stream_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_stream_events_run_id_sequence_unique_idx" ON "agent_run_stream_events" USING btree ("run_id","sequence");