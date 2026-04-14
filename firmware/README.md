# Firmware files

Le projet utilise maintenant un seul firmware cote ESP32 :

## `esp32.ino`

Architecture :

```text
ESP32 -> API HTTP Node.js -> dashboard
```

Usage :
- l'ESP32 envoie sa telemetrie a l'API HTTP
- l'ESP32 recupere les consignes via polling HTTP
- ce sketch est aligne sur une configuration **pompe uniquement**

Configuration a verifier avant flash :
- `WIFI_SSID`
- `WIFI_PASS`
- `API_BASE`
- `DEVICE_ID`
- `FIRMWARE_VERSION`

Routes utilisees :
- `POST /api/v1/metrics`
- `GET /api/v1/device/desired-state`

Broches actuellement utilisees :
- `ONE_WIRE_BUS`
- `PH_PIN`
- `TURB_PIN`
- `PUMP_RELAY_PIN`

Point important :
- le dashboard ne parle pas directement a l'ESP32
- le chemin reel est : `site web -> serveur Node.js -> API HTTP -> ESP32`
