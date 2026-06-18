
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

// --- WiFi / Server Configuration ---
const char *ssid     = "YOUR_WIFI_SSID";         // Edit to your Wi-Fi SSID
const char *password = "YOUR_WIFI_PASSWORD";      // Edit to your Wi-Fi Password
const char *serverUrl =
    "https://y-production-3628.up.railway.app"; // Railway deployed backend (HTTPS)

// --- HTTPS client (skip certificate verification for simplicity) ---
WiFiClientSecure secureClient;

// --- PIN Definitions ---
const int BUZZER_PIN = 12; // GPIO 12 (Connect active buzzer)

// --- I2C LCD Configuration ---
// Default I2C address for most PCF8574-based LCD backpacks is 0x27.
// If screen stays blank, try 0x3F.
// SDA -> GPIO 21 | SCL -> GPIO 22  (ESP32 hardware I2C defaults)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// --- Timers ---
unsigned long lastPollTime          = 0;
unsigned long lcdEventEndTime       = 0;
unsigned long lastDisplayToggleTime = 0;
unsigned long lastScrollTime        = 0;

const unsigned long pollInterval          = 5000;  // Poll server every 5 sec
const unsigned long eventDisplayMs        = 5000;  // Event banner lasts 5 sec
const unsigned long displayToggleInterval = 3000;  // Cycle idle screens every 3 sec
const unsigned long scrollInterval        = 400;   // Scroll speed for long names

// --- Order Storage (from /api/device/lcd-data) ---
const int MAX_ORDERS = 5;
struct Order {
  String productName;
  int    quantity;
  String status;
  String priority;
};
Order orders[MAX_ORDERS];
int   orderCount    = 0;
int   totalOrders   = 0;
int   bufferedCount = 0;
String connectivity = "ONLINE";
String syncStatus   = "IDLE";

// --- Display State ---
bool lcdShowingEvent = false;
int  idleDisplayMode = 0;     // 0=status, 1..N=order cycling
int  scrollOffset    = 0;
String currentScrollProduct = "";

// ============================================================
//  LCD HELPER FUNCTIONS
// ============================================================

// Print a string padded/truncated to exactly 'width' characters
void lcdPrint(int col, int row, String text, int width = 16) {
  while ((int)text.length() < width) text += ' ';
  if ((int)text.length() > width)    text = text.substring(0, width);
  lcd.setCursor(col, row);
  lcd.print(text);
}

// Show a full 2-row screen
void lcdScreen(String row0, String row1) {
  lcdPrint(0, 0, row0);
  lcdPrint(0, 1, row1);
}

// Startup splash
void lcdSplash() {
  lcd.clear();
  lcdScreen("  RuralSync     ", "  Retailer HUB ");
  delay(1500);
  lcd.clear();
  lcdScreen(" Initializing...", "  v1.0  ESP32   ");
}

// WiFi connecting animation
void lcdWifiConnecting(int dotCount) {
  lcdPrint(0, 0, "Connecting WiFi ");
  String dots = "";
  for (int i = 0; i < min(dotCount, 16); i++) dots += ".";
  lcdPrint(0, 1, dots);
}

// WiFi connected with IP
void lcdWifiConnected(String ip) {
  lcd.clear();
  lcdScreen("WiFi Connected! ", "IP:" + ip);
}

// --- IDLE SCREEN: Status overview ---
void lcdShowStatus() {
  String row0 = connectivity + " " + syncStatus;
  String row1 = "Ord:" + String(totalOrders) + " Buf:" + String(bufferedCount);
  lcdScreen(row0, row1);
}

// --- IDLE SCREEN: Show a specific order ---
void lcdShowOrder(int index) {
  if (index < 0 || index >= orderCount) {
    lcdScreen("  No Orders     ", "  Place one!    ");
    return;
  }

  Order &o = orders[index];

  // Row 0: product name (auto-scroll if > 16 chars)
  String display = o.productName;
  if ((int)o.productName.length() > 16) {
    // Only scroll if this is the same product we were scrolling before
    if (currentScrollProduct != o.productName) {
      currentScrollProduct = o.productName;
      scrollOffset = 0;
    }
    int maxOffset = (int)o.productName.length() - 16;
    if (scrollOffset > maxOffset) scrollOffset = 0;
    display = o.productName.substring(scrollOffset, scrollOffset + 16);
  }
  lcdPrint(0, 0, display);

  // Row 1: "Qty:N  Status"
  String row1 = "Q:" + String(o.quantity) + " " + o.status;
  lcdPrint(0, 1, row1);
}

// --- EVENT SCREENS ---
void lcdNewOfflineOrder(String product, int qty) {
  lcd.clear();
  lcdPrint(0, 0, "! New Order !   ");
  String row1 = product + " x" + String(qty);
  lcdPrint(0, 1, row1);
}

void lcdSyncStarted() {
  lcd.clear();
  lcdScreen("Syncing Orders..", "Please wait...  ");
}

void lcdSyncDone(int count) {
  lcd.clear();
  lcdScreen("Sync Complete!  ", String(count) + " order(s) sent ");
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
//  FETCH LCD DATA FROM BACKEND
// ============================================================
bool fetchLcdData() {
  bool success = false;

  // --- Try new /api/device/lcd-data endpoint first ---
  {
    HTTPClient http;
    String endpoint = String(serverUrl) + "/api/device/lcd-data";
    http.begin(secureClient, endpoint);
    int httpCode = http.GET();

    if (httpCode == 200) {
      String payload = http.getString();
      DynamicJsonDocument doc(1536);
      DeserializationError error = deserializeJson(doc, payload);

      if (!error) {
        totalOrders   = doc["totalOrders"].as<int>();
        bufferedCount = doc["bufferedOrders"].as<int>();
        connectivity  = doc["connectivity"].as<String>();
        syncStatus    = doc["syncStatus"].as<String>();

        JsonArray arr = doc["orders"].as<JsonArray>();
        orderCount = 0;
        for (JsonObject obj : arr) {
          if (orderCount >= MAX_ORDERS) break;
          orders[orderCount].productName = obj["productName"].as<String>();
          orders[orderCount].quantity    = obj["quantity"].as<int>();
          orders[orderCount].status      = obj["status"].as<String>();
          orders[orderCount].priority    = obj["priority"].as<String>();
          orderCount++;
        }
        success = true;
        Serial.print("lcd-data OK: ");
        Serial.print(orderCount);
        Serial.println(" orders loaded");
      } else {
        Serial.print("lcd-data JSON err: ");
        Serial.println(error.c_str());
      }
    } else {
      Serial.print("lcd-data HTTP ");
      Serial.println(httpCode);
    }
    http.end();
  }

  // --- Fallback: read /api/orders directly if lcd-data failed ---
  if (!success) {
    HTTPClient http;
    String endpoint = String(serverUrl) + "/api/orders";
    http.begin(secureClient, endpoint);
    int httpCode = http.GET();

    if (httpCode == 200) {
      String payload = http.getString();
      DynamicJsonDocument doc(2048);
      DeserializationError error = deserializeJson(doc, payload);

      if (!error && doc.is<JsonArray>()) {
        JsonArray arr = doc.as<JsonArray>();
        totalOrders = arr.size();
        orderCount = 0;

        // Take last 5 orders (most recent)
        int startIdx = (totalOrders > MAX_ORDERS) ? totalOrders - MAX_ORDERS : 0;
        int idx = 0;
        for (JsonObject obj : arr) {
          if (idx >= startIdx && orderCount < MAX_ORDERS) {
            orders[orderCount].productName = obj["productName"].as<String>();
            orders[orderCount].quantity    = obj["quantity"].as<int>();
            orders[orderCount].status      = obj["status"].as<String>();
            orders[orderCount].priority    = obj["priority"].as<String>();
            orderCount++;
          }
          idx++;
        }
        success = true;
        Serial.print("/api/orders fallback OK: ");
        Serial.print(orderCount);
        Serial.println(" orders loaded");
      } else {
        Serial.println("/api/orders JSON err");
      }
    } else {
      Serial.print("/api/orders HTTP ");
      Serial.println(httpCode);
      // Show error on LCD so user can see
      lcdScreen("Fetch Error     ", "HTTP:" + String(httpCode) + "         ");
    }
    http.end();
  }

  // --- Debug: print orders to Serial ---
  for (int i = 0; i < orderCount; i++) {
    Serial.print("  Order ");
    Serial.print(i);
    Serial.print(": ");
    Serial.print(orders[i].productName);
    Serial.print(" x");
    Serial.print(orders[i].quantity);
    Serial.print(" [");
    Serial.print(orders[i].status);
    Serial.println("]");
  }

  return success;
}

// ============================================================
//  FETCH & HANDLE EVENTS
// ============================================================
void fetchEvents() {
  HTTPClient http;
  String endpoint = String(serverUrl) + "/api/device/events";
  http.begin(secureClient, endpoint);
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
        // Show the latest order if we have one
        String name = (orderCount > 0) ? orders[0].productName : "New Item";
        int    qty  = (orderCount > 0) ? orders[0].quantity : 1;
        lcdNewOfflineOrder(name, qty);
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
        lcdSyncDone(bufferedCount > 0 ? bufferedCount : totalOrders);
        lcdShowingEvent = true;
        lcdEventEndTime = millis() + eventDisplayMs;
      }
    }
  }
  http.end();
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

  // --- Buzzer ---
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // --- WiFi with animated LCD ---
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

  // --- HTTPS: skip certificate verification ---
  secureClient.setInsecure();
  Serial.println("HTTPS client ready (insecure mode)");

  // Initial data fetch — show first order immediately if available
  bool fetched = fetchLcdData();
  if (fetched && orderCount > 0) {
    // Show first order right away
    idleDisplayMode = 1;
    lcdShowOrder(0);
    Serial.print("Showing order: ");
    Serial.println(orders[0].productName);
  } else {
    lcdShowStatus();
  }
  lastDisplayToggleTime = millis();

  triggerBuzzer(2, 100, 100);
  Serial.println("RuralSync ESP32 ready. Listening...");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {

  // --- Auto-scroll long product names ---
  bool scrolled = false;
  if (millis() - lastScrollTime >= scrollInterval) {
    lastScrollTime = millis();
    if (currentScrollProduct.length() > 16) {
      scrollOffset++;
      int maxOff = (int)currentScrollProduct.length() - 16;
      if (scrollOffset > maxOff) scrollOffset = 0;
      scrolled = true;
    }
  }

  // --- Revert LCD after event banner expires ---
  if (lcdShowingEvent && millis() >= lcdEventEndTime) {
    lcdShowingEvent = false;
    // Force immediate idle redraw
    lastDisplayToggleTime = millis() - displayToggleInterval;
  }

  // --- Cycle idle display: Status -> Order1 -> Order2 -> ... -> Status ---
  if (!lcdShowingEvent) {
    bool toggle = false;
    if (millis() - lastDisplayToggleTime >= displayToggleInterval) {
      lastDisplayToggleTime = millis();
      // Total screens = 1 (status) + orderCount (each order)
      int totalScreens = 1 + max(orderCount, 1); // at least show "No Orders"
      idleDisplayMode = (idleDisplayMode + 1) % totalScreens;
      toggle = true;
    }

    if (toggle || (idleDisplayMode > 0 && scrolled)) {
      if (idleDisplayMode == 0) {
        lcdShowStatus();
      } else {
        lcdShowOrder(idleDisplayMode - 1);
      }
    }
  }

  // --- Poll server every 5 seconds ---
  if (millis() - lastPollTime >= pollInterval) {
    lastPollTime = millis();

    if (WiFi.status() == WL_CONNECTED) {
      fetchEvents();
      fetchLcdData();
      // Force display refresh after new data
      if (!lcdShowingEvent) {
        lastDisplayToggleTime = millis() - displayToggleInterval;
      }
    } else {
      Serial.println("WiFi disconnected!");
      lcd.clear();
      lcdScreen("WiFi Lost!      ", "Reconnecting... ");
      WiFi.reconnect();
    }
  }
}
