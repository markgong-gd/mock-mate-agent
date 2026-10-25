CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"answer_points" jsonb NOT NULL,
	"skill_tags" text[] NOT NULL,
	"difficulty" smallint NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"license" text NOT NULL,
	"search_text" text NOT NULL,
	"embedding" vector(1024),
	"embed_model" text
);
--> statement-breakpoint
CREATE TABLE "interview_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"job_target_id" uuid NOT NULL,
	"mode" text DEFAULT 'text' NOT NULL,
	"kind" text DEFAULT 'normal' NOT NULL,
	"settings" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_turns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"question_id" text,
	"is_follow_up" boolean DEFAULT false NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_job_target_id_job_targets_id_fk" FOREIGN KEY ("job_target_id") REFERENCES "public"."job_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_turns" ADD CONSTRAINT "interview_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_turns" ADD CONSTRAINT "interview_turns_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_turns" ADD CONSTRAINT "interview_turns_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_embedding_hnsw" ON "questions" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "questions_skill_tags_gin" ON "questions" USING gin ("skill_tags");--> statement-breakpoint
CREATE INDEX "questions_search_trgm" ON "questions" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "questions_difficulty_idx" ON "questions" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX "interview_sessions_user_created_idx" ON "interview_sessions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "interview_turns_session_seq_idx" ON "interview_turns" USING btree ("session_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_turns_session_idem_idx" ON "interview_turns" USING btree ("session_id","idempotency_key") WHERE "interview_turns"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "interview_turns_session_idx" ON "interview_turns" USING btree ("session_id","seq");