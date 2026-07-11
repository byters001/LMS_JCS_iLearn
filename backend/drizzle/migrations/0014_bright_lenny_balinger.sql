CREATE TYPE "public"."feature_flag_scope_enum" AS ENUM('global', 'college');--> statement-breakpoint
CREATE TYPE "public"."module_name_enum" AS ENUM('question_bank', 'coding', 'leaderboard', 'practice_tests', 'ai_assistant', 'reports');--> statement-breakpoint
CREATE TYPE "public"."setting_category_enum" AS ENUM('general', 'security', 'integration', 'email', 'ai');--> statement-breakpoint
CREATE TYPE "public"."setting_value_type_enum" AS ENUM('string', 'number', 'boolean', 'json');--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"scope" "feature_flag_scope_enum" DEFAULT 'global' NOT NULL,
	"college_id" uuid,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_toggles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" "module_name_enum" NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"college_id" uuid,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"value_type" "setting_value_type_enum" DEFAULT 'string' NOT NULL,
	"category" "setting_category_enum" DEFAULT 'general' NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_college_id_colleges_id_fk" FOREIGN KEY ("college_id") REFERENCES "public"."colleges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_toggles" ADD CONSTRAINT "module_toggles_college_id_colleges_id_fk" FOREIGN KEY ("college_id") REFERENCES "public"."colleges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_toggles" ADD CONSTRAINT "module_toggles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_feature_flags_global_key" ON "feature_flags" USING btree ("key") WHERE "feature_flags"."scope" = 'global';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_feature_flags_college_key" ON "feature_flags" USING btree ("key","college_id") WHERE "feature_flags"."scope" = 'college';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_module_toggles_global" ON "module_toggles" USING btree ("module") WHERE "module_toggles"."college_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_module_toggles_college" ON "module_toggles" USING btree ("module","college_id") WHERE "module_toggles"."college_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_system_settings_category" ON "system_settings" USING btree ("category");