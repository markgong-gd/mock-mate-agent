CREATE TABLE "diagnosis_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"rubric_version" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"overall" real,
	"scores" jsonb,
	"plan" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubrics" (
	"version" text PRIMARY KEY NOT NULL,
	"definition" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_score_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"score" real NOT NULL,
	"sample_count" smallint NOT NULL,
	"rubric_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weaknesses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"severity" smallint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"evidence_turn_id" uuid,
	"evidence_quote" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diagnosis_reports" ADD CONSTRAINT "diagnosis_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnosis_reports" ADD CONSTRAINT "diagnosis_reports_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_score_history" ADD CONSTRAINT "skill_score_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_score_history" ADD CONSTRAINT "skill_score_history_report_id_diagnosis_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."diagnosis_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_score_history" ADD CONSTRAINT "skill_score_history_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weaknesses" ADD CONSTRAINT "weaknesses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weaknesses" ADD CONSTRAINT "weaknesses_report_id_diagnosis_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."diagnosis_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weaknesses" ADD CONSTRAINT "weaknesses_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weaknesses" ADD CONSTRAINT "weaknesses_evidence_turn_id_interview_turns_id_fk" FOREIGN KEY ("evidence_turn_id") REFERENCES "public"."interview_turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "diagnosis_reports_session_rubric_idx" ON "diagnosis_reports" USING btree ("session_id","rubric_version");--> statement-breakpoint
CREATE INDEX "diagnosis_reports_user_created_idx" ON "diagnosis_reports" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "skill_score_history_report_tag_idx" ON "skill_score_history" USING btree ("report_id","tag");--> statement-breakpoint
CREATE INDEX "skill_score_history_user_tag_idx" ON "skill_score_history" USING btree ("user_id","tag","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "weaknesses_report_tag_idx" ON "weaknesses" USING btree ("report_id","tag");--> statement-breakpoint
CREATE INDEX "weaknesses_user_status_idx" ON "weaknesses" USING btree ("user_id","status","created_at" DESC NULLS LAST);