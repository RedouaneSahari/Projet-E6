#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>


const char* WIFI_SSID = "CFAINSTA-STUDENTS";
const char* WIFI_PASS = "Cf@InSt@-$tUd3nT";
const char* MQTT_HOST = "172.16.8.82";
const int MQTT_PORT = 1883;
const char* MQTT_TOPIC = "e6/bassin/metrics";


const int ONE_WIRE_BUS = 4; 
const int PH_PIN = 34;       
const int TURB_PIN = 35;     
const int LEVEL_PIN = 32;    

WiFiClient espClient;
PubSubClient mqttClient(espClient);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

float readPH() {
  int raw = analogRead(PH_PIN);
  return (raw / 4095.0) * 14.0; 
}

float readTurbidity() {
  int raw = analogRead(TURB_PIN);
  return (raw / 4095.0) * 40.0; 
}

float readWaterLevel() {
  int raw = analogRead(LEVEL_PIN);
  return (raw / 4095.0) * 100.0; 
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
