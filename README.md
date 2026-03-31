# Projet E6 - Bassin Connecte

Dashboard web pour la supervision d'un bassin aquacole connecte (RAS miniaturise).

Ameliorations principales:
- tableau de bord charge en une requete puis recoit les mises a jour en temps reel (SSE)
- cache memoire cote serveur pour reduire les lectures disque
- commandes site -> ESP32 via MQTT texte (`PUMP_ON`, `PUMP_OFF`, `HEATER_ON`, `HEATER_OFF`)
- alertes navigateur + alertes email via SMTP configurable
- documentation utilisateur integree avec guide et notice d'exploitation
- mode de secours HTTP avec polling de l'etat desire

## Technologies
- HTML / CSS / JS (interface)
- Node.js (API REST + serveur statique)
- SQL (SQLite), PostgreSQL, InfluxDB (stockage capteurs)
- Arduino (exemple ESP32)

## Installation
```
npm install
```

## Demarrage complet avec Docker (ESP32 + MQTT + site)
Lance toute la stack avec une seule commande:
```
docker compose up -d --build
```

Services demarres:
- `projet-e6-app` (site + API) sur `http://localhost:3000`
- `projet-e6-mosquitto` (broker MQTT) sur `1883`
- `projet-e6-postgres` sur `5432`
- `projet-e6-influx` sur `8086`

Verifier l'etat:
```
docker compose ps
```

Voir les logs du serveur web:
```
docker compose logs -f app
```

## Lancement rapide
```
node server.js
```

Puis ouvrir http://localhost:3000

Important:
- Si tu utilises le mode Docker ci-dessus, ne lance pas `node server.js` en meme temps.
- Le conteneur `app` est deja configure pour lire MQTT via `mqtt://mosquitto:1883`.

## MQTT (Mosquitto)
Le serveur ecoute aussi les mesures publiees sur un broker MQTT.

Topic par defaut:
```
tp/esp32/telemetry
```

Topics supplementaires:
```
tp/esp32/cmd
tp/esp32/state
```

Exemple de message JSON publie:
```
{"counter":12,"temperature":24.6,"ph_adc":2015,"turbidity":1580,"water_level":2120,"pump_state":1,"heater_state":0,"rssi":-54}
```

Variables (.env.example):
```
MQTT_ENABLED=1
MQTT_URL=mqtt://localhost:1883
MQTT_TOPIC=tp/esp32/telemetry
MQTT_COMMAND_TOPIC=tp/esp32/cmd
MQTT_STATE_TOPIC=tp/esp32/state
MQTT_CLIENT_ID=projet-e6-server
MQTT_DEVICE_TIMEOUT_MS=30000
ALERT_EMAIL_TO=
ALERT_EMAIL_FROM=
SMTP_URL=
```

## Alertes email et notifications
- Les alertes navigateur se configurent depuis le dashboard sur chaque poste.
- Les alertes email se configurent depuis le panneau "Canaux d'alerte" et necessitent un SMTP cote serveur.
- Un email de test peut etre envoye depuis l'interface admin si `SMTP_URL` ou `SMTP_HOST` est configure.

## Connexion ESP32 vers Docker Mosquitto
1. Laisse Docker tourner (`docker compose up -d`).
2. Recupere l'IP locale de ton PC (PowerShell):
```
ipconfig
```
3. Dans `firmware/esp32_mqtt.ino`, mets cette IP dans `MQTT_HOST`.
4. Garde les topics `tp/esp32/telemetry` et `tp/esp32/cmd` (le topic `tp/esp32/state` est optionnel).
5. Televerse le code sur l'ESP32.
6. Verifie les donnees recues:
```
docker compose logs -f app
```
Tu dois voir `MQTT connected`, puis les mesures ESP32 dans le dashboard. Les boutons pompe/chauffage enverront ensuite `PUMP_ON`, `PUMP_OFF`, `HEATER_ON` ou `HEATER_OFF` sur `tp/esp32/cmd`.

## Mode HTTP sans MQTT
Si tu n'utilises pas Mosquitto:
1. Lance le serveur avec `MQTT_ENABLED=0`.
2. Configure `API_BASE` dans `firmware/esp32.ino`.
3. Televerse `firmware/esp32.ino`.
4. L'ESP32 enverra ses mesures sur `/api/v1/metrics` et viendra lire les ordres sur `/api/v1/device/desired-state`.

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
- `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM`, `SMTP_URL` ou `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS`
- Le serveur convertit automatiquement `ph_adc`, `water_level` et `turbidity` de ton firmware en valeurs affichables dans le dashboard.

Les schemas sont dans `database/`.

## Endpoints API (v1)
- GET /api/v1/system
- GET /api/v1/dashboard
- GET /api/v1/events
- GET /api/v1/notifications
- POST /api/v1/notifications
- POST /api/v1/notifications/test
- GET /api/v1/auth/me
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- GET /api/v1/device
- GET /api/v1/device/desired-state
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
- `public/guide-utilisateur.html` guide de prise en main
- `public/notice-exploitation.html` notice operative
- `db/` adaptateurs de stockage
- `storage/` donnees et logs JSON
- `database/` schemas SQL/Influx
- `firmware/` exemple ESP32

## Notes
- Les alertes sont generees automatiquement si un seuil est depasse.
- Les commandes pompe/chauffage sont journalisees dans `storage/logs/actuators.log`.
- Les seuils et actionneurs sont modifiables uniquement en mode admin.
- Le dashboard suit l'etat de l'ESP32 et degrade automatiquement vers le polling HTTP si MQTT n'est pas disponible.
- Avec le firmware MQTT exact fourni, le site pilote uniquement `ON/OFF`. Le bouton de mode reste informatif car le firmware gere l'automatisation localement.
