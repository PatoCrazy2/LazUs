CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TABLE "couple_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inviter_user_id" uuid NOT NULL,
	"couple_id" uuid,
	"invitation_code" varchar(64) NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "couple_invitations_invitation_code_unique" UNIQUE("invitation_code")
);
--> statement-breakpoint
ALTER TABLE "couple_invitations" ADD CONSTRAINT "couple_invitations_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couple_invitations" ADD CONSTRAINT "couple_invitations_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couple_invitations" ADD CONSTRAINT "couple_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_couple_invitations_code" ON "couple_invitations" USING btree ("invitation_code");--> statement-breakpoint
CREATE INDEX "idx_couple_invitations_inviter" ON "couple_invitations" USING btree ("inviter_user_id");--> statement-breakpoint
CREATE INDEX "idx_nfc_tags_owner" ON "nfc_tags" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_nfc_tags_couple" ON "nfc_tags" USING btree ("couple_id");