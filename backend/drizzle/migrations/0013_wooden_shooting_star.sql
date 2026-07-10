CREATE TABLE "coding_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_response_id" uuid NOT NULL,
	"language" text NOT NULL,
	"source_code" text NOT NULL,
	"test_cases_passed" integer DEFAULT 0 NOT NULL,
	"test_cases_total" integer DEFAULT 0 NOT NULL,
	"compile_error" text,
	"runtime_error" text,
	"execution_output" jsonb,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coding_submissions" ADD CONSTRAINT "coding_submissions_attempt_response_id_attempt_responses_id_fk" FOREIGN KEY ("attempt_response_id") REFERENCES "public"."attempt_responses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_coding_submissions_response" ON "coding_submissions" USING btree ("attempt_response_id");