-- Live sending now needs approval. Organizations that already connected a live bot
-- were allowed to send without it, so they keep working.
UPDATE "Organization" AS o
SET "liveApprovedAt" = CURRENT_TIMESTAMP
WHERE o."liveApprovedAt" IS NULL
  AND o."status" = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "Environment" AS e
    WHERE e."orgId" = o."id" AND e."type" = 'LIVE' AND e."botTokenEncrypted" IS NOT NULL
  );
