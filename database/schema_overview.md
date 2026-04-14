# Schema des bases de donnees (Projet E6)

Ce schema decrit l'architecture reelle du projet.

Point important :
- l'ESP32 peut envoyer ses donnees en `HTTP` ou en `MQTT`
- le serveur Node.js centralise la validation et l'ecriture
- un seul backend de stockage est actif a la fois via `DATA_BACKEND`

## Vue d'ensemble

```text
                           +----------------------+
                           |      ESP32           |
                           | capteurs + relais    |
                           +----------+-----------+
                                      |
                    +-----------------+-----------------+
                    |                                   |
                    v                                   v
         +----------------------+          +----------------------+
         |   Mode HTTP          |          |    Mode MQTT         |
         | POST /api/v1/metrics |          | publish telemetry    |
         +----------+-----------+          +----------+-----------+
                    |                                 |
                    v                                 v
         +----------------------+          +----------------------+
         |   Server Node.js     |<---------| Broker Mosquitto     |
         | API + validation     |          | transport MQTT       |
         +----------+-----------+          +----------------------+
                    |
                    v
     +------------------------------------------------------+
     | Backend de stockage actif (un seul a la fois)        |
     +-------------------+----------------+-----------------+
                         |                |                 |
                         v                v                 v
              +----------------+  +---------------+  +------------------+
              | JSON           |  | SQLite        |  | PostgreSQL       |
              | storage/       |  | storage/      |  | table: metrics   |
              | metrics.json   |  | metrics.sqlite|  | colonnes fixes   |
              +----------------+  +---------------+  +------------------+
                         |
                         | ou
                         v
                  +----------------------+
                  | InfluxDB             |
                  | measurement:         |
                  | water_metrics        |
                  +----------------------+
```

## 1) Entree des donnees

Le projet supporte deux chemins d'entree :

- **HTTP**
  - firmware concerne : [firmware/esp32.ino](c:/Users/redou/OneDrive/Documents/Projet-E6/firmware/esp32.ino)
  - l'ESP32 envoie les mesures vers `POST /api/v1/metrics`

- **MQTT**
  - firmware concerne : [firmware/esp32_mqtt.ino](c:/Users/redou/OneDrive/Documents/Projet-E6/firmware/esp32_mqtt.ino)
  - l'ESP32 publie sur un topic MQTT
  - le serveur Node.js lit ces messages depuis Mosquitto puis enregistre les mesures

## 2) Role du serveur Node.js

Le serveur dans [server.js](c:/Users/redou/OneDrive/Documents/Projet-E6/server.js) :

- recoit les mesures HTTP ou MQTT
- valide et normalise les donnees
- met a jour l'etat du device
- declenche les alertes
- enregistre l'historique dans le backend choisi

## 3) Backends possibles

Le backend actif est choisi par :

```env
DATA_BACKEND=json | sqlite | postgres | influx
```

Le choix est gere par [db/index.js](c:/Users/redou/OneDrive/Documents/Projet-E6/db/index.js).

### JSON

- **Fichier** : `storage/metrics.json`
- **Usage** : stockage local simple, sans base externe
- **Implementation** : [db/jsonStore.js](c:/Users/redou/OneDrive/Documents/Projet-E6/db/jsonStore.js)

Exemple de mesure :

```json
{
  "timestamp": "2026-02-02T14:19:25.496Z",
  "temperature": 24.7,
  "ph": 7.43,
  "turbidity": 13.1,
  "water_level": 80.5,
  "humidity": 53.3
}
```

Remarque :
- en mode MQTT avec le firmware `esp32_mqtt.ino` actuel, `water_level` et `humidity` peuvent etre absents et rester a `null` dans l'historique

### SQLite

- **Fichier** : `storage/metrics.sqlite`
- **Table** : `metrics`
- **Schema** : [database/schema.sql](c:/Users/redou/OneDrive/Documents/Projet-E6/database/schema.sql)
- **Implementation** : [db/sqliteStore.js](c:/Users/redou/OneDrive/Documents/Projet-E6/db/sqliteStore.js)

Colonnes :
- `timestamp`
- `temperature`
- `ph`
- `turbidity`
- `water_level`
- `humidity`

### PostgreSQL

- **Base** : `projet_e6`
- **Table** : `metrics`
- **Schema** : [database/postgres.sql](c:/Users/redou/OneDrive/Documents/Projet-E6/database/postgres.sql)
- **Implementation** : [db/postgresStore.js](c:/Users/redou/OneDrive/Documents/Projet-E6/db/postgresStore.js)

Colonnes :
- `timestamp`
- `temperature`
- `ph`
- `turbidity`
- `water_level`
- `humidity`

### InfluxDB

- **Bucket** : `aquaculture`
- **Measurement** : `water_metrics`
- **Schema** : [database/influx.md](c:/Users/redou/OneDrive/Documents/Projet-E6/database/influx.md)
- **Implementation** : [db/influxStore.js](c:/Users/redou/OneDrive/Documents/Projet-E6/db/influxStore.js)

Fields :
- `temperature`
- `ph`
- `turbidity`
- `water_level`
- `humidity`

## 4) Remarque importante sur Docker

Dans [docker-compose.yml](c:/Users/redou/OneDrive/Documents/Projet-E6/docker-compose.yml), le projet est actuellement configure avec :

```env
DATA_BACKEND=postgres
```

Donc dans la stack Docker actuelle :
- le backend principal est **PostgreSQL**
- **InfluxDB** est disponible dans l'infrastructure, mais ce n'est pas le backend actif tant que `DATA_BACKEND=influx` n'est pas selectionne

## 5) Exemples de lancement

```bash
DATA_BACKEND=json node server.js
DATA_BACKEND=sqlite node server.js
DATA_BACKEND=postgres node server.js
DATA_BACKEND=influx node server.js
```

## 6) Resume

- **HTTP** et **MQTT** sont deux facons d'alimenter le serveur
- **Mosquitto** n'est utile que pour le mode MQTT
- **JSON / SQLite / PostgreSQL / InfluxDB** sont des alternatives de stockage
- **un seul backend est actif a la fois**
