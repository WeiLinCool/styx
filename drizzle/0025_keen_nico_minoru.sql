CREATE TABLE "enterprise_oauth_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"client_id" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_oauth_authorization_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"state" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enterprise_oauth_access_tokens" ADD CONSTRAINT "enterprise_oauth_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_oauth_authorization_codes" ADD CONSTRAINT "enterprise_oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enterprise_oauth_access_tokens_user_id_idx" ON "enterprise_oauth_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "enterprise_oauth_access_tokens_expires_at_idx" ON "enterprise_oauth_access_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_oauth_access_tokens_token_hash_unique_idx" ON "enterprise_oauth_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "enterprise_oauth_authorization_codes_user_id_idx" ON "enterprise_oauth_authorization_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "enterprise_oauth_authorization_codes_expires_at_idx" ON "enterprise_oauth_authorization_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_oauth_authorization_codes_code_hash_unique_idx" ON "enterprise_oauth_authorization_codes" USING btree ("code_hash");