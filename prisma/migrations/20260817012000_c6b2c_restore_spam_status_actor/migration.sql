-- Permit an audited administrator to be the status changer when a spam
-- submission is restored to RECEIVED. Initial receipt still has no actor;
-- non-RECEIVED lifecycle states still require one.
ALTER TABLE "public_story_submission"
  DROP CONSTRAINT "public_story_submission_status_actor_check";

ALTER TABLE "public_story_submission"
  ADD CONSTRAINT "public_story_submission_status_actor_check" CHECK (
    "status" = 'RECEIVED' OR "statusChangedByAdminUserId" IS NOT NULL
  );
