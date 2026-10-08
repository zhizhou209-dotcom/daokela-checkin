CREATE TABLE IF NOT EXISTS class_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  class_name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius_meters INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  student_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
  checked_in_at TEXT NOT NULL,
  distance_meters INTEGER NOT NULL
);
