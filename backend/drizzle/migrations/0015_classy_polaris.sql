CREATE TYPE "public"."notification_entity_type_enum" AS ENUM('assessment', 'attempt', 'retake_request');--> statement-breakpoint
CREATE TYPE "public"."notification_type_enum" AS ENUM('assessment_published', 'retake_request_approved', 'retake_request_rejected', 'attempt_finalized');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" "notification_type_enum" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"related_entity_type" "notification_entity_type_enum" NOT NULL,
	"related_entity_id" uuid NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_created" ON "notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_unread" ON "notifications" USING btree ("recipient_id","is_read");