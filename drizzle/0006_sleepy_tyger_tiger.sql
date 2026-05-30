CREATE TABLE "user_daily_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"checkin_date" date NOT NULL,
	"streak_count" integer DEFAULT 1 NOT NULL,
	"reward_ledger_entry_id" uuid,
	"qualified_at" timestamp with time zone,
	"qualified_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_daily_checkins_streak_count_positive" CHECK ("user_daily_checkins"."streak_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_invite_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"invite_code_id" uuid,
	"qualified_at" timestamp with time zone,
	"qualified_by" text,
	"reward_ledger_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "user_daily_checkins" ADD CONSTRAINT "user_daily_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_checkins" ADD CONSTRAINT "user_daily_checkins_reward_ledger_entry_id_credit_ledger_entries_id_fk" FOREIGN KEY ("reward_ledger_entry_id") REFERENCES "public"."credit_ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invite_codes" ADD CONSTRAINT "user_invite_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_referrals" ADD CONSTRAINT "user_referrals_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_referrals" ADD CONSTRAINT "user_referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_referrals" ADD CONSTRAINT "user_referrals_invite_code_id_user_invite_codes_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."user_invite_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_referrals" ADD CONSTRAINT "user_referrals_reward_ledger_entry_id_credit_ledger_entries_id_fk" FOREIGN KEY ("reward_ledger_entry_id") REFERENCES "public"."credit_ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_daily_checkins_user_id_idx" ON "user_daily_checkins" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_daily_checkins_user_date_unique_idx" ON "user_daily_checkins" USING btree ("user_id","checkin_date");--> statement-breakpoint
CREATE UNIQUE INDEX "user_invite_codes_code_unique_idx" ON "user_invite_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "user_invite_codes_active_user_unique_idx" ON "user_invite_codes" USING btree ("user_id") WHERE "user_invite_codes"."status" = 'active';--> statement-breakpoint
CREATE INDEX "user_referrals_referrer_user_id_idx" ON "user_referrals" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX "user_referrals_invite_code_id_idx" ON "user_referrals" USING btree ("invite_code_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_referrals_referred_user_id_unique_idx" ON "user_referrals" USING btree ("referred_user_id");--> statement-breakpoint
