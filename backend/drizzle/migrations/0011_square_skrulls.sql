CREATE TYPE "public"."attempt_status_enum" AS ENUM('not_started', 'in_progress', 'submitted', 'pending_evaluation', 'invalidated');--> statement-breakpoint
CREATE TABLE "assessment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"status" "attempt_status_enum" DEFAULT 'not_started' NOT NULL,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"submission_time" timestamp with time zone,
	"ip_address" text,
	"browser_info" text,
	"total_score" numeric(8, 2),
	"rank_in_batch" integer,
	"is_retake" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_attempts_assessment_id_student_id_attempt_number_unique" UNIQUE("assessment_id","student_id","attempt_number")
);
--> statement-breakpoint
CREATE TABLE "attempt_question_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"assessment_section_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_question_selections_attempt_id_question_version_id_unique" UNIQUE("attempt_id","question_version_id")
);
--> statement-breakpoint
CREATE TABLE "attempt_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"selected_option_id" uuid,
	"likert_value" smallint,
	"is_marked_for_review" boolean DEFAULT false NOT NULL,
	"is_correct" boolean,
	"marks_obtained" numeric(6, 2),
	"time_spent_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_responses_attempt_id_question_version_id_unique" UNIQUE("attempt_id","question_version_id")
);
--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_student_id_student_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_question_selections" ADD CONSTRAINT "attempt_question_selections_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_question_selections" ADD CONSTRAINT "attempt_question_selections_assessment_section_id_assessment_sections_id_fk" FOREIGN KEY ("assessment_section_id") REFERENCES "public"."assessment_sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_question_selections" ADD CONSTRAINT "attempt_question_selections_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_responses" ADD CONSTRAINT "attempt_responses_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_responses" ADD CONSTRAINT "attempt_responses_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_responses" ADD CONSTRAINT "attempt_responses_selected_option_id_question_options_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."question_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attempts_assessment" ON "assessment_attempts" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "idx_attempts_student" ON "assessment_attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_attempts_status" ON "assessment_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_aqs_attempt" ON "attempt_question_selections" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_aqs_section" ON "attempt_question_selections" USING btree ("assessment_section_id");--> statement-breakpoint
CREATE INDEX "idx_attempt_responses_attempt" ON "attempt_responses" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_attempt_responses_question_version" ON "attempt_responses" USING btree ("question_version_id");