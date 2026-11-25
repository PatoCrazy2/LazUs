CREATE TYPE "public"."activity_category" AS ENUM('getting_to_know', 'memories', 'future', 'gratitude', 'life_values', 'music', 'romance', 'play', 'together_irl', 'daily_checkin');--> statement-breakpoint
CREATE TYPE "public"."activity_occasion" AS ENUM('daily', 'special_date', 'long_distance');--> statement-breakpoint
CREATE TYPE "public"."activity_response_type" AS ENUM('text_only', 'choice', 'scale', 'prediction', 'music', 'photo_only', 'both', 'voice');--> statement-breakpoint
CREATE TYPE "public"."activity_tone" AS ENUM('light', 'playful', 'tender', 'deep');--> statement-breakpoint
CREATE TABLE "activity_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"prompt" text NOT NULL,
	"category" "activity_category" NOT NULL,
	"tone" "activity_tone" DEFAULT 'light' NOT NULL,
	"occasion" "activity_occasion" DEFAULT 'daily' NOT NULL,
	"intensity" integer DEFAULT 1 NOT NULL,
	"response_type" "activity_response_type" DEFAULT 'text_only' NOT NULL,
	"prompt_config" jsonb,
	"special_date" varchar(16),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_prompts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "couples" ADD COLUMN "timezone" varchar(64) DEFAULT 'America/Mexico_City' NOT NULL;--> statement-breakpoint
ALTER TABLE "couples" ADD COLUMN "max_romance_intensity" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_activities" ADD COLUMN "prompt_id" uuid;--> statement-breakpoint
ALTER TABLE "daily_activities" ADD COLUMN "category" "activity_category" DEFAULT 'getting_to_know' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_activities" ADD COLUMN "tone" "activity_tone" DEFAULT 'light' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_activities" ADD COLUMN "occasion" "activity_occasion" DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_activities" ADD COLUMN "response_type" "activity_response_type" DEFAULT 'text_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_activities" ADD COLUMN "prompt_config" jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "payload" jsonb;--> statement-breakpoint
CREATE INDEX "idx_activity_prompts_special_date" ON "activity_prompts" USING btree ("special_date");--> statement-breakpoint
CREATE INDEX "idx_activity_prompts_category" ON "activity_prompts" USING btree ("category");--> statement-breakpoint
ALTER TABLE "daily_activities" ADD CONSTRAINT "daily_activities_prompt_id_activity_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."activity_prompts"("id") ON DELETE set null ON UPDATE no action;