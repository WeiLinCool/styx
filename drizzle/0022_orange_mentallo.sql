CREATE TYPE "public"."doc_article_block_type" AS ENUM('rich_text', 'step_media', 'video', 'audio', 'faq', 'flowchart', 'gallery');--> statement-breakpoint
CREATE TYPE "public"."doc_article_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."doc_audience_scope" AS ENUM('user', 'admin', 'shared');--> statement-breakpoint
CREATE TYPE "public"."doc_import_status" AS ENUM('parsed', 'failed', 'imported');--> statement-breakpoint
CREATE TABLE "doc_article_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"block_type" "doc_article_block_type" NOT NULL,
	"sort_order" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"cover_image" text,
	"status" "doc_article_status" DEFAULT 'draft' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"audience_scope" "doc_audience_scope" DEFAULT 'shared' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_filename" text NOT NULL,
	"source_checksum" text NOT NULL,
	"import_status" "doc_import_status" NOT NULL,
	"error_summary" text,
	"preview_snapshot" jsonb NOT NULL,
	"created_article_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_article_blocks" ADD CONSTRAINT "doc_article_blocks_article_id_doc_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."doc_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_articles" ADD CONSTRAINT "doc_articles_category_id_doc_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."doc_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_articles" ADD CONSTRAINT "doc_articles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_articles" ADD CONSTRAINT "doc_articles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_categories" ADD CONSTRAINT "doc_categories_parent_id_doc_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."doc_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_import_jobs" ADD CONSTRAINT "doc_import_jobs_created_article_id_doc_articles_id_fk" FOREIGN KEY ("created_article_id") REFERENCES "public"."doc_articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_import_jobs" ADD CONSTRAINT "doc_import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_article_blocks_article_sort_idx" ON "doc_article_blocks" USING btree ("article_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_articles_category_slug_idx" ON "doc_articles" USING btree ("category_id","slug");--> statement-breakpoint
CREATE INDEX "doc_articles_status_updated_idx" ON "doc_articles" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_categories_slug_idx" ON "doc_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "doc_categories_audience_sort_idx" ON "doc_categories" USING btree ("audience_scope","sort_order");