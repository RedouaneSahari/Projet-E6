#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

/* ===== WIFI ===== */
const char* WIFI_SSID = "CFAINSTA_STUDENTS";
const char* WIFI_PASS = "Cf@InSt@-$tUd3nT";

/* ===== MQTT ===== */
const char* MQTT_HOST = "172.16.8.6";
const int MQTT_PORT = 1883;

const char* TOPIC_TELEMETRY = "tp/esp32/telemetry";
const char* TOPIC_CMD = "tp/esp32/cmd";

/* ===== PIN ===== */

#define RELAY_PUMP 26
#define RELAY_HEATER 27

#define PH_PIN 34
#define TURBIDITY_PIN 35
#define WATER_LEVEL_PIN 32

#define ONE_WIRE_BUS 4

/* ===== CAPTEUR TEMPERATURE ===== */

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

/* ===== VARIABLES ===== */

WiFiClient espClient;
PubSubClient mqtt(espClient);

unsigned long lastSend = 0;
int counter = 0;

bool pumpState = false;
bool heaterState = false;

/* ===== SEUILS AUTOMATISATION ===== */

float TEMP_MIN = 22.0;
float TEMP_MAX = 26.0;

int LEVEL_MIN = 1000;
int TURBIDITY_MAX = 2500;

/* ===== MQTT CALLBACK ===== */

void onMessage(char* topic, byte* payload, unsigned int length) {
  String msg;

  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  Serial.println("MQTT MESSAGE:");
  Serial.println(msg);

  if (String(topic) == TOPIC_CMD) {
    if (msg == "PUMP_ON") {
      digitalWrite(RELAY_PUMP, HIGH);
      pumpState = true;
    } else if (msg == "PUMP_OFF") {
      digitalWrite(RELAY_PUMP, LOW);
      pumpState = false;
    } else if (msg == "HEATER_ON") {
      digitalWrite(RELAY_HEATER, HIGH);
      heaterState = true;
    } else if (msg == "HEATER_OFF") {
      digitalWrite(RELAY_HEATER, LOW);
      heaterState = false;
    }
  }
}

/* ===== WIFI ===== */

void connectWiFi() {
  Serial.print("Connexion WiFi");

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connecté");
  Serial.println(WiFi.localIP());
}

/* ===== MQTT ===== */

void connectMQTT() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);

  while (!mqtt.connected()) {
    String clientId = "ESP32-" + String((uint32_t)ESP.getEfuseMac(), HEX);

    Serial.println("Connexion MQTT...");

    if (mqtt.connect(clientId.c_str())) {
      Serial.println("MQTT connecté");
      mqtt.subscribe(TOPIC_CMD);
    } else {
      Serial.print("Erreur MQTT ");
      Serial.println(mqtt.state());
      delay(2000);
    }
  }
}

/* ===== SETUP ===== */

void setup() {
  Serial.begin(115200);

  pinMode(RELAY_PUMP, OUTPUT);
  pinMode(RELAY_HEATER, OUTPUT);

  digitalWrite(RELAY_PUMP, LOW);
  digitalWrite(RELAY_HEATER, LOW);

  pinMode(PH_PIN, INPUT);
  pinMode(TURBIDITY_PIN, INPUT);
  pinMode(WATER_LEVEL_PIN, INPUT);

  sensors.begin();

  connectWiFi();
  connectMQTT();
}

/* ===== LOOP ===== */

void loop() {
  if (!mqtt.connected()) {
    connectMQTT();
  }

  mqtt.loop();

  unsigned long now = millis();

  if (now - lastSend >= 2000) {
    lastSend = now;
    counter++;

    /* ===== LECTURE CAPTEURS ===== */

    int phADC = analogRead(PH_PIN);
    int turbidity = analogRead(TURBIDITY_PIN);
    int waterLevel = analogRead(WATER_LEVEL_PIN);

    sensors.requestTemperatures();
    float temperature = sensors.getTempCByIndex(0);

    /* ===== AUTOMATISATION ===== */

    if (temperature < TEMP_MIN) {
      digitalWrite(RELAY_HEATER, HIGH);
      heaterState = true;
    }

    if (temperature > TEMP_MAX) {
      digitalWrite(RELAY_HEATER, LOW);
      heaterState = false;
    }

    if (waterLevel < LEVEL_MIN) {
      digitalWrite(RELAY_PUMP, LOW);
      pumpState = false;
    }

    if (turbidity > TURBIDITY_MAX) {
      digitalWrite(RELAY_PUMP, HIGH);
      pumpState = true;
    }

    /* ===== JSON MQTT ===== */

    String payload = "{";

    payload += "\"counter\":" + String(counter) + ",";
    payload += "\"temperature\":" + String(temperature) + ",";
    payload += "\"ph_adc\":" + String(phADC) + ",";
    payload += "\"turbidity\":" + String(turbidity) + ",";
    payload += "\"water_level\":" + String(waterLevel) + ",";
    payload += "\"pump_state\":" + String(pumpState ? 1 : 0) + ",";
    payload += "\"heater_state\":" + String(heaterState ? 1 : 0) + ",";
    payload += "\"rssi\":" + String(WiFi.RSSI());

    payload += "}";

    Serial.println(payload);

    mqtt.publish(TOPIC_TELEMETRY, payload.c_str());
  }
}
