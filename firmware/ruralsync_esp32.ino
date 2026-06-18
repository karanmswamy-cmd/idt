
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>

// --- WiFi / Server Configuration ---
const char *ssid     = "YOUR_WIFI_SSID";         // Edit to your Wi-Fi SSID
const char *password = "YOUR_WIFI_PASSWORD";      // Edit to your Wi-Fi Password
const char *serverUrl =
    "http://192.168.1.100:5000"; // Express Backend IP and Port

// --- PIN Definitions ---
const int BUZZER_PIN = 12; // GPIO 12 (Connect active buzzer)

// --- I2C LCD Configuration ---
// Default I2C address for most PCF8574-based LCD backpacks is 0x27.
// If screen stays blank, try 0x3F.
// SDA → GPIO 21 | SCL → GPIO 22  (ESP32 hardware I2C defaults)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// --- Timers ---
unsigned long lastPollTime      = 0;
unsigned long lastOrderShowTime = 0;
unsigned long lcdEventEndTime   = 0;   // When to revert LCD to idle screen

const unsigned long pollInterval      = 5000;  // Poll every 5 seconds
const unsigned long orderDisplayMs    = 4000;  // Show order info for 4 s
const unsigned long eventDisplayMs    = 5000;  // Show event banner for 5 s

// --- State Tracking ---
String lastProductName = "";
int    lastQuantity    = 0;
String lastStatus      = "";
int    bufferedCount   = 0;
bool   lcdShowingEvent = false;

// --- Scroll State for long product names ---
int    scrollOffset    = 0;
unsigned long lastScrollTime = 0;
const unsigned long scrollInterval = 400; // ms between scroll steps

// --- Display Cycle State ---
int idleDisplayMode = 0; // 0: Status, 1: Latest Order
unsigned long lastDisplayToggleTime = 0;
const unsigned long displayToggleInterval = 3000;

// ============================================================
//  LCD HELPER FUNCTIONS
// ============================================================

// Print a string padded / truncated to exactly 'width' characters
void lcdPrint(int col, int row, String text, int width = 16) {
  while ((int)text.length() < width) text += ' ';
  if ((int)text.length() > width)    text  = text.substring(0, width);
  lcd.setCursor(col, row);
  lcd.print(text);
}

// Show a full 2-row screen in one call
void lcdScreen(String row0, String row1) {
  lcdPrint(0, 0, row0);
  lcdPrint(0, 1, row1);
}

// Show startup splash
void lcdSplash() {
  lcd.clear();
  lcdScreen("  RuralSync    ", "  Retailer HUB  ");
  delay(1500);
  lcd.clear();
  lcdScreen(" Initializing...", "  v1.0  ESP32   ");
}

// Animate WiFi connecting dots across row 1
void lcdWifiConnecting(int dotCount) {
  lcdPrint(0, 0, "Connecting WiFi ");
  String dots = "";
  for (int i = 0; i < min(dotCount, 16); i++) dots += ".";
  lcdPrint(0, 1, dots);
}

// Show WiFi connected with local IP
void lcdWifiConnected(String ip) {
  lcd.clear();
  lcdScreen("WiFi Connected! ", "IP:" + ip);
}

// Idle/polling screen — shows connectivity + buffered count
void lcdIdle(String connectivity, int buffered) {
  String row0 = "Status:" + connectivity;
  String row1  = "Buffered:" + String(buffered) + "      ";
  lcdScreen(row0, row1);
}

// NEW_OFFLINE_ORDER event screen
void lcdNewOfflineOrder(String product, int qty) {
  lcd.clear();
  lcdPrint(0, 0, "! New Order !   ");
  String row1 = product + " x" + String(qty);
  lcdPrint(0, 1, row1);
}

// SYNC_STARTED screen
void lcdSyncStarted() {
  lcd.clear();
  lcdScreen("Syncing Orders..", "Please wait...  ");
}

// SYNC_COMPLETED screen with count
void lcdSyncDone(int count) {
  lcd.clear();
  lcdScreen("Sync Complete!  ", String(count) + " order(s) sent  ");
}

// Latest order summary (shown during idle after a sync)
void lcdLatestOrder(String product, int qty, String status) {
  // Row 0: product name (scroll if > 16 chars)
  String display = product;
  if ((int)product.length() > 16) {
    display = product.substring(scrollOffset, scrollOffset + 16);
  }
  lcdPrint(0, 0, display);

  // Row 1: Qty + status (truncated)
  String row1 = "Q:" + String(qty) + " " + status;
  lcdPrint(0, 1, row1);
}

// ============================================================
//  BUZZER HELPER
// ============================================================
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

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);

  // --- LCD Init ---
  lcd.init();
  lcd.backlight();
  lcdSplash();

  // --- Buzzer Pin ---
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // --- Connect to WiFi with animated LCD feedback ---
  Serial.println("Starting Wi-Fi connection...");
  WiFi.begin(ssid, password);

  int dotCount = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
    lcdWifiConnecting(dotCount % 16 + 1);
    dotCount++;
  }

  String ipStr = WiFi.localIP().toString();
  Serial.println("\nWiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(ipStr);

  lcdWifiConnected(ipStr);
  delay(2000);

  // Display idle screen
  lcdIdle("ONLINE", 0);

  // Double beep = ready
  triggerBuzzer(2, 100, 100);
  Serial.println("RuralSync ESP32 ready. Listening for events...");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {

  // --- Scroll long product names ---
  bool scrollUpdated = false;
  if (millis() - lastScrollTime >= scrollInterval) {
    lastScrollTime = millis();
    if (lastProductName.length() > 16) {
      scrollOffset++;
      if (scrollOffset + 16 > (int)lastProductName.length()) scrollOffset = 0;
      scrollUpdated = true;
    } else {
      scrollOffset = 0;
    }
  }

  // --- Revert LCD to idle/order after event banner expires ---
  if (lcdShowingEvent && millis() >= lcdEventEndTime) {
    lcdShowingEvent = false;
    lastDisplayToggleTime = millis() - displayToggleInterval; // Force immediate redraw
  }

  // --- Cycle idle display screens ---
  if (!lcdShowingEvent) {
    bool toggleScreen = false;
    if (millis() - lastDisplayToggleTime >= displayToggleInterval) {
      lastDisplayToggleTime = millis();
      idleDisplayMode = (idleDisplayMode + 1) % 2;
      toggleScreen = true;
    }

    if (toggleScreen || (idleDisplayMode == 1 && scrollUpdated)) {
      if (idleDisplayMode == 0) {
        lcdIdle("ONLINE", bufferedCount);
      } else {
        String prod = (lastProductName.length() > 0 && lastProductName != "None") ? lastProductName : "No Orders";
        String stat = (lastStatus == "N/A" || lastStatus == "") ? "" : lastStatus;
        lcdLatestOrder(prod, lastQuantity, stat);
      }
    }
  }

  // --- PERIODIC EVENT POLLING (every 5 seconds) ---
  if (millis() - lastPollTime >= pollInterval) {
    lastPollTime = millis();

    if (WiFi.status() == WL_CONNECTED) {

      // ---- 1. Poll for events ----
      {
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
              Serial.println(">>> EVENT: NEW_OFFLINE_ORDER");
              triggerBuzzer(3, 80, 80);

              lcdNewOfflineOrder(
                  lastProductName.length() > 0 ? lastProductName : "New Item",
                  lastQuantity);
              lcdShowingEvent = true;
              lcdEventEndTime = millis() + eventDisplayMs;

            } else if (event == "SYNC_STARTED") {
              Serial.println(">>> EVENT: SYNC_STARTED");
              triggerBuzzer(1, 250, 0);

              lcdSyncStarted();
              lcdShowingEvent = true;
              lcdEventEndTime = millis() + eventDisplayMs;

            } else if (event == "SYNC_COMPLETED") {
              Serial.println(">>> EVENT: SYNC_COMPLETED");
              triggerBuzzer(2, 150, 100);

              lcdSyncDone(bufferedCount > 0 ? bufferedCount : 1);
              lcdShowingEvent = true;
              lcdEventEndTime = millis() + eventDisplayMs;
            }
          }
        }
        http.end();
      }

      // ---- 2. Poll latest order to keep LCD fresh ----
      {
        HTTPClient http;
        String orderEndpoint = String(serverUrl) + "/api/device/latest-order";
        http.begin(orderEndpoint);
        int httpCode = http.GET();

        if (httpCode == 200) {
          String payload = http.getString();
          StaticJsonDocument<256> doc;
          DeserializationError error = deserializeJson(doc, payload);

          if (!error) {
            String product  = doc["productName"].as<String>();
            int    qty      = doc["quantity"].as<int>();
            String status   = doc["status"].as<String>();

            // Check if order info changed
            bool changed = (lastProductName != product || lastQuantity != qty || lastStatus != status);

            // Update cached order info
            lastProductName = product;
            lastQuantity    = qty;
            lastStatus      = status;

            // Force redraw on next loop iteration if changed
            if (!lcdShowingEvent && changed) {
               lastDisplayToggleTime = millis() - displayToggleInterval; 
            }
          }
        }
        http.end();
      }

      // ---- 3. Poll device status for buffered count ----
      {
        HTTPClient http;
        String statusEndpoint = String(serverUrl) + "/api/device/status";
        http.begin(statusEndpoint);
        int httpCode = http.GET();

        if (httpCode == 200) {
          String payload = http.getString();
          StaticJsonDocument<128> doc;
          DeserializationError error = deserializeJson(doc, payload);
          if (!error) {
            bufferedCount = doc["bufferedOrders"].as<int>();
          }
        }
        http.end();
      }

    } else {
      // WiFi lost — show warning on LCD
      Serial.println("WiFi disconnected. Attempting reconnect...");
      lcd.clear();
      lcdScreen("WiFi Lost!      ", "Reconnecting... ");
      WiFi.reconnect();
    }
  }
}
