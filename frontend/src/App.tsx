import React, { useState, useEffect, useRef } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Database, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  CreditCard, 
  Languages, 
  Activity, 
  User, 
  ShoppingBag, 
  Check, 
  X,
  PlusCircle,
  Truck,
  Trash2,
  Cpu
} from 'lucide-react';
import { OfflineDB } from './db/offlineDb';
import type { OfflineOrder } from './db/offlineDb';
import { translations } from './translations';
import type { Language, TranslationSchema } from './translations';

const API_BASE = 'http://localhost:5000/api';

interface CloudOrder {
  id: string;
  productName: string;
  quantity: number;
  priority: 'Low' | 'Medium' | 'High';
  notes: string;
  status: 'Sent' | 'Approved' | 'Rejected' | 'Payment Pending' | 'Paid' | 'Dispatched' | 'Delivered';
  createdAt: string;
  syncedAt?: string;
  updatedAt?: string;
}

interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'info' | 'error';
}

export default function App() {
  // --- Persistent State ---
  const [portal, setPortal] = useState<'customer' | 'supplier'>('customer');
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('ruralsync_lang') as Language) || 'en';
  });
  const [connectivity, setConnectivity] = useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  
  // --- Core Data ---
  const [cloudOrders, setCloudOrders] = useState<CloudOrder[]>([]);
  const [offlineOrders, setOfflineOrders] = useState<OfflineOrder[]>([]);
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SYNCING' | 'COMPLETED'>('IDLE');
  
  // --- Form Inputs ---
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [notes, setNotes] = useState('');
  
  // --- UI Notifications ---
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  
  // --- Virtual ESP32 Simulator State ---
  const [serialLogs, setSerialLogs] = useState<string[]>([]);
  const [buzzerActive, setBuzzerActive] = useState(false);
  const [deviceConnected, setDeviceConnected] = useState(true);
  
  // --- Analytics Stats ---
  const [bufferedCount, setBufferedCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('ruralsync_buffered_count') || '0');
  });
  const [downtime, setDowntime] = useState(0);

  // Serial output container ref
  const serialEndRef = useRef<HTMLDivElement>(null);
  
  const t: TranslationSchema = translations[lang];

  // Web Audio API buzzer sound
  const triggerAudioBuzzer = (beeps: number) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      let delay = 0;
      const duration = 120; // ms per beep
      
      setBuzzerActive(true);
      setTimeout(() => setBuzzerActive(false), beeps * 200);

      for (let i = 0; i < beeps; i++) {
        setTimeout(() => {
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          oscillator.type = 'square';
          oscillator.frequency.value = 1800; // High pitch alert
          
          gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration / 1000);
          
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
          oscillator.start();
          oscillator.stop(audioCtx.currentTime + duration / 1000);
        }, delay);
        delay += duration + 100;
      }
    } catch (err) {
      console.warn('Audio feedback blocked by browser settings/gesture', err);
    }
  };

  // Toast Helper
  const showToast = (message: string, type: 'success' | 'warning' | 'info' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Log to virtual serial console
  const logToSerial = (text: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSerialLogs(prev => [...prev, `[${timestamp}] ${text}`]);
  };

  // --- Fetch Cloud & Offline Data ---
  const fetchCloudOrders = async () => {
    try {
      const res = await fetch(`${API_BASE}/orders`);
      if (res.ok) {
        const data = await res.json();
        setCloudOrders(data);
      }
    } catch (err) {
      console.error('Failed to fetch cloud orders:', err);
    }
  };

  const fetchOfflineOrders = async () => {
    try {
      const list = await OfflineDB.getAllOrders();
      setOfflineOrders(list);
    } catch (err) {
      console.error('Failed to read IndexedDB:', err);
    }
  };

  // Initial Load
  useEffect(() => {
    fetchCloudOrders();
    fetchOfflineOrders();
    logToSerial("ESP32 Booted. Serial output initialized.");
    logToSerial("ESP32 waiting for Wi-Fi...");
    logToSerial("ESP32 Connected to RuralSync Wi-Fi (IP: 192.168.1.104)");
  }, []);

  // Sync Lang choice
  useEffect(() => {
    localStorage.setItem('ruralsync_lang', lang);
  }, [lang]);

  // Track offline downtime ticking
  useEffect(() => {
    let interval: any;
    if (connectivity === 'OFFLINE') {
      interval = setInterval(() => {
        setDowntime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [connectivity]);

  // Sync state to the local JSON Express backend (acts as the physical device status bridge)
  useEffect(() => {
    const updateServerDeviceState = async () => {
      try {
        const latest = offlineOrders.length > 0 
          ? offlineOrders[offlineOrders.length - 1] 
          : (cloudOrders.length > 0 ? cloudOrders[cloudOrders.length - 1] : null);

        await fetch(`${API_BASE}/device/state-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectivity,
            bufferedOrders: offlineOrders.length,
            syncStatus,
            latestOrderName: latest?.productName || 'None',
            latestOrderQty: latest?.quantity || 0,
            latestOrderStatus: latest?.status || 'N/A'
          })
        });
        setDeviceConnected(true);
      } catch (err) {
        // Express backend is offline
        setDeviceConnected(false);
      }
    };
    updateServerDeviceState();
  }, [connectivity, offlineOrders, cloudOrders, syncStatus]);

  // --- Synchronization Engine ---
  useEffect(() => {
    const autoSync = async () => {
      if (connectivity === 'ONLINE' && offlineOrders.length > 0 && syncStatus === 'IDLE') {
        setSyncStatus('SYNCING');
        showToast(t.notifySyncStarted, 'info');
        logToSerial(t.espSerialSyncStarted);
        triggerAudioBuzzer(1); // 1 beep for sync started

        // Trigger event in Express backend for physical ESP32
        try {
          await fetch(`${API_BASE}/device/trigger-event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'SYNC_STARTED' })
          });
        } catch (e) {}

        // Mock upload delay to show loading screen
        setTimeout(async () => {
          try {
            const listToSync = await OfflineDB.getAllOrders();
            const res = await fetch(`${API_BASE}/orders`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(listToSync)
            });

            if (res.ok) {
              // Clear local database
              await OfflineDB.clearAll();
              await fetchOfflineOrders();
              await fetchCloudOrders();
              
              setSyncStatus('COMPLETED');
              showToast(t.notifySyncCompleted, 'success');
              logToSerial(`${t.espSerialSyncCompleted}. ${t.espSerialSyncUploaded}: ${listToSync.length}`);
              triggerAudioBuzzer(2); // 2 beeps for sync completed

              try {
                await fetch(`${API_BASE}/device/trigger-event`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ event: 'SYNC_COMPLETED' })
                });
              } catch (e) {}

              // Return to idle status after 3 seconds
              setTimeout(() => {
                setSyncStatus('IDLE');
              }, 3000);
            } else {
              setSyncStatus('IDLE');
              showToast("Sync upload failed", 'error');
            }
          } catch (err) {
            setSyncStatus('IDLE');
            showToast("Cannot connect to server. Retrying later...", 'error');
          }
        }, 1500);
      }
    };

    autoSync();
  }, [connectivity, offlineOrders]);

  // Auto Scroll Serial logs
  useEffect(() => {
    serialEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serialLogs]);

  // --- ORDER CREATION HANDLER ---
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || !quantity.trim() || isNaN(Number(quantity)) || Number(quantity) <= 0) {
      showToast(lang === 'kn' ? 'ದಯವಿಟ್ಟು ಸರಿಯಾದ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ' : 'Please fill all fields with correct details', 'error');
      return;
    }

    const orderPayload = {
      productName: productName.trim(),
      quantity: parseInt(quantity),
      priority,
      notes: notes.trim(),
      createdAt: new Date().toISOString()
    };

    if (connectivity === 'ONLINE') {
      // Direct Online Order
      try {
        const res = await fetch(`${API_BASE}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload)
        });

        if (res.ok) {
          showToast(t.notifyOrderCreated, 'success');
          setProductName('');
          setQuantity('');
          setNotes('');
          fetchCloudOrders();
        } else {
          throw new Error('Server returned error');
        }
      } catch (err) {
        showToast("Server error. Buffering offline instead.", 'warning');
        bufferOrderOffline(orderPayload);
      }
    } else {
      // Offline Mode -> Buffer in IndexedDB
      bufferOrderOffline(orderPayload);
    }
  };

  const bufferOrderOffline = async (payload: any) => {
    const id = 'off_' + Math.random().toString(36).substring(2, 9);
    const offlineOrder: OfflineOrder = {
      ...payload,
      id,
      status: 'Buffered Offline'
    };

    try {
      await OfflineDB.saveOrder(offlineOrder);
      const newBufferedCount = bufferedCount + 1;
      setBufferedCount(newBufferedCount);
      localStorage.setItem('ruralsync_buffered_count', newBufferedCount.toString());
      
      await fetchOfflineOrders();
      showToast(t.notifyOrderBuffered, 'warning');
      
      // ESP32 simulation alerts
      logToSerial(`${t.espSerialNewOfflineOrder}: ${offlineOrder.productName} (${offlineOrder.quantity})`);
      triggerAudioBuzzer(3); // Beep beep beep for offline buffering

      // Trigger event in server for physical ESP32
      try {
        await fetch(`${API_BASE}/device/trigger-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'NEW_OFFLINE_ORDER' })
        });
      } catch (e) {}

      // Reset form
      setProductName('');
      setQuantity('');
      setNotes('');
    } catch (err) {
      showToast('IndexedDB error', 'error');
    }
  };

  // --- WORKFLOW ACTIONS ---
  const handleUpdateStatus = async (orderId: string, status: CloudOrder['status']) => {
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchCloudOrders();
        showToast(`Order status updated to: ${status}`, 'success');
      }
    } catch (err) {
      showToast('Action failed. Server offline.', 'error');
    }
  };

  // --- SIMULATION SCRIPTS ---
  const toggleConnectivity = (status: 'ONLINE' | 'OFFLINE') => {
    setConnectivity(status);
    if (status === 'OFFLINE') {
      showToast(t.notifyInternetLost, 'error');
    } else {
      showToast(t.notifyInternetRestored, 'success');
    }
  };

  const createMockOfflineOrder = async () => {
    const products = ['Fertilizer', 'Rice Seeds', 'Tractor Oil', 'Solar Lantern', 'Water Pump'];
    const randomProduct = products[Math.floor(Math.random() * products.length)];
    const randomQty = Math.floor(Math.random() * 45) + 5;
    const priorities: ('Low' | 'Medium' | 'High')[] = ['Low', 'Medium', 'High'];
    const randomPriority = priorities[Math.floor(Math.random() * 3)];

    const id = 'off_mock_' + Math.random().toString(36).substring(2, 9);
    const offlineOrder: OfflineOrder = {
      id,
      productName: randomProduct,
      quantity: randomQty,
      priority: randomPriority,
      notes: 'Generated via simulator script',
      status: 'Buffered Offline',
      createdAt: new Date().toISOString()
    };

    await OfflineDB.saveOrder(offlineOrder);
    const newCount = bufferedCount + 1;
    setBufferedCount(newCount);
    localStorage.setItem('ruralsync_buffered_count', newCount.toString());
    await fetchOfflineOrders();
    
    showToast(`${t.notifyOrderBuffered} (${randomProduct})`, 'warning');
    logToSerial(`${t.espSerialNewOfflineOrder}: ${randomProduct} (${randomQty})`);
    triggerAudioBuzzer(3); // 3 beeps

    try {
      await fetch(`${API_BASE}/device/trigger-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'NEW_OFFLINE_ORDER' })
      });
    } catch (e) {}
  };

  const runFullDemo = () => {
    showToast("Starting Full Demonstration Flow...", "info");
    
    // Step 1: Login (Customer Portal)
    setPortal('customer');
    
    // Step 2: Simulating internet outage
    setTimeout(() => {
      toggleConnectivity('OFFLINE');
    }, 1500);

    // Step 3: Placing offline order
    setTimeout(() => {
      setProductName('Rice');
      setQuantity('20');
      setPriority('High');
      setNotes('Demo order during connectivity outage');
    }, 3500);

    // Submit offline order
    setTimeout(() => {
      // Simulate click
      const dummyEvent = { preventDefault: () => {} } as React.FormEvent;
      handleCreateOrder(dummyEvent);
    }, 5500);

    // Step 4: Simulate ESP32 Button Press to print status
    setTimeout(() => {
      handleESPButtonPress();
    }, 7500);

    // Step 5: Restore Internet
    setTimeout(() => {
      toggleConnectivity('ONLINE');
    }, 10500);

    // Step 6: Portal switch to supplier to review after sync
    setTimeout(() => {
      setPortal('supplier');
    }, 14500);
  };

  const handleESPButtonPress = () => {
    const latName = offlineOrders.length > 0 
      ? offlineOrders[offlineOrders.length - 1].productName 
      : (cloudOrders.length > 0 ? cloudOrders[cloudOrders.length - 1].productName : 'None');
      
    const latQty = offlineOrders.length > 0 
      ? offlineOrders[offlineOrders.length - 1].quantity 
      : (cloudOrders.length > 0 ? cloudOrders[cloudOrders.length - 1].quantity : 0);
      
    const latStat = offlineOrders.length > 0 
      ? 'Buffered Offline' 
      : (cloudOrders.length > 0 ? cloudOrders[cloudOrders.length - 1].status : 'N/A');

    if (lang === 'kn') {
      logToSerial(`--- ಹಾರ್ಡ್ವೇರ್ ಬಟನ್ ಒತ್ತಲಾಗಿದೆ ---`);
      logToSerial(`ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ: ${connectivity === 'ONLINE' ? 'ಆನ್ಲೈನ್ (ONLINE)' : 'ಆಫ್ಲೈನ್ (OFFLINE)'}`);
      logToSerial(`ಸ್ಥಳೀಯ ಸಂಗ್ರಹಿತ ಆರ್ಡರ್ಗಳು: ${offlineOrders.length}`);
      logToSerial(`ಇತ್ತೀಚಿನ ಆರ್ಡರ್: ${latName}`);
      logToSerial(`ಪ್ರಮಾಣ: ${latQty}`);
      logToSerial(`ಆರ್ಡರ್ ಸ್ಥಿತಿ: ${latStat === 'Buffered Offline' ? 'ಆಫ್ಲೈನ್ ಸಂಗ್ರಹಣೆ' : latStat}`);
      logToSerial(`---------------------------------------`);
    } else {
      logToSerial(`--- ESP32 Button Pressed ---`);
      logToSerial(`Connectivity: ${connectivity}`);
      logToSerial(`Buffered Orders: ${offlineOrders.length}`);
      logToSerial(`Latest Order: ${latName}`);
      logToSerial(`Quantity: ${latQty}`);
      logToSerial(`Status: ${latStat}`);
      logToSerial(`----------------------------`);
    }
  };

  const clearAllData = async () => {
    if (window.confirm("Reset all databases (IndexedDB + Cloud Backend)?")) {
      try {
        await OfflineDB.clearAll();
        await fetch(`${API_BASE}/orders`, { method: 'DELETE' });
        setCloudOrders([]);
        setOfflineOrders([]);
        setBufferedCount(0);
        localStorage.setItem('ruralsync_buffered_count', '0');
        setDowntime(0);
        setSerialLogs([]);
        logToSerial("Databases wiped. System restarted.");
        showToast("All databases cleared successfully.", "success");
      } catch (err) {
        showToast("Backend reset failed.", "error");
      }
    }
  };

  // --- STATS COMPUTATION ---
  const statOrdersCreated = cloudOrders.length + offlineOrders.length;
  const statOrdersDelivered = cloudOrders.filter(o => o.status === 'Delivered').length;
  const statPending = cloudOrders.filter(o => o.status === 'Sent' || o.status === 'Approved' || o.status === 'Payment Pending' || o.status === 'Paid' || o.status === 'Dispatched').length + offlineOrders.length;
  const statRevenue = cloudOrders
    .filter(o => ['Paid', 'Dispatched', 'Delivered'].includes(o.status))
    .reduce((sum, o) => sum + (o.quantity * 120), 0); // Mock cost per unit is 120 INR

  return (
    <div className="min-h-screen bg-dark-bg bg-grid-pattern pb-12">
      {/* Toast Notification Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 border transition-all duration-300 animate-slide-in pointer-events-auto ${
              toast.type === 'success' ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300' :
              toast.type === 'warning' ? 'bg-orange-950/80 border-orange-500 text-orange-300' :
              toast.type === 'error' ? 'bg-rose-950/80 border-rose-500 text-rose-300' :
              'bg-blue-950/80 border-blue-500 text-blue-300'
            }`}
          >
            {toast.type === 'success' && <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />}
            {toast.type === 'warning' && <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0" />}
            {toast.type === 'error' && <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />}
            {toast.type === 'info' && <RefreshCw className="h-5 w-5 text-blue-400 shrink-0 animate-spin" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* --- TOP HEADER --- */}
      <header className="glass-panel sticky top-0 z-30 border-b border-slate-800/80 px-6 py-4 flex flex-wrap justify-between items-center gap-4 bg-slate-950/70">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-teal-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">
              {t.appName}
              <span className="text-xs px-2 py-0.5 bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded-full font-mono font-medium">v1.0.0-IoT</span>
            </h1>
            <p className="text-xs text-slate-400 font-sans hidden sm:block">Offline-First Rural Supply Chain Platform</p>
          </div>
        </div>

        {/* Portals Toggle & Languages & Network Status */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Active Portal Toggle */}
          <div className="bg-slate-900/80 p-0.5 border border-slate-800 rounded-lg flex">
            <button 
              onClick={() => setPortal('customer')} 
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-all ${
                portal === 'customer' 
                  ? 'bg-teal-500 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              {lang === 'kn' ? 'ಗ್ರಾಹಕರು' : 'Customer'}
            </button>
            <button 
              onClick={() => setPortal('supplier')} 
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-all ${
                portal === 'supplier' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Truck className="h-3.5 w-3.5" />
              {lang === 'kn' ? 'ಪೂರೈಕೆದಾರರು' : 'Supplier'}
            </button>
          </div>

          {/* Bilingual Switcher */}
          <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 border border-slate-800 rounded-lg">
            <Languages className="h-3.5 w-3.5 text-teal-400" />
            <select 
              value={lang} 
              onChange={(e) => setLang(e.target.value as Language)}
              className="bg-transparent text-xs font-semibold text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="en" className="bg-slate-900">🇬🇧 English</option>
              <option value="kn" className="bg-slate-900">🇮🇳 ಕನ್ನಡ (Kannada)</option>
            </select>
          </div>

          {/* Simulated Connectivity Badge */}
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 transition-all ${
            connectivity === 'ONLINE' 
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 glow-green' 
              : 'bg-rose-950/40 border-rose-500/30 text-rose-400 glow-red animate-pulse'
          }`}>
            {connectivity === 'ONLINE' ? (
              <>
                <Wifi className="h-3.5 w-3.5" />
                {t.online}
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                {t.offline}
              </>
            )}
          </div>
        </div>
      </header>

      {/* --- MAIN CORE LAYOUT GRID --- */}
      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ============================================================== */}
        {/* LEFT & CENTER SECTIONS (ACTIVE PORTAL INTERFACE)              */}
        {/* ============================================================== */}
        <section className="lg:col-span-2 space-y-6">
          
          {/* BILINGUAL ANNOUNCEMENT SLIDE */}
          <div className="glass-panel rounded-2xl p-5 border border-teal-500/10 bg-gradient-to-r from-teal-950/20 to-blue-950/10 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-teal-300">
                {lang === 'kn' ? 'ಗ್ರಾಮೀಣ ಕಲ್ಯಾಣಕ್ಕಾಗಿ ಕನ್ನಡ ಇಂಟರ್ಫೇಸ್' : 'Bilingual Localized System Active'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {lang === 'kn' 
                  ? 'ಈ ಅಪ್ಲಿಕೇಶನ್ ಸಂಪೂರ್ಣವಾಗಿ ಕನ್ನಡವನ್ನು ಬೆಂಬಲಿಸುತ್ತದೆ. ಆಫ್ಲೈನ್ ಆರ್ಡರ್ಗಳು ಮೊಬೈಲ್ನಲ್ಲಿ ಸುರಕ್ಷಿತವಾಗಿರುತ್ತವೆ ಮತ್ತು ಇಂಟರ್ನೆಟ್ ಬಂದ ತಕ್ಷಣ ಪೂರೈಕೆದಾರರಿಗೆ ತಲುಪುತ್ತವೆ.'
                  : 'This platform supports rural Karnataka businesses by offering complete translation, offline buffering via IndexedDB, and physical notification relays.'}
              </p>
            </div>
          </div>

          {/* ---------------------------------------------------------- */}
          {/* CUSTOMER PORTAL PAGE                                       */}
          {/* ---------------------------------------------------------- */}
          {portal === 'customer' && (
            <div className="space-y-6">
              
              {/* Portal Header */}
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold font-display text-white">{t.customerPortal}</h2>
                  <p className="text-sm text-slate-400">{lang === 'kn' ? 'ಆರ್ಡರ್ಗಳನ್ನು ಸಲ್ಲಿಸಿ ಮತ್ತು ವಿತರಣಾ ಸ್ಥಿತಿಯನ್ನು ವೀಕ್ಷಿಸಿ' : 'Place orders, track delivery lifecycle, and sync offline state.'}</p>
                </div>
                {syncStatus !== 'IDLE' && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-teal-950/60 border border-teal-500/30 rounded-full text-teal-400 text-xs font-semibold">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    {syncStatus === 'SYNCING' ? t.syncStatusSyncing : t.syncStatusCompleted}
                  </div>
                )}
              </div>

              {/* Customer Dashboard Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-blue-500">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.totalOrders}</p>
                  <p className="text-2xl font-bold text-white mt-1">{statOrdersCreated}</p>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-orange-500">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.pendingOrders}</p>
                  <p className="text-2xl font-bold text-white mt-1">{statPending}</p>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-teal-500">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{lang === 'kn' ? 'ಅನುಮೋದಿತ' : 'Approved'}</p>
                  <p className="text-2xl font-bold text-white mt-1">{cloudOrders.filter(o => o.status !== 'Sent' && o.status !== 'Rejected').length}</p>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-emerald-500">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.deliveredOrders}</p>
                  <p className="text-2xl font-bold text-white mt-1">{statOrdersDelivered}</p>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-rose-500 col-span-2 md:col-span-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.bufferedOrders}</p>
                  <p className="text-2xl font-bold text-rose-400 mt-1">{offlineOrders.length}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{bufferedCount} protected</p>
                </div>
              </div>

              {/* Form & Pending List Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Order Creation Card (1/3 Width) */}
                <div className="glass-panel rounded-2xl p-5 border border-slate-800 bg-slate-900/30 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                      <PlusCircle className="h-5 w-5 text-teal-400" />
                      {t.createOrder}
                    </h3>
                    
                    <form onSubmit={handleCreateOrder} className="mt-4 space-y-4">
                      {/* Product Name */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t.productName}</label>
                        <input 
                          type="text"
                          value={productName}
                          onChange={(e) => setProductName(e.target.value)}
                          placeholder={t.productNamePlaceholder}
                          className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
                        />
                      </div>
                      
                      {/* Quantity */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t.quantity}</label>
                        <input 
                          type="number"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          placeholder={t.quantityPlaceholder}
                          min="1"
                          className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
                        />
                      </div>

                      {/* Priority */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t.priority}</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['Low', 'Medium', 'High'] as const).map(p => (
                            <button
                              type="button"
                              key={p}
                              onClick={() => setPriority(p)}
                              className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                priority === p 
                                  ? 'bg-teal-500/10 border-teal-500 text-teal-400' 
                                  : 'bg-slate-950/50 border-slate-800 text-slate-400'
                              }`}
                            >
                              {p === 'Low' ? t.priorityLow : p === 'Medium' ? t.priorityMedium : t.priorityHigh}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t.notes}</label>
                        <textarea 
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder={t.notesPlaceholder}
                          rows={2}
                          className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500 transition-colors resize-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className={`w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all ${
                          connectivity === 'ONLINE'
                            ? 'bg-teal-500 hover:bg-teal-600 text-white shadow-teal-500/10'
                            : 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/10'
                        }`}
                      >
                        {connectivity === 'ONLINE' ? (
                          <>
                            <Check className="h-4 w-4" />
                            {t.placeOrder}
                          </>
                        ) : (
                          <>
                            <Database className="h-4 w-4" />
                            {lang === 'kn' ? 'ಆಫ್ಲೈನ್ನಲ್ಲಿ ಸಂಗ್ರಹಿಸಿ' : 'Buffer Offline'}
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Database Synchronization Status & Offline Buffer (2/3 Width) */}
                <div className="md:col-span-2 glass-panel rounded-2xl p-5 border border-slate-800 bg-slate-900/30 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center justify-between border-b border-slate-800 pb-3">
                      <span className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-orange-400" />
                        {lang === 'kn' ? 'ಸ್ಥಳೀಯ ಸಂಗ್ರಹಣೆ ವಿವರಗಳು' : 'IndexedDB Offline Stores'}
                      </span>
                      <span className="text-xs px-2.5 py-0.5 bg-orange-950/50 text-orange-400 border border-orange-500/20 rounded-full font-mono font-medium">
                        RuralSyncOfflineDB
                      </span>
                    </h3>

                    {/* Offline Buffer List */}
                    <div className="mt-4 space-y-3 max-h-[280px] overflow-y-auto pr-1">
                      {offlineOrders.length === 0 ? (
                        <div className="h-[200px] flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
                          <CheckCircle className="h-8 w-8 text-emerald-400 mb-2" />
                          <p className="text-sm font-semibold text-slate-300">
                            {lang === 'kn' ? 'ಆಫ್ಲೈನ್ ಬಫರ್ ಖಾಲಿಯಾಗಿದೆ' : 'Offline Queue Empty'}
                          </p>
                          <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                            {lang === 'kn' ? 'ಎಲ್ಲಾ ಆರ್ಡರ್ಗಳನ್ನು ಸಿಂಕ್ರೊನೈಸ್ ಮಾಡಲಾಗಿದೆ.' : 'All orders synced to cloud successfully.'}
                          </p>
                        </div>
                      ) : (
                        offlineOrders.map(order => (
                          <div key={order.id} className="bg-slate-950/60 border border-orange-500/20 rounded-xl p-3 flex justify-between items-center gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white">{order.productName}</span>
                                <span className={`px-1.5 py-0.5 text-[9px] rounded font-bold uppercase ${
                                  order.priority === 'High' ? 'bg-rose-950 text-rose-400 border border-rose-500/20' :
                                  order.priority === 'Medium' ? 'bg-orange-950 text-orange-400 border border-orange-500/20' :
                                  'bg-slate-800 text-slate-400'
                                }`}>
                                  {order.priority === 'High' ? t.priorityHigh : order.priority === 'Medium' ? t.priorityMedium : t.priorityLow}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1">
                                {t.quantity}: <span className="text-slate-200 font-semibold">{order.quantity}</span>
                                {order.notes && ` • "${order.notes}"`}
                              </p>
                              <p className="text-[9px] text-slate-500 mt-0.5">{new Date(order.createdAt).toLocaleTimeString()}</p>
                            </div>
                            <div className="text-right">
                              <span className="px-2.5 py-1 bg-orange-950/80 text-orange-400 border border-orange-500/30 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 glow-orange">
                                <Clock className="h-3 w-3 animate-pulse" />
                                {t.statusBufferedOffline}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Customer Order History */}
              <div className="glass-panel rounded-2xl p-5 border border-slate-800 bg-slate-900/30">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Clock className="h-5 w-5 text-blue-400" />
                  {t.orderHistory}
                </h3>
                
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400">
                        <th className="py-2.5 px-3">{t.orderId}</th>
                        <th className="py-2.5 px-3">{t.product}</th>
                        <th className="py-2.5 px-3">{t.quantity}</th>
                        <th className="py-2.5 px-3">{t.priority}</th>
                        <th className="py-2.5 px-3">{t.status}</th>
                        <th className="py-2.5 px-3 text-right">{t.action}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-xs">
                      {cloudOrders.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            {t.noOrdersFound}
                          </td>
                        </tr>
                      )}
                      
                      {cloudOrders.slice().reverse().map(order => (
                        <tr key={order.id || Math.random().toString()} className="hover:bg-slate-900/40">
                          <td className="py-3 px-3 font-mono text-slate-400">#{order.id ? order.id.slice(0, 6) : 'N/A'}</td>
                          <td className="py-3 px-3 font-bold text-white">{order.productName}</td>
                          <td className="py-3 px-3 text-slate-200">{order.quantity}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              order.priority === 'High' ? 'bg-rose-950/80 text-rose-400' :
                              order.priority === 'Medium' ? 'bg-orange-950/80 text-orange-400' :
                              'bg-slate-800 text-slate-400'
                            }`}>
                              {order.priority === 'High' ? t.priorityHigh : order.priority === 'Medium' ? t.priorityMedium : t.priorityLow}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                              order.status === 'Sent' ? 'bg-blue-950 text-blue-400 border-blue-500/20' :
                              order.status === 'Approved' ? 'bg-amber-950 text-amber-400 border-amber-500/20' :
                              order.status === 'Rejected' ? 'bg-rose-950 text-rose-400 border-rose-500/20' :
                              order.status === 'Payment Pending' ? 'bg-violet-950 text-violet-400 border-violet-500/20 glow-blue animate-pulse' :
                              order.status === 'Paid' ? 'bg-emerald-950 text-emerald-400 border-emerald-500/20' :
                              order.status === 'Dispatched' ? 'bg-teal-950 text-teal-400 border-teal-500/20' :
                              'bg-slate-900 text-slate-400 border-slate-800'
                            }`}>
                              {order.status === 'Sent' && t.statusSent}
                              {order.status === 'Approved' && t.statusApproved}
                              {order.status === 'Rejected' && t.statusRejected}
                              {order.status === 'Payment Pending' && (lang === 'kn' ? 'ಪಾವತಿ ಬಾಕಿ ಇದೆ' : 'Payment Pending')}
                              {order.status === 'Paid' && t.statusPaid}
                              {order.status === 'Dispatched' && (lang === 'kn' ? 'ರವಾನಿಸಲಾಗಿದೆ' : 'Dispatched')}
                              {order.status === 'Delivered' && t.statusDelivered}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            {order.status === 'Payment Pending' ? (
                              <button
                                onClick={() => handleUpdateStatus(order.id, 'Paid')}
                                className="px-2.5 py-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded text-[10px] font-bold shadow-md transition-all flex items-center gap-1 ml-auto"
                              >
                                <CreditCard className="h-3 w-3" />
                                {lang === 'kn' ? 'ಈಗ ಪಾವತಿಸಿ' : 'Pay Now'}
                              </button>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ---------------------------------------------------------- */}
          {/* SUPPLIER PORTAL PAGE                                       */}
          {/* ---------------------------------------------------------- */}
          {portal === 'supplier' && (
            <div className="space-y-6">
              
              {/* Portal Header */}
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold font-display text-white">{t.supplierPortal}</h2>
                  <p className="text-sm text-slate-400">Urban dispatch, order processing, and revenue details.</p>
                </div>
              </div>

              {/* Supplier Dashboard Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-blue-500">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Orders Received</p>
                  <p className="text-2xl font-bold text-white mt-1">{cloudOrders.length}</p>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-orange-500">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Approval</p>
                  <p className="text-2xl font-bold text-white mt-1">{cloudOrders.filter(o => o.status === 'Sent').length}</p>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-amber-500">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Approved Orders</p>
                  <p className="text-2xl font-bold text-white mt-1">{cloudOrders.filter(o => o.status !== 'Sent' && o.status !== 'Rejected').length}</p>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-teal-500">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dispatched / Delivered</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {cloudOrders.filter(o => o.status === 'Dispatched' || o.status === 'Delivered').length}
                  </p>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-emerald-500 col-span-2 md:col-span-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Revenue (INR)</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">₹{statRevenue}</p>
                </div>
              </div>

              {/* Supplier Orders Handling List */}
              <div className="glass-panel rounded-2xl p-5 border border-slate-800 bg-slate-900/30">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <ShoppingBag className="h-5 w-5 text-teal-400" />
                  Incoming Orders Desk
                </h3>
                
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400">
                        <th className="py-2.5 px-3">Order ID</th>
                        <th className="py-2.5 px-3">Customer (Rural)</th>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3">Quantity</th>
                        <th className="py-2.5 px-3">Priority</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-xs">
                      {cloudOrders.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            No incoming cloud orders recorded.
                          </td>
                        </tr>
                      )}
                      
                      {cloudOrders.slice().reverse().map(order => (
                        <tr key={order.id || Math.random().toString()} className="hover:bg-slate-900/40">
                          <td className="py-3 px-3 font-mono text-slate-400">#{order.id ? order.id.slice(0, 6) : 'N/A'}</td>
                          <td className="py-3 px-3 font-medium text-slate-300">Mandya Agri-Hub</td>
                          <td className="py-3 px-3 font-bold text-white">{order.productName}</td>
                          <td className="py-3 px-3 text-slate-300">{order.quantity}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              order.priority === 'High' ? 'bg-rose-950/80 text-rose-400' :
                              order.priority === 'Medium' ? 'bg-orange-950/80 text-orange-400' :
                              'bg-slate-800 text-slate-400'
                            }`}>
                              {order.priority}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              order.status === 'Sent' ? 'bg-blue-950 text-blue-400 border-blue-500/20' :
                              order.status === 'Approved' ? 'bg-amber-950 text-amber-400 border-amber-500/20' :
                              order.status === 'Rejected' ? 'bg-rose-950 text-rose-400 border-rose-500/20' :
                              order.status === 'Payment Pending' ? 'bg-violet-950 text-violet-400 border-violet-500/20' :
                              order.status === 'Paid' ? 'bg-emerald-950 text-emerald-400 border-emerald-500/20' :
                              order.status === 'Dispatched' ? 'bg-teal-950 text-teal-400 border-teal-500/20' :
                              'bg-slate-900 text-slate-400 border-slate-800'
                            }`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex gap-2 justify-end">
                              {order.status === 'Sent' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateStatus(order.id, 'Approved')}
                                    className="px-2 py-1 bg-teal-500 hover:bg-teal-600 text-white rounded text-[10px] font-bold shadow-md transition-all flex items-center gap-1"
                                  >
                                    <Check className="h-3 w-3" /> Approve
                                  </button>
                                  <button
                                    onClick={() => handleUpdateStatus(order.id, 'Rejected')}
                                    className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold shadow-md transition-all flex items-center gap-1"
                                  >
                                    <X className="h-3 w-3" /> Reject
                                  </button>
                                </>
                              )}

                              {order.status === 'Approved' && (
                                <button
                                  onClick={() => handleUpdateStatus(order.id, 'Payment Pending')}
                                  className="px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded text-[10px] font-bold shadow-md transition-all"
                                >
                                  Request Payment
                                </button>
                              )}

                              {order.status === 'Paid' && (
                                <button
                                  onClick={() => handleUpdateStatus(order.id, 'Dispatched')}
                                  className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold shadow-md transition-all flex items-center gap-1"
                                >
                                  <Truck className="h-3.5 w-3.5" /> Dispatch Goods
                                </button>
                              )}

                              {order.status === 'Dispatched' && (
                                <button
                                  onClick={() => handleUpdateStatus(order.id, 'Delivered')}
                                  className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-[10px] font-bold shadow-md transition-all flex items-center gap-1"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" /> Mark Delivered
                                </button>
                              )}

                              {!['Sent', 'Approved', 'Paid', 'Dispatched'].includes(order.status) && (
                                <span className="text-slate-500 font-semibold">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </section>

        {/* ============================================================== */}
        {/* RIGHT SECTION (SIMULATION CONTROL PANEL & ESP32 SIMULATOR)     */}
        {/* ============================================================== */}
        <section className="space-y-6">

          {/* SIMULATION PANEL */}
          <div className="glass-panel rounded-2xl p-5 border border-slate-800 bg-slate-900/30">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Activity className="h-5 w-5 text-teal-400" />
              {lang === 'kn' ? 'ಡೆಮೊ ಸಿಮ್ಯುಲೇಟರ್ ಪ್ಯಾನಲ್' : 'Demo Control & Simulation'}
            </h3>

            <div className="mt-4 space-y-4">
              
              {/* Outage Simulation Switches */}
              <div>
                <p className="text-xs font-semibold text-slate-300 mb-2">Simulate Connectivity Status</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => toggleConnectivity('ONLINE')}
                    className={`py-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                      connectivity === 'ONLINE'
                        ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400 glow-green'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Wifi className="h-4 w-4" /> Restore Internet
                  </button>
                  <button
                    onClick={() => toggleConnectivity('OFFLINE')}
                    className={`py-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                      connectivity === 'OFFLINE'
                        ? 'bg-rose-950/40 border-rose-500 text-rose-400 glow-red'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <WifiOff className="h-4 w-4" /> Simulate Outage
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5">
                <button
                  onClick={createMockOfflineOrder}
                  className="w-full py-2 bg-slate-900 border border-slate-800 hover:border-orange-500 text-orange-400 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  <Database className="h-3.5 w-3.5" />
                  {lang === 'kn' ? 'ಆಫ್ಲೈನ್ ಆರ್ಡರ್ ಸಿಮ್ಯುಲೇಟ್ ಮಾಡಿ' : 'Create Offline Order (Outage)'}
                </button>

                <button
                  onClick={runFullDemo}
                  className="w-full py-2 bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <PlayIcon className="h-3.5 w-3.5" />
                  Run Full Demonstration Flow
                </button>

                <button
                  onClick={clearAllData}
                  className="w-full py-2 bg-slate-900/40 border border-slate-900/60 hover:bg-rose-950/20 hover:border-rose-900 text-rose-400 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Wipe Data & Reset Systems
                </button>
              </div>

              {/* Simulation Metrics */}
              <div className="border-t border-slate-800 pt-3 mt-1 space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Demo Analytics</h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-slate-950/40 border border-slate-800/80 p-2 rounded-lg">
                    <p className="text-slate-400">Total protected during outage</p>
                    <p className="text-sm font-bold text-teal-400 mt-0.5">{bufferedCount}</p>
                  </div>
                  <div className="bg-slate-950/40 border border-slate-800/80 p-2 rounded-lg">
                    <p className="text-slate-400">Connectivity downtime</p>
                    <p className="text-sm font-bold text-rose-400 mt-0.5">{downtime}s</p>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* VIRTUAL ESP32 SIMULATOR */}
          <div className="glass-panel rounded-2xl p-5 border border-slate-800 bg-slate-900/30">
            <h3 className="text-lg font-bold text-white flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-indigo-400" />
                {lang === 'kn' ? 'ಇಎಸ್ಪಿ32 ಹಾರ್ಡ್ವೇರ್ ಸಾಧನ' : 'ESP32 Device Simulator'}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                deviceConnected 
                  ? 'bg-indigo-950 text-indigo-400 border border-indigo-500/20' 
                  : 'bg-rose-950 text-rose-400 border border-rose-500/20'
              }`}>
                {deviceConnected ? t.esp32Connected : t.esp32Disconnected}
              </span>
            </h3>

            {/* Hardware Drawing Rendering */}
            <div className="mt-4 bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center">
              
              {/* ESP32 Chip & Buzzer Mockup */}
              <div className="relative w-full max-w-[240px] bg-slate-900 border-2 border-slate-700 rounded-xl p-4 flex flex-col items-center shadow-lg">
                <div className="absolute top-2 left-2 text-[8px] font-mono text-slate-500">ESP32-WROOM-32</div>
                
                {/* Chip outline */}
                <div className="w-14 h-16 bg-slate-800 border border-slate-600 rounded-lg flex items-center justify-center text-[10px] font-mono text-slate-300 font-bold shadow-md mt-2">
                  MCU
                </div>

                {/* Hardware components row */}
                <div className="w-full flex justify-around items-center mt-6">
                  {/* Push Button */}
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      onClick={handleESPButtonPress}
                      className="h-10 w-10 bg-slate-800 border-4 border-slate-600 rounded-full hover:bg-slate-700 active:scale-95 transition-all shadow-inner relative flex items-center justify-center cursor-pointer"
                      title="Press to request status in Serial Monitor"
                    >
                      <div className="h-4 w-4 bg-red-600 rounded-full shadow-inner" />
                    </button>
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Status Button</span>
                  </div>

                  {/* Active Buzzer */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div 
                      className={`h-10 w-10 bg-slate-800 border-4 border-slate-600 rounded-xl flex items-center justify-center shadow-inner relative ${
                        buzzerActive ? 'shake-buzz border-red-500' : ''
                      }`}
                    >
                      <div className="h-2 w-2 bg-slate-950 rounded-full" />
                      {/* Beep Wave indicators */}
                      {buzzerActive && (
                        <>
                          <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full animate-ping opacity-75" />
                          <span className="absolute text-[8px] font-bold text-red-400 -top-5 animate-pulse uppercase">BEEP!</span>
                        </>
                      )}
                    </div>
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Active Buzzer</span>
                  </div>
                </div>

                {/* Connection Pin Lines */}
                <div className="w-full flex justify-between px-1 text-[8px] font-mono text-slate-500 mt-6 border-t border-slate-800 pt-2">
                  <span>GND</span>
                  <span>GPIO12 (Buzz)</span>
                  <span>GPIO14 (Btn)</span>
                  <span>3V3</span>
                </div>
              </div>
            </div>

            {/* Virtual Serial Monitor Console */}
            <div className="mt-4 space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">{t.espSerialTitle}</label>
              <div className="w-full h-36 bg-black border border-slate-800 rounded-lg p-3 font-mono text-[10px] text-emerald-400 overflow-y-auto space-y-1 shadow-inner select-text">
                {serialLogs.length === 0 ? (
                  <p className="text-slate-600 italic">{t.espSerialPlaceholder}</p>
                ) : (
                  serialLogs.map((log, idx) => (
                    <div key={idx}>{log}</div>
                  ))
                )}
                <div ref={serialEndRef} />
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-500">
                <span>Baud: 115200</span>
                <button 
                  onClick={() => setSerialLogs([])}
                  className="hover:text-white text-slate-400 font-semibold"
                >
                  Clear Console
                </button>
              </div>
            </div>

          </div>

        </section>

      </main>
    </div>
  );
}

// Simple Helper Play Icon Component
function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      {...props}
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

