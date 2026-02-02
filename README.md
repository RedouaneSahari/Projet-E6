# Projet E6 - Bassin Connecte

Dashboard web pour la supervision d'un bassin aquacole connecte (RAS miniaturise).

## Technologies
- HTML / CSS / JS (interface)
- Node.js (API REST + serveur statique)
- Arduino (exemple ESP32)
- JSON (stockage local)

## Lancement rapide
Depuis la racine du projet:

```
node server.js
```

Puis ouvrir http://localhost:3000

## Endpoints API (v1)
- GET /api/v1/metrics/latest
- GET /api/v1/metrics/history?limit=60
- GET /api/v1/thresholds
- POST /api/v1/thresholds
- GET /api/v1/actuators/pump
- POST /api/v1/actuators/pump
- GET /api/v1/actuators/heater
- POST /api/v1/actuators/heater
- GET /api/v1/alerts
- GET /api/v1/logs/actuators

## Donnees
Les donnees sont stockees en JSON dans `storage/`.
- `storage/metrics.json`
- `storage/thresholds.json`
- `storage/actuators.json`
- `storage/alerts.json`
- `storage/logs/actuators.log`

## Structure
- `public/` interface web
- `storage/` donnees et logs
- `firmware/` exemple ESP32

## Notes
- Les alertes sont generees automatiquement si un seuil est depasse.
- Les commandes pompe/chauffage sont journalisees dans `storage/logs/actuators.log`.
