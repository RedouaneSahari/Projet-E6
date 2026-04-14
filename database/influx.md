# InfluxDB dans le projet

`InfluxDB` est un backend de stockage **alternatif** pour les mesures du bassin.

Il n'est pas utilise en meme temps que `JSON`, `SQLite` ou `PostgreSQL` pour l'historique principal.
Le backend actif est choisi via :

```env
DATA_BACKEND=influx
```

Si `DATA_BACKEND=postgres`, alors InfluxDB peut exister dans la stack Docker sans etre le stockage principal utilise par le serveur.

## Measurement

- measurement : `water_metrics`
- bucket recommande : `aquaculture`
- retention suggeree : `30d`

## Fields enregistres

- `temperature` (float)
- `ph` (float)
- `turbidity` (float)
- `water_level` (float, optionnel selon le firmware)
- `humidity` (float, optionnel selon le firmware)

## Origine des donnees

Les mesures peuvent arriver au serveur Node.js par deux chemins :

- **HTTP**
  - firmware : [esp32.ino](c:/Users/redou/OneDrive/Documents/Projet-E6/firmware/esp32.ino)
  - route : `POST /api/v1/metrics`

- **MQTT**
  - firmware : [esp32_mqtt.ino](c:/Users/redou/OneDrive/Documents/Projet-E6/firmware/esp32_mqtt.ino)
  - l'ESP32 publie sur un topic MQTT
  - le serveur lit le message puis enregistre la mesure dans InfluxDB si `DATA_BACKEND=influx`

## Variables d'environnement requises

```env
INFLUX_URL=http://localhost:8086
INFLUX_TOKEN=...
INFLUX_ORG=projet-e6
INFLUX_BUCKET=aquaculture
```

## Structure logique d'une mesure

Exemple logique :

```json
{
  "timestamp": "2026-02-02T14:19:25.496Z",
  "temperature": 24.7,
  "ph": 7.43,
  "turbidity": 13.1
}
```

Le firmware MQTT actuel `esp32_mqtt.ino` publie un payload reduit centre sur `temperature`, `ph`, `turbidity`, `pump` et `mode`.

## Remarque projet

Dans la configuration Docker actuelle, le projet est regle sur `DATA_BACKEND=postgres`.
Donc InfluxDB est disponible dans l'infrastructure, mais pas selectionne comme backend principal tant que cette variable n'est pas changee.
