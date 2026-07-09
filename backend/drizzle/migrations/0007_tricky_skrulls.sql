CREATE TABLE "coding_question_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"problem_statement" text NOT NULL,
	"input_format" text,
	"output_format" text,
	"constraints" text,
	"time_limit_ms" integer DEFAULT 2000 NOT NULL,
	"memory_limit_kb" integer DEFAULT 65536 NOT NULL,
	"supported_languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "coding_question_details_question_version_id_unique" UNIQUE("question_version_id")
);
--> statement-breakpoint
CREATE TABLE "coding_test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"input" text,
	"expected_output" text,
	"is_hidden" boolean DEFAULT true NOT NULL,
	"points" numeric(6, 2) DEFAULT '1' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psychometric_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"trait_category" text,
	"scale_type" text DEFAULT 'likert' NOT NULL,
	CONSTRAINT "psychometric_details_question_version_id_unique" UNIQUE("question_version_id")
);
--> statement-breakpoint
CREATE TABLE "psychometric_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"option_text" text NOT NULL,
	"trait_weight" numeric(6, 2) DEFAULT '0',
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coding_question_details" ADD CONSTRAINT "coding_question_details_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coding_test_cases" ADD CONSTRAINT "coding_test_cases_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psychometric_details" ADD CONSTRAINT "psychometric_details_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psychometric_options" ADD CONSTRAINT "psychometric_options_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_coding_test_cases_version" ON "coding_test_cases" USING btree ("question_version_id");--> statement-breakpoint
CREATE INDEX "idx_psychometric_options_version" ON "psychometric_options" USING btree ("question_version_id");