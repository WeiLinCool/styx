CREATE TYPE "public"."request_idempotency_actor_type" AS ENUM('anonymous', 'user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."request_idempotency_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "request_idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"actor_type" "request_idempotency_actor_type" NOT NULL,
	"actor_id" text,
	"operation" text NOT NULL,
	"body_hash" text NOT NULL,
	"status" "request_idempotency_status" DEFAULT 'processing' NOT NULL,
	"response_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "request_idempotency_scope_key_unique_idx" ON "request_idempotency_records" USING btree ("actor_type","actor_id","operation","key");--> statement-breakpoint
CREATE INDEX "request_idempotency_expires_at_idx" ON "request_idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "request_idempotency_status_idx" ON "request_idempotency_records" USING btree ("status");