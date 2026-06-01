ALTER TABLE "request_idempotency_records" ALTER COLUMN "actor_id" SET DEFAULT 'anonymous';--> statement-breakpoint
ALTER TABLE "request_idempotency_records" ALTER COLUMN "actor_id" SET NOT NULL;