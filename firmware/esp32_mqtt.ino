#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// === A REMPLACER ===
const char* WIFI_SSID = "YOUR_SSID";
const char* WIFI_PASS = "YOUR_PASSWORD";
// IP du PC qui heberge le broker Mosquitto (meme reseau que l'ESP32)
const char* MQTT_HOST = "192.168.1.10";
const int MQTT_PORT = 1883;
const char* MQTT_TOPIC = "e6/bassin/metrics";

// === CAPTEURS ===
const int ONE_WIRE_BUS = 4;  // DS18B20
const int PH_PIN = 34;       // capteur pH (analog)
const int TURB_PIN = 35;     // capteur turbidite (analog)
const int LEVEL_PIN = 32;    // capteur niveau d'eau (analog)

WiFiClient espClient;
PubSubClient mqttClient(espClient);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

float readPH() {
  int raw = analogRead(PH_PIN);
  return (raw / 4095.0) * 14.0; // a calibrer
}

float readTurbidity() {
  int raw = analogRead(TURB_PIN);
  return (raw / 4095.0) * 40.0; // a calibrer
}

float readWaterLevel() {
  int raw = analogRead(LEVEL_PIN);
  return (raw / 4095.0) * 100.0; // 0-100%
}

float readHumidity() {
  return 50.0;
}

void connectWifi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

void connectMqtt() {
  while (!mqttClient.connected()) {
    String clientId = "esp32-e6-" + String(random(0xffff), HEX);
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("MQTT connected");
    } else {
      Serial.print("MQTT failed, rc=");
      Serial.println(mqttClient.state());
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  sensors.begin();
  connectWifi();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }
  if (!mqttClient.connected()) {
    connectMqtt();
  }
  mqttClient.loop();

  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);
  float ph = readPH();
  float turbidity = readTurbidity();
  float level = readWaterLevel();
  float humidity = readHumidity();

  char payload[192];
  snprintf(payload, sizeof(payload),
           "{\"temperature\":%.2f,\"ph\":%.2f,\"turbidity\":%.2f,\"water_level\":%.2f,\"humidity\":%.2f}",
           tempC, ph, turbidity, level, humidity);

  mqttClient.publish(MQTT_TOPIC, payload);
  Serial.println(payload);

  delay(10000);
}
