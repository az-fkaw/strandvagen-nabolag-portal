-- 0003: a post remembers its latest activity (published, or its newest
-- comment), so a post with a new comment comes back to the top of the board.

ALTER TABLE posts ADD COLUMN activity_at TEXT;
UPDATE posts SET activity_at = COALESCE(
  (SELECT MAX(c.created_at) FROM comments c WHERE c.post_id = posts.id), created_at);
DROP INDEX posts_order;
CREATE INDEX posts_order ON posts(pinned DESC, activity_at DESC);
CREATE INDEX comments_new ON comments(created_at);
CREATE INDEX events_new ON events(created_at);
