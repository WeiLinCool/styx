ALTER TABLE "ai_models" ADD COLUMN "supports_video_generation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "is_default_video" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_models_video_generation_idx" ON "ai_models" USING btree ("supports_video_generation");