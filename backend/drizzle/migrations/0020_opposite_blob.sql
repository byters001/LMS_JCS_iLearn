CREATE TABLE "batch_trainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_trainers_batch_id_trainer_id_unique" UNIQUE("batch_id","trainer_id")
);
--> statement-breakpoint
ALTER TABLE "batch_trainers" ADD CONSTRAINT "batch_trainers_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_trainers" ADD CONSTRAINT "batch_trainers_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_trainers" ADD CONSTRAINT "batch_trainers_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_batch_trainers_batch" ON "batch_trainers" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_batch_trainers_trainer" ON "batch_trainers" USING btree ("trainer_id");