/**
 * RuralSync - ESP32 Offline-First Companion Firmware
 * 
 * Hardware components:
 * - ESP32 Board
 * - Push Button (Connected to Pin 14 and GND - using INPUT_PULLUP)
 * - Active Buzzer (Connected to Pin 12 and GND)
 * 
 * Dependencies:
 * - ArduinoJson Library (by Benoit Blanchon) - Install via Library Manager.
 * 
 * This code polls the RuralSync Express Backend server to get network state, 
 * sync status, and event triggers, activating the buzzer and Serial monitor.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- Config Configuration ---
const char* ssid = "YOUR_WIFI_SSID";          // Edit to your Wi-Fi SSID
const char* password = "YOUR_WIFI_PASSWORD";  // Edit to your Wi-Fi Password
const char* serverUrl = "http://192.168.1.100:5000"; // Express Backend IP and Port

// --- PIN Definitions ---
const int BUTTON_PIN = 14;  // GPIO 14 (Connect push button to GND)
const int BUZZER_PIN = 12;  // GPIO 12 (Connect active buzzer)

// --- Timers ---
unsigned long lastPollTime = 0;
const unsigned long pollInterval = 5000; // Poll every 5 seconds (as per specification)

// --- Button Debounce ---
int lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

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

// --- Status Request Handler (Button Pressed) ---
void requestStatusAndPrint() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("STATUS: OFFLINE (No WiFi)");
    return;
  }

  HTTPClient http;
  
  // 1. Fetch current status
  String statusEndpoint = String(serverUrl) + "/api/device/status";
  http.begin(statusEndpoint);
  int httpCode = http.GET();
  
  String connectivity = "OFFLINE";
  int bufferedOrders = 0;
  String syncStatus = "IDLE";

  if (httpCode == 200) {
    String payload = http.getString();
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, payload);
    if (!error) {
      connectivity = doc["connectivity"].as<String>();
      bufferedOrders = doc["bufferedOrders"].as<int>();
      syncStatus = doc["syncStatus"].as<String>();
    }
  }
  http.end();

  // 2. Fetch latest order details
  String orderEndpoint = String(serverUrl) + "/api/device/latest-order";
  http.begin(orderEndpoint);
  int orderHttpCode = http.GET();
  
  String productName = "None";
  int quantity = 0;
  String orderStatus = "N/A";

  if (orderHttpCode == 200) {
    String payload = http.getString();
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, payload);
    if (!error) {
      productName = doc["productName"].as<String>();
      quantity = doc["quantity"].as<int>();
      orderStatus = doc["status"].as<String>();
    }
  }
  http.end();

  // 3. Print output to Serial Monitor
  // Print respects translation context sent from Express backend state
  Serial.println("\n=================================");
  Serial.println("RURALSYNC: PHYSICAL DEVICE STATUS");
  Serial.println("=================================");
  
  if (connectivity == "ONLINE") {
    Serial.println("Connectivity: ONLINE");
  } else {
    Serial.println("Connectivity: OFFLINE (Outage simulated)");
  }
  
  Serial.print("Buffered Orders count: ");
  Serial.println(bufferedOrders);
  
  Serial.println("Latest Order Details:");
  Serial.print("  Product Name: ");
  Serial.println(productName);
  Serial.print("  Quantity:     ");
  Serial.println(quantity);
  Serial.print("  Order Status: ");
  Serial.println(orderStatus);
  Serial.println("=================================\n");
}

void setup() {
  Serial.begin(115200);
  
  // Configure Pins
  pinMode(BUTTON_PIN, INPUT_PULLUP);
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
  Serial.println("RuralSync ESP32 companion active. Press physical button to query status.");
}

void loop() {
  // --- BUTTON PRESSED CHECK (GPIO Edge Triggered & Debounced) ---
  int reading = digitalRead(BUTTON_PIN);
  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (reading == LOW && lastButtonState == HIGH) {
      Serial.println("[ESP32] Status button pressed. Sending REST API request...");
      requestStatusAndPrint();
    }
  }
  lastButtonState = reading;

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
            Serial.println("Alert: Order stored in local IndexedDB. Sounding buzzer beep-beep-beep.");
            triggerBuzzer(3, 80, 80);
          } 
          else if (event == "SYNC_STARTED") {
            // Single longer beep
            Serial.println(">>> EVENT RECEIVED: SYNC_STARTED");
            Serial.println("Alert: Synchronization Started.");
            triggerBuzzer(1, 250, 0);
          } 
          else if (event == "SYNC_COMPLETED") {
            // Double beep
            Serial.println(">>> EVENT RECEIVED: SYNC_COMPLETED");
            Serial.println("Alert: Synchronization Completed successfully. Orders uploaded to cloud DB.");
            triggerBuzzer(2, 150, 100);
          }
        }
      }
      http.end();
    }
  }
}
