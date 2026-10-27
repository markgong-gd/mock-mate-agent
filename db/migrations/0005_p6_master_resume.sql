DROP INDEX "resumes_job_version_idx";--> statement-breakpoint
ALTER TABLE "resumes" ALTER COLUMN "job_target_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "level" text DEFAULT 'used' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "evidence_fact_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "kind" text DEFAULT 'tailored' NOT NULL;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "quality" jsonb DEFAULT '{"version":"resume-standard@1","issues":[]}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "resumes_master_version_idx" ON "resumes" USING btree ("user_id","version") WHERE "resumes"."kind" = 'master';--> statement-breakpoint
CREATE UNIQUE INDEX "resumes_job_version_idx" ON "resumes" USING btree ("job_target_id","version") WHERE "resumes"."job_target_id" is not null;