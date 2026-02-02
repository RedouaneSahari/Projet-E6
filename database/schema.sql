-- Generic SQL schema (SQLite/MySQL compatible)
CREATE TABLE IF NOT EXISTS metrics (
  timestamp TEXT PRIMARY KEY,
  temperature REAL,
  ph REAL,
  turbidity REAL,
  water_level REAL,
  humidity REAL
);

-- Example query
-- SELECT * FROM metrics ORDER BY timestamp DESC LIMIT 60;
