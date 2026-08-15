-- Cancelled assignments retain their originally scheduled interval as audit
-- history. They are excluded from effective-window overlap enforcement.
ALTER TABLE "content_placement" DROP CONSTRAINT "content_placement_window_check";
ALTER TABLE "content_placement"
  ADD CONSTRAINT "content_placement_window_check"
  CHECK ("endsAt" IS NULL OR "startsAt" < "endsAt");

ALTER TABLE "content_placement"
  DROP CONSTRAINT "content_placement_no_overlapping_windows";
ALTER TABLE "content_placement"
  ADD CONSTRAINT "content_placement_no_overlapping_windows"
  EXCLUDE USING gist (
    "key" WITH =,
    tsrange("startsAt", COALESCE("endsAt", 'infinity'::timestamp), '[)') WITH &&
  ) WHERE ("cancelledAt" IS NULL);

-- The preceding corrective migration could only have produced a zero-length
-- cancelled interval. Restore its open-ended scheduling intent safely.
UPDATE "content_placement"
SET "endsAt" = NULL
WHERE "cancelledAt" IS NOT NULL AND "endsAt" = "startsAt";
