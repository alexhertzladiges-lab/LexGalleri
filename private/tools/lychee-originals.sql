-- Lychee 6.6.12: look up a preserved original by its filename.
-- Run in phpMyAdmin's SQL tab with the LYCHEE database selected.
-- Replace DIT_FILNAVN.jpg below. Keep any results private.
-- If your tables have a prefix, add it to the five table names below.
-- SELECT only: no data or schema changes, no account/password fields.
-- Only size_variants.type=0 (ORIGINAL) is considered. Derivatives are ignored.
-- Multiple rows can reflect several album memberships or filename matches.
-- This reports recorded paths; it cannot check whether files still exist.

SELECT
    p.id AS photo_id,
    p.title AS photo_title,
    p.taken_at,
    p.latitude,
    p.longitude,
    sv.short_path AS original_path,
    sv.storage_disk,
    a.id AS album_id,
    b.title AS album_title,
    a.parent_id AS parent_album_id
FROM photos p
JOIN size_variants sv ON sv.photo_id = p.id AND sv.type = 0
LEFT JOIN photo_album pa ON pa.photo_id = p.id
LEFT JOIN albums a ON a.id = pa.album_id
LEFT JOIN base_albums b ON b.id = a.id
WHERE SUBSTRING_INDEX(sv.short_path, '/', -1) = 'DIT_FILNAVN.jpg'
ORDER BY p.id, a.id;
