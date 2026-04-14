#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <OneWire.h>
#include <DallasTemperature.h>

const char* WIFI_SSID = "Iphone_Younes";
const char* WIFI_PASS = "younes92";
const char* API_BASE = "https://loise-metalinguistic-amada.ngrok-free.dev/api/v1";
const char* DEVICE_ID = "esp32-http-01";
const char* FIRMWARE_VERSION = "http-remote-pump-v2";

const int ONE_WIRE_BUS = 26;
const int PH_PIN = 34;
const int TURB_PIN = 35;
const int PUMP_RELAY_PIN = 27;

const bool RELAY_ACTIVE_LOW = false;
const unsigned long WIFI_RETRY_MS = 5000;
const unsigned long TELEMETRY_INTERVAL_MS = 10000;
const unsigned long COMMAND_POLL_INTERVAL_MS = 2500;

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
WiFiClient wifiClient;
WiFiClientSecure wifiSecureClient;

bool pumpOn = false;
bool pumpManual = false;

unsigned long lastWifiAttemptMs = 0;
unsigned long lastTelemetryMs = 0;
unsigned long lastCommandPollMs = 0;

void writeRelay(int pin, bool enabled) {
  digitalWrite(pin, RELAY_ACTIVE_LOW ? !enabled : enabled);
}

void applyOutputs() {
  writeRelay(PUMP_RELAY_PIN, pumpOn);
}

bool beginApiRequest(HTTPClient& http, const String& url) {
  if (url.startsWith("https://")) {
    // Demo setup: trust the public TLS endpoint without pinning a CA certificate.
    wifiSecureClient.setInsecure();
    return http.begin(wifiSecureClient, url);
  }
  return http.begin(wifiClient, url);
}

String extractJsonString(const String& json, const char* key) {
  String pattern = String("\"") + key + "\":";
  int keyIndex = json.indexOf(pattern);
  if (keyIndex < 0) {
    return "";
  }

  int valueStart = keyIndex + pattern.length();
  while (valueStart < json.length() && (json[valueStart] == ' ' || json[valueStart] == '\n' || json[valueStart] == '\r')) {
    valueStart++;
  }

  if (valueStart >= json.length()) {
    return "";
  }

  if (json[valueStart] == '"') {
    valueStart++;
    int valueEnd = json.indexOf('"', valueStart);
    if (valueEnd < 0) {
      return "";
    }
    return json.substring(valueStart, valueEnd);
  }

  int valueEnd = json.indexOf(',', valueStart);
  if (valueEnd < 0) {
    valueEnd = json.indexOf('}', valueStart);
  }
  if (valueEnd < 0) {
    return "";
  }

  String value = json.substring(valueStart, valueEnd);
  value.trim();
  return value;
}

float readPH() {
  return (analogRead(PH_PIN) / 4095.0f) * 14.0f;
}

float readTurbidity() {
  return (analogRead(TURB_PIN) / 4095.0f) * 40.0f;
}

float readTemperature() {
  sensors.requestTemperatures();
  float value = sensors.getTempCByIndex(0);
  if (value == DEVICE_DISCONNECTED_C) {
    return 0.0f;
  }
  return value;
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  if (millis() - lastWifiAttemptMs < WIFI_RETRY_MS) {
    return;
  }

  lastWifiAttemptMs = millis();
  Serial.println("Connexion Wi-Fi...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void pollDesiredState() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;
  String url = String(API_BASE) + "/device/desired-state";
  if (!beginApiRequest(http, url)) {
    return;
  }
  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    String nextPumpState = extractJsonString(body, "pumpState");
    String nextPumpMode = extractJsonString(body, "pumpMode");

    if (nextPumpState == "on" || nextPumpState == "off") {
      pumpOn = nextPumpState == "on";
    }
    if (nextPumpMode == "manual" || nextPumpMode == "auto") {
      pumpManual = nextPumpMode == "manual";
    }

    applyOutputs();
  }
  http.end();
}

void postTelemetry() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;
  String url = String(API_BASE) + "/metrics";
  if (!beginApiRequest(http, url)) {
    return;
  }
  http.addHeader("Content-Type", "application/json");

  String ip = WiFi.localIP().toString();
  float tempC = readTemperature();
  float ph = readPH();
  float turbidity = readTurbidity();

  String payload = String("{\"deviceId\":\"") + DEVICE_ID +
    "\",\"firmware\":\"" + FIRMWARE_VERSION +
    "\",\"ip\":\"" + ip +
    "\",\"rssi\":" + WiFi.RSSI() +
    ",\"freeHeap\":" + ESP.getFreeHeap() +
    ",\"uptimeMs\":" + millis() +
    ",\"temperature\":" + tempC +
    ",\"ph\":" + ph +
    ",\"turbidity\":" + turbidity +
    ",\"capabilities\":{\"pump\":true,\"heater\":false,\"waterLevel\":false,\"humidity\":false,\"pumpAutoCommand\":false}" +
    ",\"pump\":{\"state\":\"" + String(pumpOn ? "on" : "off") + "\",\"mode\":\"" + String(pumpManual ? "manual" : "auto") + "\"}" +
    "}";

  int code = http.POST(payload);
  Serial.printf("POST status: %d\n", code);
  Serial.println(payload);
  http.end();
}

void setup() {
  Serial.begin(115200);
  sensors.begin();

  pinMode(PUMP_RELAY_PIN, OUTPUT);
  applyOutputs();

  WiFi.mode(WIFI_STA);
}

void loop() {
  ensureWifi();

  if (WiFi.status() == WL_CONNECTED && millis() - lastCommandPollMs >= COMMAND_POLL_INTERVAL_MS) {
    lastCommandPollMs = millis();
    pollDesiredState();
  }

  if (WiFi.status() == WL_CONNECTED && millis() - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = millis();
    postTelemetry();
  }
}
