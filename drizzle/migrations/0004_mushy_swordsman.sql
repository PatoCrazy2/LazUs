CREATE TYPE "public"."weekly_collage_status" AS ENUM('ready', 'rendered');--> statement-breakpoint
CREATE TABLE "weekly_collages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL,
	"week_start_date" varchar(10) NOT NULL,
	"week_end_date" varchar(10) NOT NULL,
	"status" "weekly_collage_status" DEFAULT 'ready' NOT NULL,
	"media_key" varchar(512),
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activities_count" integer DEFAULT 0 NOT NULL,
	"rendered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_collages" ADD CONSTRAINT "weekly_collages_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_weekly_collages_couple_week" ON "weekly_collages" USING btree ("couple_id","week_start_date");--> statement-breakpoint
CREATE INDEX "idx_weekly_collages_couple_created" ON "weekly_collages" USING btree ("couple_id","created_at");