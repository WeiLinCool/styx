ALTER TABLE "ai_models" ADD COLUMN "supports_image_generation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "supports_image_edit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "supports_image_upscale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "is_default_image" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_models_image_generation_idx" ON "ai_models" USING btree ("supports_image_generation");--> statement-breakpoint
CREATE INDEX "ai_models_image_edit_idx" ON "ai_models" USING btree ("supports_image_edit");--> statement-breakpoint
CREATE INDEX "ai_models_image_upscale_idx" ON "ai_models" USING btree ("supports_image_upscale");