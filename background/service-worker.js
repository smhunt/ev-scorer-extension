// EV Value Scorer - Background Service Worker
// Handles storage operations, badge updates, and cross-component communication

// Storage keys
const STORAGE_KEYS = {
  CARS: 'evscorer_cars',
  WEIGHTS: 'evscorer_weights',
  SETTINGS: 'evscorer_settings'
};

// Default weights
const DEFAULT_WEIGHTS = {
  price: 35, odo: 16, range: 12, year: 10, trimLevel: 10,
  distance: 10, remoteStart: 10, length: 10, damage: 5, heatPump: 5
};

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // First install - set defaults
    await chrome.storage.local.set({
      [STORAGE_KEYS.CARS]: [],
      [STORAGE_KEYS.WEIGHTS]: DEFAULT_WEIGHTS,
      [STORAGE_KEYS.SETTINGS]: {
        autoDetect: true,
        showOverlay: true,
        notifyPriceDrops: true,
        mode: 'all' // 'ev' = EV only, 'all' = all vehicles
      }
    });

    // Open welcome/setup page
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup/popup.html?welcome=true')
    });
  }

  updateBadge();
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'SAVE_CAR':
      return await saveCar(message.car);

    case 'UPDATE_CAR':
      return await updateCar(message.carId, message.updates);

    case 'DELETE_CAR':
      return await deleteCar(message.carId);

    case 'GET_CARS':
      return await getCars();

    case 'CHECK_URL':
      return await checkUrl(message.url);

    case 'GET_WEIGHTS':
      return await getWeights();

    case 'SAVE_WEIGHTS':
      return await saveWeights(message.weights);

    case 'OPEN_SIDEBAR':
      return await openSidebar(message.data, sender.tab?.id);

    case 'EXPORT_DATA':
      return await exportData();

    case 'IMPORT_DATA':
      return await importData(message.data);

    case 'GET_SETTINGS':
      return await getSettings();

    case 'SAVE_SETTINGS':
      return await saveSettings(message.settings);

    default:
      return { error: 'Unknown message type' };
  }
}

// Storage operations
async function getCars() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CARS);
  return { cars: result[STORAGE_KEYS.CARS] || [] };
}

async function saveCar(car) {
  try {
    const { cars } = await getCars();
    const newCar = {
      ...car,
      id: car.id || Date.now(),
      addedAt: new Date().toISOString(),
      priceHistory: car.priceHistory || [{ price: car.price, date: new Date().toISOString().split('T')[0] }],
      photos: car.photos || [],
      starred: car.starred || false,
      // Fill in defaults for scoring
      trimLevel: car.trimLevel || 2,
      distance: car.distance || 5,
      damage: car.damage || 0,
      heatPump: car.heatPump !== undefined ? car.heatPump : true,
      remoteStart: car.remoteStart || 'App',
      range: car.range || 400,
      length: car.length || 170
    };

    cars.push(newCar);
    await chrome.storage.local.set({ [STORAGE_KEYS.CARS]: cars });

    updateBadge();
    notifyAllTabs({ type: 'CAR_ADDED', car: newCar });

    return { success: true, car: newCar };
  } catch (e) {
    console.error('Save car error:', e);
    return { success: false, error: e.message };
  }
}

async function updateCar(carId, updates) {
  try {
    const { cars } = await getCars();
    const index = cars.findIndex(c => c.id === carId);
    if (index === -1) return { success: false, error: 'Car not found' };

    const oldCar = cars[index];

    // Track price changes
    if (updates.price && updates.price !== oldCar.price) {
      const today = new Date().toISOString().split('T')[0];
      const priceHistory = oldCar.priceHistory || [];
      const todayEntry = priceHistory.find(h => h.date === today);
      if (todayEntry) {
        todayEntry.price = updates.price;
      } else {
        priceHistory.push({ price: updates.price, date: today });
      }
      updates.priceHistory = priceHistory;
    }

    cars[index] = { ...oldCar, ...updates };
    await chrome.storage.local.set({ [STORAGE_KEYS.CARS]: cars });

    notifyAllTabs({ type: 'CAR_UPDATED', car: cars[index] });

    return { success: true, car: cars[index] };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function deleteCar(carId) {
  try {
    const { cars } = await getCars();
    const filtered = cars.filter(c => c.id !== carId);
    await chrome.storage.local.set({ [STORAGE_KEYS.CARS]: filtered });

    updateBadge();
    notifyAllTabs({ type: 'CAR_DELETED', carId });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function checkUrl(url) {
  const { cars } = await getCars();
  const saved = cars.some(c => c.url === url);
  return { saved };
}

async function getWeights() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.WEIGHTS);
  return { weights: result[STORAGE_KEYS.WEIGHTS] || DEFAULT_WEIGHTS };
}

async function saveWeights(weights) {
  await chrome.storage.local.set({ [STORAGE_KEYS.WEIGHTS]: weights });
  notifyAllTabs({ type: 'WEIGHTS_UPDATED', weights });
  return { success: true };
}

// Default settings
const DEFAULT_SETTINGS = {
  autoDetect: true,
  showOverlay: true,
  notifyPriceDrops: true,
  mode: 'all' // 'ev' = EV only, 'all' = all vehicles
};

async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { settings: { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] } };
}

async function saveSettings(settings) {
  const current = await getSettings();
  const updated = { ...current.settings, ...settings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
  notifyAllTabs({ type: 'SETTINGS_UPDATED', settings: updated });
  return { success: true, settings: updated };
}

async function exportData() {
  const { cars } = await getCars();
  const { weights } = await getWeights();
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    cars,
    weights
  };
}

async function importData(data) {
  if (!data || !data.cars) return { success: false, error: 'Invalid data' };

  await chrome.storage.local.set({
    [STORAGE_KEYS.CARS]: data.cars,
    [STORAGE_KEYS.WEIGHTS]: data.weights || DEFAULT_WEIGHTS
  });

  updateBadge();
  notifyAllTabs({ type: 'DATA_IMPORTED' });

  return { success: true };
}

// Open sidebar panel
async function openSidebar(data, tabId) {
  try {
    // Store data temporarily for sidebar to pick up
    if (data) {
      await chrome.storage.session.set({ pendingCarData: data });
    }

    // Open the side panel
    if (tabId) {
      await chrome.sidePanel.open({ tabId });
    }

    return { success: true };
  } catch (e) {
    console.error('Open sidebar error:', e);
    return { success: false, error: e.message };
  }
}

// Update badge with car count
async function updateBadge() {
  const { cars } = await getCars();
  const count = cars.length;

  chrome.action.setBadgeText({
    text: count > 0 ? String(count) : ''
  });

  chrome.action.setBadgeBackgroundColor({
    color: '#635bff'
  });
}

// Notify all tabs of changes
async function notifyAllTabs(message) {
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  });
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save_listing') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      // Ask content script for page data
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_DATA' });
        if (response?.data) {
          await saveCar(response.data);
        }
      } catch (e) {
        console.error('Save shortcut error:', e);
      }
    }
  }
});

// Note: Action click is handled by popup (popup.html)
// Sidebar is opened via button in popup or Edit & Save in overlay

// Initialize badge on startup
updateBadge();
