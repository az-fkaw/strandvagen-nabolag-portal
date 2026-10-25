-- 0002: pictures on posts. The files live in the R2 bucket (binding IMAGES
-- in wrangler.jsonc), named <id>.jpg; this table says whose they are and
-- which post shows them. post_id stays NULL between upload and publishing;
-- pictures never published are cleared after a day.

CREATE TABLE images (
  id         TEXT PRIMARY KEY,                -- random; also the file's name
  house_id   INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,      -- order within the post
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX images_post ON images(post_id);
CREATE INDEX images_house ON images(house_id);
