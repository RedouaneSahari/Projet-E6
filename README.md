# Projet E6 - Bassin Connecte

Dashboard web de supervision pour un bassin aquacole connecte de type RAS miniaturise.

Le projet centralise :
- les mesures capteurs du bassin
- les commandes actionneurs via API HTTP
- les alertes web et email
- l'historique des mesures
- l'automatisation cote serveur

## Vue d'ensemble

Le projet est maintenant standardise sur une seule architecture cote ESP32 :

```text
ESP32 -> API HTTP Node.js -> dashboard web
```

Usage :
- l'ESP32 envoie ses mesures en HTTP
- l'ESP32 recupere les consignes par polling HTTP

Firmware concerne :
- [firmware/esp32.ino](c:/Users/redou/OneDrive/Documents/Projet-E6/firmware/esp32.ino)

## Fonctionnalites principales

- dashboard charge en une requete puis se met a jour en temps reel via SSE
- supervision des mesures capteurs
- historique recent
- commandes actionneurs
- alertes navigateur + email via SMTP
- journal des commandes
- automatisation serveur pour la pompe et le chauffage
- documentation utilisateur integree

## Technologies

- HTML / CSS / JS
- Node.js
- JSON, SQLite, PostgreSQL ou InfluxDB pour le stockage
- ESP32 / Arduino

## Installation

```bash
npm install
```

## Demarrage avec Docker

Demarre toute la stack :

```bash
docker compose up -d --build
```

Services exposes :
- `app` sur `http://localhost:3000`
- `postgres` sur `5432`
- `influxdb` sur `8086`

Verifier l'etat :

```bash
docker compose ps
```

Voir les logs du serveur web :

```bash
docker compose logs -f app
```

## Lancement sans Docker

```bash
node server.js
```

Puis ouvrir :

```text
http://localhost:3000
```

Important :
- ne pas lancer `node server.js` en meme temps que la stack Docker

## Publication locale avec ngrok

Si tu n'as pas de nom de domaine, la solution la plus simple est d'utiliser la variante ngrok.

Fichiers prevus pour ca :
- `docker-compose.ngrok.yml`
- `.env.ngrok.example`
- `docs/ngrok-local.md`

Cette variante :
- lance l'application en `sqlite`
- expose le site via `ngrok`
- utilise un domaine de developpement `ngrok-free.app`
- est prevue pour fonctionner avec `firmware/esp32.ino` en mode HTTP

Preparation :

```bash
cp .env.ngrok.example .env.ngrok
```

Valeurs minimales a modifier dans `.env.ngrok` :
- `NGROK_AUTHTOKEN`
- `ADMIN_PASS`
- `TECH_PASS`

Lancement local :

```bash
docker compose --env-file .env.ngrok -f docker-compose.ngrok.yml up -d --build
```

Publication ngrok une fois le token rempli :

```bash
docker compose --env-file .env.ngrok -f docker-compose.ngrok.yml --profile publish up -d
```

Verification :

```bash
docker compose --env-file .env.ngrok -f docker-compose.ngrok.yml ps
docker compose --env-file .env.ngrok -f docker-compose.ngrok.yml logs -f ngrok
```

URL publique :
- l'URL attribuee par ngrok apparait dans les logs ou dans `http://localhost:4041`

Remarques importantes :
- le plan gratuit ngrok ajoute une page d'avertissement devant le trafic HTML du navigateur
- la doc ngrok indique que cela n'affecte pas les acces API programmatiques
- le firmware HTTP doit utiliser l'URL `https://...ngrok-free.app/api/v1`

## Connexion ESP32

1. Lancer le serveur local ou la variante ngrok.
2. Configurer `API_BASE` dans [firmware/esp32.ino](c:/Users/redou/OneDrive/Documents/Projet-E6/firmware/esp32.ino).
3. Televerser [firmware/esp32.ino](c:/Users/redou/OneDrive/Documents/Projet-E6/firmware/esp32.ino).
4. L'ESP32 enverra ses mesures a `POST /api/v1/metrics`.
5. L'ESP32 lira les ordres via `GET /api/v1/device/desired-state`.

## Alertes email et notifications

- les notifications navigateur se configurent depuis le dashboard sur chaque poste
- les alertes email se configurent depuis le panneau "Canaux d'alerte"
- l'envoi d'email peut passer par SMTP ou FormSubmit cote serveur

Variables utiles :

```env
ALERT_EMAIL_MODE=formsubmit
ALERT_EMAIL_TO=
ALERT_EMAIL_FROM=
SMTP_URL=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=0
FORMSUBMIT_BASE_URL=https://formsubmit.co
FORMSUBMIT_TEMPLATE=table
FORMSUBMIT_DISABLE_CAPTCHA=1
```

## Backends de stockage

Le projet utilise **un seul backend actif a la fois** pour l'historique principal des mesures.

Le backend est choisi avec :

```env
DATA_BACKEND=json | sqlite | postgres | influx
```

Choix possibles :
- `json`
- `sqlite`
- `postgres`
- `influx`

Exemples :

```bash
DATA_BACKEND=sqlite node server.js
DATA_BACKEND=postgres node server.js
DATA_BACKEND=influx node server.js
```

Sur Windows :

```powershell
$env:DATA_BACKEND = 'sqlite'; node server.js
```

### Role de chaque backend

- `json` : fichier local simple `storage/metrics.json`
- `sqlite` : base locale `storage/metrics.sqlite`
- `postgres` : table `metrics`
- `influx` : measurement `water_metrics`

## Docker et backend actif

Dans [docker-compose.yml](c:/Users/redou/OneDrive/Documents/Projet-E6/docker-compose.yml), la stack actuelle est configuree avec :

```env
DATA_BACKEND=postgres
```

Donc dans la configuration Docker actuelle :
- le backend principal est **PostgreSQL**
- **InfluxDB** est present dans l'infrastructure, mais n'est pas le backend principal tant que `DATA_BACKEND=influx` n'est pas choisi

## Scripts utiles

```bash
npm run start:sqlite
npm run start:postgres
npm run start:influx
npm run init:postgres
npm run init:influx
```

## Variables d'environnement utiles

- `SQLITE_PATH`
- `PG_URL` ou `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`
- `INFLUX_URL`
- `INFLUX_TOKEN`
- `INFLUX_ORG`
- `INFLUX_BUCKET`
- `INFLUX_RANGE`
- `ADMIN_USER`
- `ADMIN_PASS`
- `TECH_USER`
- `TECH_PASS`
- `DEVICE_TIMEOUT_MS`
- `ALERT_EMAIL_TO`
- `ALERT_EMAIL_FROM`
- `SMTP_URL` ou `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS`

## API

Endpoints principaux :
- `GET /api/v1/system`
- `GET /api/v1/dashboard`
- `GET /api/v1/events`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/device`
- `GET /api/v1/device/desired-state`
- `GET /api/v1/metrics/latest`
- `GET /api/v1/metrics/history?limit=60`
- `POST /api/v1/metrics`
- `GET /api/v1/thresholds`
- `POST /api/v1/thresholds`
- `GET /api/v1/actuators/pump`
- `POST /api/v1/actuators/pump`
- `GET /api/v1/actuators/heater`
- `POST /api/v1/actuators/heater`
- `GET /api/v1/automation`
- `POST /api/v1/automation`
- `GET /api/v1/notifications`
- `POST /api/v1/notifications`
- `POST /api/v1/notifications/test`
- `GET /api/v1/alerts`
- `GET /api/v1/logs/actuators`

## Stockage des donnees

Selon le backend actif :
- JSON : `storage/metrics.json`
- SQLite : `storage/metrics.sqlite`
- PostgreSQL : table `metrics`
- InfluxDB : measurement `water_metrics`

Autres fichiers de l'application :
- `storage/thresholds.json`
- `storage/actuators.json`
- `storage/alerts.json`
- `storage/notifications.json`
- `storage/automation.json`
- `storage/logs/actuators.log`

## Structure du projet

- `public/` : interface web
- `public/guide-utilisateur.html` : guide utilisateur
- `public/notice-exploitation.html` : notice d'exploitation
- `db/` : adaptateurs de stockage
- `storage/` : fichiers JSON et logs
- `database/` : schemas et documentation BDD
- `firmware/` : firmwares ESP32

## Notes finales

- le dashboard ne parle pas directement a l'ESP32
- le chemin reel est : `site web -> serveur Node.js -> API HTTP -> ESP32`
- les alertes sont generees automatiquement si des seuils sont depasses
- les commandes actionneurs sont journalisees
- les seuils et l'automatisation sont modifiables seulement avec les droits adaptes
