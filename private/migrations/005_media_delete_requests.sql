CREATE TABLE IF NOT EXISTS media_delete_requests (
 id CHAR(32) PRIMARY KEY,
 photo_id CHAR(32) NOT NULL,
 gallery_id CHAR(32) NOT NULL,
 gallery_name VARCHAR(100) NOT NULL,
 requester_id CHAR(32) NOT NULL,
 requester_name VARCHAR(100) NOT NULL,
 title VARCHAR(200) NOT NULL,
 mime VARCHAR(50) NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending',
 created VARCHAR(32) NOT NULL,
 updated VARCHAR(32) NOT NULL,
 resolved_by CHAR(32) NULL,
 resolved_at VARCHAR(32) NULL,
 KEY media_delete_pending (status,created),
 KEY media_delete_photo (photo_id,status),
 KEY media_delete_requester (requester_id,created)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
