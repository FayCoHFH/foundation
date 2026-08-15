-- AlterTable
ALTER TABLE "content_placement" ADD COLUMN     "cancelledAt" TIMESTAMP(3);

ALTER TABLE "content_placement" DROP CONSTRAINT "content_placement_window_check";
ALTER TABLE "content_placement"
  ADD CONSTRAINT "content_placement_window_check"
  CHECK (
    "endsAt" IS NULL
    OR "startsAt" < "endsAt"
    OR ("cancelledAt" IS NOT NULL AND "startsAt" = "endsAt")
  );
