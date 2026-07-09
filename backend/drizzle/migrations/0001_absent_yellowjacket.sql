CREATE TYPE "public"."batch_status_enum" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."trainer_role_enum" AS ENUM('lead', 'co_trainer');--> statement-breakpoint
CREATE TYPE "public"."training_program_status_enum" AS ENUM('planned', 'ongoing', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"training_program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"max_students" integer,
	"status" "batch_status_enum" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "training_program_trainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"training_program_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"role_in_program" "trainer_role_enum" DEFAULT 'co_trainer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_program_trainers_training_program_id_trainer_id_unique" UNIQUE("training_program_id","trainer_id")
);
--> statement-breakpoint
CREATE TABLE "training_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"college_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"academic_year_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"start_date" date,
	"end_date" date,
	"status" "training_program_status_enum" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_training_program_id_training_programs_id_fk" FOREIGN KEY ("training_program_id") REFERENCES "public"."training_programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program_trainers" ADD CONSTRAINT "training_program_trainers_training_program_id_training_programs_id_fk" FOREIGN KEY ("training_program_id") REFERENCES "public"."training_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program_trainers" ADD CONSTRAINT "training_program_trainers_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_college_id_colleges_id_fk" FOREIGN KEY ("college_id") REFERENCES "public"."colleges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_batches_program_status" ON "batches" USING btree ("training_program_id","status") WHERE "batches"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_tpt_program" ON "training_program_trainers" USING btree ("training_program_id");--> statement-breakpoint
CREATE INDEX "idx_tpt_trainer" ON "training_program_trainers" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX "idx_training_programs_college_status" ON "training_programs" USING btree ("college_id","status") WHERE "training_programs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_training_programs_department" ON "training_programs" USING btree ("department_id");