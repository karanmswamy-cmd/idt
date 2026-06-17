

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>


// --- Config Configuration ---
const char *ssid = "YOUR_WIFI_SSID";         // Edit to your Wi-Fi SSID
const char *password = "YOUR_WIFI_PASSWORD"; // Edit to your Wi-Fi Password
const char *serverUrl =
    "http://192.168.1.100:5000"; // Express Backend IP and Port

// --- PIN Definitions ---
const int BUZZER_PIN = 12; // GPIO 12 (Connect active buzzer)

// --- Timers ---
unsigned long lastPollTime = 0;
const unsigned long pollInterval =
    5000; // Poll every 5 seconds (as per specification)

// --- Beep Generator Helper ---
void triggerBuzzer(int beepCount, int beepDurationMs, int delayBetweenBeepsMs) {
  for (int i = 0; i < beepCount; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(beepDurationMs);
    digitalWrite(BUZZER_PIN, LOW);
    if (i < beepCount - 1) {
      delay(delayBetweenBeepsMs);
    }
  }
}

void setup() {
  Serial.begin(115200);

  // Configure Pins
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW); // Keep silent initially

  // Connect to WiFi
  Serial.println("Starting Wi-Fi connection...");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected successfully!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Initial startup indicator (double beep)
  triggerBuzzer(2, 100, 100);
  Serial.println("RuralSync ESP32 companion active. Listening for events...");
}

void loop() {

  // --- PERIODIC EVENT POLLING (Every 5 seconds) ---
  if (millis() - lastPollTime >= pollInterval) {
    lastPollTime = millis();

    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      String eventsEndpoint = String(serverUrl) + "/api/device/events";
      http.begin(eventsEndpoint);

      int httpCode = http.GET();
      if (httpCode == 200) {
        String payload = http.getString();
        StaticJsonDocument<256> doc;
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
          String event = doc["event"].as<String>();

          if (event == "NEW_OFFLINE_ORDER") {
            // Short beeps x 3
            Serial.println(">>> EVENT RECEIVED: NEW_OFFLINE_ORDER");
            Serial.println("Alert: Order stored in local IndexedDB. Sounding "
                           "buzzer beep-beep-beep.");
            triggerBuzzer(3, 80, 80);
          } else if (event == "SYNC_STARTED") {
            // Single longer beep
            Serial.println(">>> EVENT RECEIVED: SYNC_STARTED");
            Serial.println("Alert: Synchronization Started.");
            triggerBuzzer(1, 250, 0);
          } else if (event == "SYNC_COMPLETED") {
            // Double beep
            Serial.println(">>> EVENT RECEIVED: SYNC_COMPLETED");
            Serial.println("Alert: Synchronization Completed successfully. "
                           "Orders uploaded to cloud DB.");
            triggerBuzzer(2, 150, 100);
          }
        }
      }
      http.end();
    }
  }
}
