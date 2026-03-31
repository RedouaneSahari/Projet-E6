# Firmware files

- `esp32_mqtt.ino`: main firmware for this project (`ESP32 <-> MQTT Mosquitto <-> site`). It sends telemetry, receives commands, and publishes its connection state.
- `esp32.ino`: HTTP fallback firmware. It posts telemetry to the API and polls `/api/v1/device/desired-state` to apply commands from the site.
- `esp32_mqtt.txt`: legacy text copy of MQTT code. Keep only as reference, do not edit.

Recommended mode:
- Docker + Mosquitto: use `esp32_mqtt.ino`
- API only, no MQTT broker: use `esp32.ino`

Topics used by `esp32_mqtt.ino`:
- telemetry: `tp/esp32/telemetry`
- commands: `tp/esp32/cmd`

Pins to review before flashing:
- `RELAY_PUMP`
- `RELAY_HEATER`
- `ONE_WIRE_BUS`
- `PH_PIN`
- `TURBIDITY_PIN`
- `WATER_LEVEL_PIN`

Notes:
- the MQTT firmware now matches the exact connection code provided by the user
- command format is plain text: `PUMP_ON`, `PUMP_OFF`, `HEATER_ON`, `HEATER_OFF`
- telemetry sends raw ADC values for pH, turbidity and water level; the Node server converts them for the dashboard
