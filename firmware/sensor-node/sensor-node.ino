#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "DHT.h"

#define SOIL_PIN 34
#define DHT_PIN 4
#define MQ2_PIN 35
#define RAIN_PIN 32
#define TRIG_PIN 5
#define ECHO_PIN 18
#define DHT_TYPE DHT22

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* TELEMETRY_URL = "https://rakshaknet.onrender.com/api/zones/z4/telemetry";
const char* NODE_ID = "RN-SENSOR-01";

const int SOIL_DRY_RAW = 3200;
const int SOIL_WET_RAW = 1200;
const int RAIN_DRY_RAW = 4095;
const int RAIN_WET_RAW = 1000;
const float SENSOR_HEIGHT_CM = 25.0;

DHT dht(DHT_PIN, DHT_TYPE);
int mq2Baseline = 0;

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  return duration == 0 ? NAN : duration * 0.0343 / 2.0;
}

float readWaterLevelM() {
  float distance = readDistanceCm();
  if (isnan(distance)) return NAN;
  float waterCm = constrain(SENSOR_HEIGHT_CM - distance, 0, SENSOR_HEIGHT_CM);
  return waterCm / 100.0;
}

float toPercent(int raw, int dryRaw, int wetRaw) {
  return constrain(100.0 * (dryRaw - raw) / (dryRaw - wetRaw), 0, 100);
}

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

void calibrateMQ2() {
  long total = 0;
  for (int i = 0; i < 50; i++) {
    total += analogRead(MQ2_PIN);
    delay(100);
  }
  mq2Baseline = total / 50;
}

void sendTelemetry() {
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  int soilRaw = analogRead(SOIL_PIN);
  int mq2Raw = analogRead(MQ2_PIN);
  int rainRaw = analogRead(RAIN_PIN);
  float waterLevelM = readWaterLevelM();

  String json = "{\"nodeId\":\"" + String(NODE_ID) + "\",\"sensors\":{";
  bool first = true;
  if (!isnan(temperature)) {
    json += "\"tempC\":" + String(temperature, 2);
    first = false;
  }
  if (!isnan(humidity)) {
    if (!first) json += ",";
    json += "\"humidityPct\":" + String(humidity, 2);
    first = false;
  }
  if (!first) json += ",";
  json += "\"soilMoisturePct\":" + String(toPercent(soilRaw, SOIL_DRY_RAW, SOIL_WET_RAW), 1);
  json += ",\"mq2Raw\":" + String(mq2Raw);
  json += ",\"mq2Ratio\":" + String(mq2Baseline > 0 ? (float)mq2Raw / mq2Baseline : 1.0, 2);
  json += ",\"rainIntensityPct\":" + String(toPercent(rainRaw, RAIN_DRY_RAW, RAIN_WET_RAW), 1);
  if (!isnan(waterLevelM)) json += ",\"waterLevelM\":" + String(waterLevelM, 3);
  json += "}}";

  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, TELEMETRY_URL);
  http.addHeader("Content-Type", "application/json");
  Serial.println(http.POST(json));
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  dht.begin();
  connectWiFi();
  delay(5000);
  calibrateMQ2();
}

void loop() {
  sendTelemetry();
  delay(5000);
}
