CREATE TYPE "public"."proctoring_event_type_enum" AS ENUM('tab_switch', 'fullscreen_exit', 'camera_flag', 'copy_paste', 'network_disconnect', 'window_blur');--> statement-breakpoint
CREATE TYPE "public"."retake_status_enum" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "assessment_retake_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"requested_by" uuid,
	"reason" text,
	"status" "retake_status_enum" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proctoring_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"event_type" "proctoring_event_type_enum" NOT NULL,
	"event_meta" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_retake_requests" ADD CONSTRAINT "assessment_retake_requests_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_retake_requests" ADD CONSTRAINT "assessment_retake_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_retake_requests" ADD CONSTRAINT "assessment_retake_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proctoring_events" ADD CONSTRAINT "proctoring_events_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_retake_requests_attempt" ON "assessment_retake_requests" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_retake_requests_status" ON "assessment_retake_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_proctoring_events_attempt" ON "proctoring_events" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_proctoring_events_type" ON "proctoring_events" USING btree ("event_type");