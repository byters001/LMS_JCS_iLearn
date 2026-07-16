CREATE TABLE "chatbot_query_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asked_by" uuid,
	"question_text" text NOT NULL,
	"resolved_fn" text,
	"resolved_args" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chatbot_query_log" ADD CONSTRAINT "chatbot_query_log_asked_by_users_id_fk" FOREIGN KEY ("asked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chatbot_query_log_asked_by" ON "chatbot_query_log" USING btree ("asked_by");--> statement-breakpoint
CREATE INDEX "idx_chatbot_query_log_created_at" ON "chatbot_query_log" USING btree ("created_at");