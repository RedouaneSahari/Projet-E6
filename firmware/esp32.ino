#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

const char* WIFI_SSID = "YOUR_SSID";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* API_URL = "http://192.168.1.10:3000/api/v1/metrics/latest";

const int ONE_WIRE_BUS = 4;
const int PH_PIN = 34;
const int TURB_PIN = 35;
const int LEVEL_PIN = 32;

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

void setup() {
  Serial.begin(115200);
  sensors.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

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

void loop() {
  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);
  float ph = readPH();
  float turbidity = readTurbidity();
  float level = readWaterLevel();

  Serial.printf("Temp: %.2f C | pH: %.2f | Turb: %.2f | Level: %.2f%%\n", tempC, ph, turbidity, level);

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(API_URL);
    http.addHeader("Content-Type", "application/json");

    String payload = String("{\"temperature\":") + tempC +
      ",\"ph\":" + ph +
      ",\"turbidity\":" + turbidity +
      ",\"water_level\":" + level + "}";

    int code = http.POST(payload);
    Serial.printf("POST status: %d\n", code);
    http.end();
  }

  delay(10000);
}
