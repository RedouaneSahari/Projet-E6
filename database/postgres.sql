-- PostgreSQL schema
-- Utilise uniquement si DATA_BACKEND=postgres
-- Stocke l'historique des mesures dans la table metrics

CREATE TABLE IF NOT EXISTS metrics (
  timestamp TIMESTAMPTZ PRIMARY KEY,
  temperature DOUBLE PRECISION,
  ph DOUBLE PRECISION,
  turbidity DOUBLE PRECISION,
  water_level DOUBLE PRECISION,
  humidity DOUBLE PRECISION
);
