# Projet E6 - Bassin Connecte

Dashboard web pour la supervision d'un bassin aquacole connecte (RAS miniaturise).

## Technologies
- HTML / CSS / JS (interface)
- Node.js (API REST + serveur statique)
- SQL (SQLite), PostgreSQL, InfluxDB (stockage capteurs)
- Arduino (exemple ESP32)

## Installation
```
npm install
```

## Lancement rapide
```
node server.js
```

Puis ouvrir http://localhost:3000

## MQTT (Mosquitto)
Le serveur ecoute aussi les mesures publiees sur un broker MQTT.

Topic par defaut:
```
e6/bassin/metrics
```

Exemple de message JSON publie:
```
{"temperature":24.6,"ph":7.21,"turbidity":13.8,"water_level":78.2,"humidity":52.1}
```

Variables (.env.example):
```
MQTT_ENABLED=1
MQTT_URL=mqtt://localhost:1883
MQTT_TOPIC=e6/bassin/metrics
MQTT_CLIENT_ID=projet-e6-server
```

## Scripts utiles
```
npm run start:sqlite
npm run start:postgres
npm run start:influx
npm run init:postgres
npm run init:influx
```

## Backend donnees (capteurs)
Choisir le backend avec la variable d'environnement `DATA_BACKEND`:
- `json` (par defaut)
- `sqlite`
- `postgres`
- `influx`

Exemples:
```
DATA_BACKEND=sqlite node server.js
DATA_BACKEND=postgres node server.js
DATA_BACKEND=influx node server.js
```

Sur Windows, utilisez les scripts npm ci-dessus ou:
```
$env:DATA_BACKEND = 'sqlite'; node server.js
```

## Demarrage automatique (Windows)
Lance tout (deps, Docker, init DB, serveur):
```
powershell -ExecutionPolicy Bypass -File .\start-all.ps1 -Backend postgres -KillExisting
```
Backends possibles: `json`, `sqlite`, `postgres`, `influx`

Notes:
- Si Docker n'est pas pret, le script bascule automatiquement en `sqlite`.
- Pour InfluxDB, definir `INFLUX_TOKEN` dans `.env` (sinon init ignore).

Variables utiles (.env.example):
- `SQLITE_PATH` (ex: storage/metrics.sqlite)
- `PG_URL` ou `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`
- `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_ORG`, `INFLUX_BUCKET`, `INFLUX_RANGE`
- `ADMIN_USER`, `ADMIN_PASS` (connexion admin)
- `MQTT_URL`, `MQTT_TOPIC`, `MQTT_CLIENT_ID`

Les schemas sont dans `database/`.

## Endpoints API (v1)
- GET /api/v1/system
- GET /api/v1/auth/me
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- GET /api/v1/metrics/latest
- GET /api/v1/metrics/history?limit=60
- POST /api/v1/metrics
- GET /api/v1/thresholds
- POST /api/v1/thresholds
- GET /api/v1/actuators/pump
- POST /api/v1/actuators/pump
- GET /api/v1/actuators/heater
- POST /api/v1/actuators/heater
- GET /api/v1/alerts
- GET /api/v1/logs/actuators

## Donnees
Les donnees sont stockees selon le backend:
- JSON: `storage/metrics.json`
- SQLite: `storage/metrics.sqlite`
- PostgreSQL: table `metrics`
- InfluxDB: mesure `water_metrics`

## Structure
- `public/` interface web
- `db/` adaptateurs de stockage
- `storage/` donnees et logs JSON
- `database/` schemas SQL/Influx
- `firmware/` exemple ESP32

## Notes
- Les alertes sont generees automatiquement si un seuil est depasse.
- Les commandes pompe/chauffage sont journalisees dans `storage/logs/actuators.log`.
- Les seuils et actionneurs sont modifiables uniquement en mode admin.
