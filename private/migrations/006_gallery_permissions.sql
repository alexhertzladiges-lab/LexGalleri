CREATE TABLE IF NOT EXISTS gallery_editors (
 gallery_id CHAR(32) NOT NULL, user_id CHAR(32) NOT NULL,
 PRIMARY KEY(gallery_id,user_id),
 FOREIGN KEY(gallery_id,user_id) REFERENCES grants(gallery_id,user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS invitation_galleries (
 token CHAR(64) NOT NULL, gallery_id CHAR(32) NOT NULL,
 upload TINYINT NOT NULL DEFAULT 0, edit_metadata TINYINT NOT NULL DEFAULT 0,
 download TINYINT NOT NULL DEFAULT 0, gps TINYINT NOT NULL DEFAULT 0,
 PRIMARY KEY(token,gallery_id),
 FOREIGN KEY(token) REFERENCES invitations(token) ON DELETE CASCADE,
 FOREIGN KEY(gallery_id) REFERENCES galleries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
