CREATE TYPE "public"."assessment_approval_action_enum" AS ENUM('submitted', 'approved', 'rejected', 'scheduled', 'published');--> statement-breakpoint
CREATE TYPE "public"."assessment_status_enum" AS ENUM('draft', 'review', 'approved', 'scheduled', 'live', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."selection_mode_enum" AS ENUM('manual', 'pool');--> statement-breakpoint
CREATE TYPE "public"."test_category_enum" AS ENUM('mcq', 'coding', 'psychometric', 'mixed');--> statement-breakpoint
CREATE TABLE "assessment_approval_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"action" "assessment_approval_action_enum" NOT NULL,
	"performed_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_batches_assessment_id_batch_id_unique" UNIQUE("assessment_id","batch_id")
);
--> statement-breakpoint
CREATE TABLE "assessment_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_section_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"marks_override" numeric(6, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "assessment_questions_assessment_section_id_question_version_id_unique" UNIQUE("assessment_section_id","question_version_id")
);
--> statement-breakpoint
CREATE TABLE "assessment_section_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_section_id" uuid NOT NULL,
	"question_pool_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_section_pools_assessment_section_id_question_pool_id_unique" UNIQUE("assessment_section_id","question_pool_id")
);
--> statement-breakpoint
CREATE TABLE "assessment_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"section_order" integer DEFAULT 0 NOT NULL,
	"timer_minutes" integer,
	"passing_marks" numeric(6, 2),
	"negative_marking" boolean DEFAULT false NOT NULL,
	"negative_marking_value" numeric(6, 2) DEFAULT '0',
	"shuffle_questions" boolean DEFAULT false NOT NULL,
	"selection_mode" "selection_mode_enum" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"training_session_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"test_category" "test_category_enum" NOT NULL,
	"timer_minutes" integer,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"shuffle_questions" boolean DEFAULT false NOT NULL,
	"random_question_count" integer,
	"negative_marking" boolean DEFAULT false NOT NULL,
	"negative_marking_value" numeric(6, 2) DEFAULT '0',
	"proctoring_camera_required" boolean DEFAULT false NOT NULL,
	"proctoring_fullscreen_required" boolean DEFAULT false NOT NULL,
	"is_practice" boolean DEFAULT false NOT NULL,
	"status" "assessment_status_enum" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "assessment_approval_history" ADD CONSTRAINT "assessment_approval_history_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_approval_history" ADD CONSTRAINT "assessment_approval_history_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_batches" ADD CONSTRAINT "assessment_batches_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_batches" ADD CONSTRAINT "assessment_batches_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessment_section_id_assessment_sections_id_fk" FOREIGN KEY ("assessment_section_id") REFERENCES "public"."assessment_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_section_pools" ADD CONSTRAINT "assessment_section_pools_assessment_section_id_assessment_sections_id_fk" FOREIGN KEY ("assessment_section_id") REFERENCES "public"."assessment_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_section_pools" ADD CONSTRAINT "assessment_section_pools_question_pool_id_question_pools_id_fk" FOREIGN KEY ("question_pool_id") REFERENCES "public"."question_pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_training_session_id_training_sessions_id_fk" FOREIGN KEY ("training_session_id") REFERENCES "public"."training_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assessment_approval_history_assessment" ON "assessment_approval_history" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_batches_assessment" ON "assessment_batches" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_batches_batch" ON "assessment_batches" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_questions_section" ON "assessment_questions" USING btree ("assessment_section_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_questions_version" ON "assessment_questions" USING btree ("question_version_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_section_pools_section" ON "assessment_section_pools" USING btree ("assessment_section_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_sections_assessment" ON "assessment_sections" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "idx_assessments_session" ON "assessments" USING btree ("training_session_id") WHERE "assessments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_assessments_status" ON "assessments" USING btree ("status") WHERE "assessments"."deleted_at" IS NULL;