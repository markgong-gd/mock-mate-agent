CREATE TABLE "studio_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"document" jsonb NOT NULL,
	"target_role" text DEFAULT '' NOT NULL,
	"focus" text DEFAULT 'basics' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_turns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_sessions" ADD CONSTRAINT "studio_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_turns" ADD CONSTRAINT "studio_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_turns" ADD CONSTRAINT "studio_turns_session_id_studio_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."studio_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_sessions_user_updated_idx" ON "studio_sessions" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "studio_turns_session_seq_idx" ON "studio_turns" USING btree ("session_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_turns_session_idem_idx" ON "studio_turns" USING btree ("session_id","idempotency_key") WHERE "studio_turns"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "studio_turns_session_idx" ON "studio_turns" USING btree ("session_id","seq");