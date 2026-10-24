-- The whole schema. One row in `houses` is one login, shared by everyone
-- living there; is_admin marks the administrator(s).
-- Timestamps are UTC ('2026-10-24T15:30:12.345Z'). Event dates and times are
-- local Norwegian time exactly as typed ('2026-05-02', '10:00').
-- To change the schema later, add 0002_....sql; never edit this file.

CREATE TABLE houses (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  residents      TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  about          TEXT NOT NULL DEFAULT '',
  is_admin       INTEGER NOT NULL DEFAULT 0,
  password_hash  TEXT,            -- NULL until the invitation is used
  invite_hash    TEXT UNIQUE,     -- SHA-256 of the invitation link's secret
  invite_expires TEXT,
  failed_logins  INTEGER NOT NULL DEFAULT 0,
  locked_until   TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,    -- SHA-256 of the cookie's secret
  house_id   INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_house ON sessions(house_id);

CREATE TABLE posts (
  id         INTEGER PRIMARY KEY,
  house_id   INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  author     TEXT NOT NULL DEFAULT '',   -- optional name of who in the house wrote it
  category   TEXT NOT NULL,
  body       TEXT NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  edited_at  TEXT
);
CREATE INDEX posts_order ON posts(pinned DESC, id DESC);

CREATE TABLE comments (
  id         INTEGER PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  house_id   INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  author     TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX comments_post ON comments(post_id);

CREATE TABLE events (
  id          INTEGER PRIMARY KEY,
  house_id    INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,
  start_date  TEXT NOT NULL,              -- 'YYYY-MM-DD'
  start_time  TEXT NOT NULL DEFAULT '',   -- 'HH:MM'; '' = all day
  end_date    TEXT NOT NULL DEFAULT '',   -- '' = same day
  end_time    TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX events_start ON events(start_date);

CREATE TABLE event_rsvps (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  house_id INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, house_id)
);

CREATE TABLE links (
  id          INTEGER PRIMARY KEY,
  grp         TEXT NOT NULL DEFAULT '',
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

-- What the administrator changes on the Admin page: name, tagline, welcome,
-- theme. Missing keys fall back to `defaults` in portal.config.js.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
