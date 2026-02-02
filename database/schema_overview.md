# Schema des bases de donnees (Projet E6)

Ce schema explique ou sont stockees les donnees des capteurs selon le backend choisi.

```
                    +----------------------+
                    |  ESP32 (capteurs)    |
                    |  POST /api/v1/metrics|
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    |   Server Node.js     |
                    |  API + validation    |
                    +----------+-----------+
                               |
           +-------------------+-------------------+
           |                   |                   |
           v                   v                   v
   +---------------+   +----------------+   +-----------------------+
   | JSON (default)|   | SQLite (SQL)   |   | PostgreSQL (SQL)      |
   | storage/      |   | storage/       |   | table: metrics        |
   | metrics.json  |   | metrics.sqlite |   | (timestamp, values)   |
   +---------------+   +----------------+   +-----------------------+
                               |
                               v
                     +----------------------+
                     | InfluxDB (TimeSeries)|
                     | measurement:         |
                     | water_metrics        |
                     +----------------------+
```

## 1) JSON (par defaut)
- **Fichier**: `storage/metrics.json`
- **Format**: tableau d'objets JSON
- **Usage**: simple, local, sans base externe

Exemple d'une mesure:
```
{
  "timestamp": "2026-02-02T14:19:25.496Z",
  "temperature": 24.7,
  "ph": 7.43,
  "turbidity": 13.1,
  "water_level": 80.5,
  "humidity": 53.3
}
```

## 2) SQLite (SQL local)
- **Fichier**: `storage/metrics.sqlite`
- **Table**: `metrics`
- **Schema**: `database/schema.sql`

Colonnes:
- `timestamp` (TEXT, cle primaire)
- `temperature` (REAL)
- `ph` (REAL)
- `turbidity` (REAL)
- `water_level` (REAL)
- `humidity` (REAL)

## 3) PostgreSQL (SQL serveur)
- **Base**: `projet_e6`
- **Table**: `metrics`
- **Schema**: `database/postgres.sql`

Colonnes:
- `timestamp` (TIMESTAMPTZ, cle primaire)
- `temperature` (DOUBLE PRECISION)
- `ph` (DOUBLE PRECISION)
- `turbidity` (DOUBLE PRECISION)
- `water_level` (DOUBLE PRECISION)
- `humidity` (DOUBLE PRECISION)

## 4) InfluxDB (base time-series)
- **Bucket**: `aquaculture`
- **Measurement**: `water_metrics`
- **Schema**: `database/influx.md`

Champs (fields):
- `temperature`
- `ph`
- `turbidity`
- `water_level`
- `humidity`

## Choisir le backend
Variable d'environnement:
```
DATA_BACKEND=json | sqlite | postgres | influx
```

Exemples:
```
DATA_BACKEND=sqlite node server.js
DATA_BACKEND=postgres node server.js
DATA_BACKEND=influx node server.js
```
