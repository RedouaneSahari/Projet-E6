-- PostgreSQL schema
CREATE TABLE IF NOT EXISTS metrics (
  timestamp TIMESTAMPTZ PRIMARY KEY,
  temperature DOUBLE PRECISION,
  ph DOUBLE PRECISION,
  turbidity DOUBLE PRECISION,
  water_level DOUBLE PRECISION,
  humidity DOUBLE PRECISION
);

-- Example query
-- SELECT * FROM metrics ORDER BY timestamp DESC LIMIT 60;
