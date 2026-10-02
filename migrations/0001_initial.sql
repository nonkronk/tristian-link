PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  target TEXT NOT NULL,
  description TEXT,
  password_hash TEXT,
  expire_at TEXT,
  visit_count INTEGER NOT NULL DEFAULT 0 CHECK (visit_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  owner_email TEXT,
  banned INTEGER NOT NULL DEFAULT 0 CHECK (banned IN (0, 1))
);

CREATE INDEX IF NOT EXISTS links_owner_created_idx
  ON links(owner_email, created_at DESC);

CREATE INDEX IF NOT EXISTS links_expire_idx
  ON links(expire_at)
  WHERE expire_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS legacy_visits (
  id INTEGER PRIMARY KEY,
  link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  countries_json TEXT,
  referrers_json TEXT,
  total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  br_chrome INTEGER NOT NULL DEFAULT 0,
  br_edge INTEGER NOT NULL DEFAULT 0,
  br_firefox INTEGER NOT NULL DEFAULT 0,
  br_ie INTEGER NOT NULL DEFAULT 0,
  br_opera INTEGER NOT NULL DEFAULT 0,
  br_other INTEGER NOT NULL DEFAULT 0,
  br_safari INTEGER NOT NULL DEFAULT 0,
  os_android INTEGER NOT NULL DEFAULT 0,
  os_ios INTEGER NOT NULL DEFAULT 0,
  os_linux INTEGER NOT NULL DEFAULT 0,
  os_macos INTEGER NOT NULL DEFAULT 0,
  os_other INTEGER NOT NULL DEFAULT 0,
  os_windows INTEGER NOT NULL DEFAULT 0,
  owner_email TEXT
);

CREATE INDEX IF NOT EXISTS legacy_visits_link_created_idx
  ON legacy_visits(link_id, created_at DESC);

CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,
  country TEXT,
  referrer_host TEXT,
  browser TEXT,
  os TEXT
);

CREATE INDEX IF NOT EXISTS clicks_link_occurred_idx
  ON clicks(link_id, occurred_at DESC);
