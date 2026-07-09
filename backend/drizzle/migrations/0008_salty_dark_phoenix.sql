CREATE TYPE "public"."question_approval_action_enum" AS ENUM('submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "question_approval_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"question_version_id" uuid,
	"action" "question_approval_action_enum" NOT NULL,
	"performed_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_pool_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_pool_id" uuid NOT NULL,
	"difficulty" "difficulty_enum" NOT NULL,
	"topic_id" uuid,
	"tag_filter" jsonb,
	"count_required" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"college_id" uuid,
	"category_id" uuid,
	"type" "question_type_enum" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "question_approval_history" ADD CONSTRAINT "question_approval_history_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_approval_history" ADD CONSTRAINT "question_approval_history_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_approval_history" ADD CONSTRAINT "question_approval_history_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_pool_criteria" ADD CONSTRAINT "question_pool_criteria_question_pool_id_question_pools_id_fk" FOREIGN KEY ("question_pool_id") REFERENCES "public"."question_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_pool_criteria" ADD CONSTRAINT "question_pool_criteria_topic_id_question_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."question_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_pools" ADD CONSTRAINT "question_pools_college_id_colleges_id_fk" FOREIGN KEY ("college_id") REFERENCES "public"."colleges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_pools" ADD CONSTRAINT "question_pools_category_id_question_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."question_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_pools" ADD CONSTRAINT "question_pools_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_pools" ADD CONSTRAINT "question_pools_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_question_approval_history_question" ON "question_approval_history" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_question_pool_criteria_pool" ON "question_pool_criteria" USING btree ("question_pool_id");--> statement-breakpoint
CREATE INDEX "idx_question_pools_college" ON "question_pools" USING btree ("college_id") WHERE "question_pools"."deleted_at" IS NULL;