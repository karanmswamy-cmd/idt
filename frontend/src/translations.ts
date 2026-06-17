export type Language = 'en' | 'kn';

export interface TranslationSchema {
  // Navigation & User Selector
  appName: string;
  portalSelector: string;
  customerPortal: string;
  supplierPortal: string;
  languageSelector: string;
  
  // Connectivity Statuses
  connectivityStatus: string;
  online: string;
  offline: string;
  offlineMode: string;
  syncStatus: string;
  syncStatusIdle: string;
  syncStatusSyncing: string;
  syncStatusCompleted: string;
  esp32Status: string;
  esp32Connected: string;
  esp32Disconnected: string;

  // Customer Dashboard
  dashboard: string;
  totalOrders: string;
  pendingOrders: string;
  approvedOrders: string;
  deliveredOrders: string;
  bufferedOrders: string;
  bufferedProtectedDesc: string;
  orderHistory: string;
  noOrdersFound: string;

  // Order Creation Form
  createOrder: string;
  productName: string;
  productNamePlaceholder: string;
  quantity: string;
  quantityPlaceholder: string;
  priority: string;
  priorityLow: string;
  priorityMedium: string;
  priorityHigh: string;
  notes: string;
  notesPlaceholder: string;
  placeOrder: string;

  // Order Columns & States
  orderId: string;
  date: string;
  product: string;
  status: string;
  action: string;
  
  // Status Labels
  statusBufferedOffline: string;
  statusSent: string;
  statusApproved: string;
  statusRejected: string;
  statusPaymentPending: string;
  statusPaid: string;
  statusDispatched: string;
  statusDelivered: string;

  // Notifications
  notifyOrderCreated: string;
  notifyOrderBuffered: string;
  notifyInternetLost: string;
  notifyInternetRestored: string;
  notifySyncStarted: string;
  notifySyncCompleted: string;

  // ESP32 Serial Monitor
  espSerialTitle: string;
  espSerialPlaceholder: string;
  espSerialOnline: string;
  espSerialOffline: string;
  espSerialBuffered: string;
  espSerialLatestOrder: string;
  espSerialSyncStarted: string;
  espSerialSyncCompleted: string;
  espSerialSyncUploaded: string;
  espSerialNewOfflineOrder: string;
}

export const translations: Record<Language, TranslationSchema> = {
  en: {
    appName: "RuralSync",
    portalSelector: "Switch Portal Mode",
    customerPortal: "Rural Customer Portal",
    supplierPortal: "Urban Supplier Portal",
    languageSelector: "Language / ಭಾಷೆ",
    connectivityStatus: "Connectivity Status",
    online: "ONLINE",
    offline: "OFFLINE",
    offlineMode: "Offline Mode",
    syncStatus: "Synchronization Status",
    syncStatusIdle: "Idle",
    syncStatusSyncing: "Syncing...",
    syncStatusCompleted: "Synchronization Completed",
    esp32Status: "ESP32 Hardware Bridge",
    esp32Connected: "Connected (Polling)",
    esp32Disconnected: "Disconnected",
    dashboard: "Dashboard",
    totalOrders: "Total Orders",
    pendingOrders: "Pending Orders",
    approvedOrders: "Approved Orders",
    deliveredOrders: "Delivered Orders",
    bufferedOrders: "Orders Buffered",
    bufferedProtectedDesc: "Orders Protected During Outages",
    orderHistory: "Order History",
    noOrdersFound: "No orders found.",
    createOrder: "Create Order",
    productName: "Product Name",
    productNamePlaceholder: "Enter product name (e.g. Rice, Seeds)",
    quantity: "Quantity",
    quantityPlaceholder: "Enter quantity in kg / units",
    priority: "Priority",
    priorityLow: "Low",
    priorityMedium: "Medium",
    priorityHigh: "High",
    notes: "Notes",
    notesPlaceholder: "Add special notes / delivery requests",
    placeOrder: "Place Order",
    orderId: "Order ID",
    date: "Date",
    product: "Product",
    status: "Status",
    action: "Action",
    statusBufferedOffline: "Buffered Offline",
    statusSent: "Sent",
    statusApproved: "Approved",
    statusRejected: "Rejected",
    statusPaymentPending: "Payment Pending",
    statusPaid: "Paid",
    statusDispatched: "Dispatched",
    statusDelivered: "Delivered",
    notifyOrderCreated: "Order successfully created online!",
    notifyOrderBuffered: "Order stored in offline database",
    notifyInternetLost: "Internet connection lost",
    notifyInternetRestored: "Internet connection restored",
    notifySyncStarted: "Synchronization started",
    notifySyncCompleted: "Synchronization completed",
    espSerialTitle: "ESP32 Serial Monitor Output (115200)",
    espSerialPlaceholder: "ESP32 prints will appear here when hardware button is pressed...",
    espSerialOnline: "ONLINE",
    espSerialOffline: "OFFLINE",
    espSerialBuffered: "Buffered Orders",
    espSerialLatestOrder: "Latest Order",
    espSerialSyncStarted: "Synchronization Started",
    espSerialSyncCompleted: "Synchronization Completed",
    espSerialSyncUploaded: "Orders Uploaded",
    espSerialNewOfflineOrder: "New Offline Order Detected",
  },
  kn: {
    appName: "ರೂರಲ್ ಸಿಂಕ್ (RuralSync)",
    portalSelector: "ಪೋರ್ಟಲ್ ಮೋಡ್ ಬದಲಾಯಿಸಿ",
    customerPortal: "ಗ್ರಾಮೀಣ ಗ್ರಾಹಕ ಪೋರ್ಟಲ್",
    supplierPortal: "ನಗರ ಪೂರೈಕೆದಾರ ಪೋರ್ಟಲ್",
    languageSelector: "ಭಾಷೆ / Language",
    connectivityStatus: "ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಸ್ಥಿತಿ",
    online: "ಆನ್ಲೈನ್ (ONLINE)",
    offline: "ಆಫ್ಲೈನ್ (OFFLINE)",
    offlineMode: "ಆಫ್ಲೈನ್ ಸ್ಥಿತಿ",
    syncStatus: "ಸಿಂಕ್ರೊನೈಸೇಶನ್ ಸ್ಥಿತಿ",
    syncStatusIdle: "ನಿಷ್ಕ್ರಿಯ",
    syncStatusSyncing: "ಸಿಂಕ್ ಮಾಡಲಾಗುತ್ತಿದೆ...",
    syncStatusCompleted: "ಸಿಂಕ್ರೊನೈಸೇಶನ್ ಪೂರ್ಣಗೊಂಡಿದೆ",
    esp32Status: "ESP32 ಹಾರ್ಡ್ವೇರ್ ಬ್ರಿಡ್ಜ್",
    esp32Connected: "ಸಂಪರ್ಕಗೊಂಡಿದೆ",
    esp32Disconnected: "ಸಂಪರ್ಕ ಕಡಿತಗೊಂಡಿದೆ",
    dashboard: "ಡ್ಯಾಶ್ಬೋರ್ಡ್",
    totalOrders: "ಒಟ್ಟು ಆರ್ಡರ್ಗಳು",
    pendingOrders: "ಬಾಕಿ ಇರುವ ಆರ್ಡರ್ಗಳು",
    approvedOrders: "ಅನುಮೋದಿತ ಆರ್ಡರ್ಗಳು",
    deliveredOrders: "ವಿತರಿಸಿದ ಆರ್ಡರ್ಗಳು",
    bufferedOrders: "ಸಂಗ್ರಹಿತ ಆರ್ಡರ್ಗಳು",
    bufferedProtectedDesc: "ನೆಟ್ವರ್ಕ್ ಕಡಿತದಲ್ಲಿ ರಕ್ಷಿಸಲ್ಪಟ್ಟ ಆರ್ಡರ್ಗಳು",
    orderHistory: "ಆರ್ಡರ್ ಇತಿಹಾಸ",
    noOrdersFound: "ಯಾವುದೇ ಆರ್ಡರ್ಗಳು ಕಂಡುಬಂದಿಲ್ಲ.",
    createOrder: "ಆರ್ಡರ್ ರಚಿಸಿ",
    productName: "ಉತ್ಪನ್ನದ ಹೆಸರು",
    productNamePlaceholder: "ಉತ್ಪನ್ನದ ಹೆಸರನ್ನು ನಮೂದಿಸಿ (ಉದಾ: ಅಕ್ಕಿ, ಬೀಜಗಳು)",
    quantity: "ಪ್ರಮಾಣ",
    quantityPlaceholder: "ಪ್ರಮಾಣವನ್ನು ನಮೂದಿಸಿ (ಕೆಜಿ/ಘಟಕಗಳಲ್ಲಿ)",
    priority: "ಆದ್ಯತೆ",
    priorityLow: "ಕಡಿಮೆ",
    priorityMedium: "ಮಧ್ಯಮ",
    priorityHigh: "ಹೆಚ್ಚು",
    notes: "ಟಿಪ್ಪಣಿಗಳು",
    notesPlaceholder: "ವಿಶೇಷ ಟಿಪ್ಪಣಿಗಳು / ವಿತರಣಾ ವಿನಂತಿಗಳನ್ನು ಸೇರಿಸಿ",
    placeOrder: "ಆರ್ಡರ್ ಸಲ್ಲಿಸಿ",
    orderId: "ಆರ್ಡರ್ ಐಡಿ",
    date: "ದಿನಾಂಕ",
    product: "ಉತ್ಪನ್ನ",
    status: "ಸ್ಥಿತಿ",
    action: "ಕ್ರಮಗಳು",
    statusBufferedOffline: "ಆಫ್ಲೈನ್ ಸಂಗ್ರಹಣೆ (Buffered Offline)",
    statusSent: "ಕಳುಹಿಸಲಾಗಿದೆ (Sent)",
    statusApproved: "ಅನುಮೋದಿಸಲಾಗಿದೆ (Approved)",
    statusRejected: "ತಿರಸ್ಕರಿಸಲಾಗಿದೆ",
    statusPaymentPending: "ಪಾವತಿ ಬಾಕಿ ಇದೆ",
    statusPaid: "ಪಾವತಿಸಲಾಗಿದೆ (Paid)",
    statusDispatched: "ರವಾನಿಸಲಾಗಿದೆ",
    statusDelivered: "ವಿತರಿಸಲಾಗಿದೆ (Delivered)",
    notifyOrderCreated: "ಆರ್ಡರ್ ಯಶಸ್ವಿಯಾಗಿ ಆನ್ಲೈನ್ನಲ್ಲಿ ಸಲ್ಲಿಸಲಾಗಿದೆ!",
    notifyOrderBuffered: "ಆರ್ಡರ್ ಆಫ್ಲೈನ್ ಡೇಟಾಬೇಸ್ನಲ್ಲಿ ಸಂಗ್ರಹಿಸಲಾಗಿದೆ",
    notifyInternetLost: "ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಕಡಿತಗೊಂಡಿದೆ",
    notifyInternetRestored: "ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಮರುಸ್ಥಾಪಿಸಲಾಗಿದೆ",
    notifySyncStarted: "ಸಿಂಕ್ರೊನೈಸೇಶನ್ ಪ್ರಾರಂಭವಾಗಿದೆ",
    notifySyncCompleted: "ಸಿಂಕ್ರೊನೈಸೇಶನ್ ಪೂರ್ಣಗೊಂಡಿದೆ",
    espSerialTitle: "ESP32 ಸೀರಿಯಲ್ ಮಾನಿಟರ್ ಔಟ್ಪುಟ್ (115200)",
    espSerialPlaceholder: "ಹಾರ್ಡ್ವೇರ್ ಬಟನ್ ಒತ್ತಿದಾಗ ಇಎಸ್ಪಿ32 ಸೀರಿಯಲ್ ಲಾಗ್ಗಳು ಇಲ್ಲಿ ಗೋಚರಿಸುತ್ತವೆ...",
    espSerialOnline: "ಆನ್ಲೈನ್",
    espSerialOffline: "ಆಫ್ಲೈನ್",
    espSerialBuffered: "ಸಂಗ್ರಹಿತ ಆರ್ಡರ್ಗಳು",
    espSerialLatestOrder: "ಇತ್ತೀಚಿನ ಆರ್ಡರ್",
    espSerialSyncStarted: "ಸಿಂಕ್ರೊನೈಸೇಶನ್ ಪ್ರಾರಂಭವಾಗಿದೆ",
    espSerialSyncCompleted: "ಸಿಂಕ್ರೊನೈಸೇಶನ್ ಪೂರ್ಣಗೊಂಡಿದೆ",
    espSerialSyncUploaded: "ಅಪ್ಲೋಡ್ ಮಾಡಿದ ಆರ್ಡರ್ಗಳು",
    espSerialNewOfflineOrder: "ಹೊಸ ಆಫ್ಲೈನ್ ಆರ್ಡರ್ ಪತ್ತೆಯಾಗಿದೆ",
  }
};
