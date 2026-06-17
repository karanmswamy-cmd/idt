const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('RuralSync Backend API is running. Use /api/orders to interact.');
});

const DB_FILE = path.join(__dirname, 'db_cloud.json');

// Helper to read database
function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initialDb = { orders: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2));
      return initialDb;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading DB file:', err);
    return { orders: [] };
  }
}

// Helper to write database
function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing DB file:', err);
  }
}

// In-Memory state for ESP32 bridge (updates pushed from React portal)
let deviceStatus = {
  connectivity: 'ONLINE',
  bufferedOrders: 0,
  syncStatus: 'IDLE'
};

let latestOrder = {
  productName: 'None',
  quantity: 0,
  status: 'N/A'
};

let activeEvent = 'NONE';

// Track Analytics
let stats = {
  downtimeSeconds: 0,
  syncSuccesses: 0,
  syncFails: 0
};

// ----------------------------------------------------
// PORTALS APIs (Cloud Database Integration)
// ----------------------------------------------------

// Get all orders from the cloud DB
app.get('/api/orders', (req, res) => {
  const db = readDb();
  res.json(db.orders);
});

// Create single or bulk sync orders
app.post('/api/orders', (req, res) => {
  const db = readDb();
  const incoming = req.body;
  
  if (Array.isArray(incoming)) {
    // Bulk sync from IndexedDB
    const newOrders = incoming.map(o => ({
      ...o,
      id: o.id || 'ord_' + Math.random().toString(36).substr(2, 9),
      status: 'Sent', // Status transitions from Buffered Offline -> Sent
      syncedAt: new Date().toISOString()
    }));
    db.orders.push(...newOrders);
    
    if (newOrders.length > 0) {
      latestOrder = {
        productName: newOrders[newOrders.length - 1].productName,
        quantity: newOrders[newOrders.length - 1].quantity,
        status: 'Sent'
      };
    }
    
    writeDb(db);
    stats.syncSuccesses += 1;
    console.log(`Synced ${newOrders.length} orders to cloud db.`);
    res.status(201).json({ message: 'Synchronized successfully', orders: newOrders });
  } else {
    // Single order placed directly online
    const newOrder = {
      ...incoming,
      id: incoming.id || 'ord_' + Math.random().toString(36).substr(2, 9),
      status: 'Sent',
      syncedAt: new Date().toISOString()
    };
    db.orders.push(newOrder);
    
    latestOrder = {
      productName: newOrder.productName,
      quantity: newOrder.quantity,
      status: 'Sent'
    };
    
    writeDb(db);
    console.log('Direct online order placed:', newOrder.productName);
    res.status(201).json(newOrder);
  }
});

// Update order status (Approve, Reject, Pay, Dispatch, Deliver, etc.)
app.put('/api/orders/:id', (req, res) => {
  const db = readDb();
  const orderId = req.params.id;
  const { status } = req.body;
  
  const idx = db.orders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    db.orders[idx].status = status;
    db.orders[idx].updatedAt = new Date().toISOString();
    
    // Update latest order details for ESP32 button checks
    latestOrder = {
      productName: db.orders[idx].productName,
      quantity: db.orders[idx].quantity,
      status: status
    };
    
    writeDb(db);
    res.json(db.orders[idx]);
  } else {
    res.status(404).json({ error: 'Order not found' });
  }
});

// Clear orders (useful to reset simulator)
app.delete('/api/orders', (req, res) => {
  writeDb({ orders: [] });
  latestOrder = { productName: 'None', quantity: 0, status: 'N/A' };
  deviceStatus = { connectivity: 'ONLINE', bufferedOrders: 0, syncStatus: 'IDLE' };
  activeEvent = 'NONE';
  res.json({ message: 'Cloud database reset' });
});

// ----------------------------------------------------
// CLIENT STATE BRIDGE APIs
// ----------------------------------------------------

// Endpoint for the web app to push its state (connectivity, buffered orders)
app.post('/api/device/state-update', (req, res) => {
  const { connectivity, bufferedOrders, syncStatus, latestOrderName, latestOrderQty, latestOrderStatus } = req.body;
  
  if (connectivity) deviceStatus.connectivity = connectivity;
  if (bufferedOrders !== undefined) deviceStatus.bufferedOrders = parseInt(bufferedOrders);
  if (syncStatus) deviceStatus.syncStatus = syncStatus;
  
  if (latestOrderName) {
    latestOrder = {
      productName: latestOrderName,
      quantity: latestOrderQty || 0,
      status: latestOrderStatus || 'Buffered Offline'
    };
  }
  
  res.json({ success: true, deviceStatus, latestOrder });
});

// Endpoint for the web app to fire an event to ESP32
app.post('/api/device/trigger-event', (req, res) => {
  const { event } = req.body;
  if (['NEW_OFFLINE_ORDER', 'SYNC_STARTED', 'SYNC_COMPLETED', 'NONE'].includes(event)) {
    activeEvent = event;
    console.log(`ESP32 event triggered: ${event}`);
    res.json({ success: true, activeEvent });
  } else {
    res.status(400).json({ error: 'Invalid event type' });
  }
});

// ----------------------------------------------------
// ESP32 HARDWARE APIs
// ----------------------------------------------------

// GET /api/device/status
app.get('/api/device/status', (req, res) => {
  res.json({
    connectivity: deviceStatus.connectivity,
    bufferedOrders: deviceStatus.bufferedOrders,
    syncStatus: deviceStatus.syncStatus
  });
});

// GET /api/device/latest-order
app.get('/api/device/latest-order', (req, res) => {
  res.json(latestOrder);
});

// GET /api/device/events
app.get('/api/device/events', (req, res) => {
  const responseEvent = activeEvent;
  // Reset the event immediately so the ESP32 buzzer only beeps once
  activeEvent = 'NONE';
  res.json({ event: responseEvent });
});

// Express Server Startup
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(` RuralSync Backend Running on http://localhost:${PORT}`);
  console.log(` Accessible to ESP32 via network IP on port ${PORT}`);
  console.log(`====================================================`);
});
