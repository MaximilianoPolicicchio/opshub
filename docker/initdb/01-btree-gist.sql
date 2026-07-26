-- Runs once, when Postgres initialises an empty data volume.
--
-- The TimeEntry overlap guard is a GiST exclusion constraint over
-- (userId, tstzrange). GiST has no built-in equality operator class for text,
-- so btree_gist is required before that migration can be applied.
CREATE EXTENSION IF NOT EXISTS btree_gist;
