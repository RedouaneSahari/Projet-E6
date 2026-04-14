-- SQLite schema
-- Utilise uniquement si DATA_BACKEND=sqlite
-- Stocke l'historique des mesures dans un fichier local: storage/metrics.sqlite

CREATE TABLE IF NOT EXISTS metrics (
  timestamp TEXT PRIMARY KEY,
  temperature REAL,
  ph REAL,
  turbidity REAL,
  water_level REAL,
  humidity REAL
);
