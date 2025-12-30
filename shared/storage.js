// Chrome Storage API wrapper for EV Value Scorer
// Handles syncing between extension and web app

const EVStorage = {
  // Storage keys
  KEYS: {
    CARS: 'evscorer_cars',
    WEIGHTS: 'evscorer_weights',
    SETTINGS: 'evscorer_settings'
  },

  // Default weights matching the main app
  DEFAULT_WEIGHTS: {
    price: 35, odo: 16, range: 12, year: 10, trimLevel: 10,
    distance: 10, remoteStart: 10, length: 10, damage: 5, heatPump: 5
  },

  // Default settings
  DEFAULT_SETTINGS: {
    autoDetect: true,
    showOverlay: true,
    notifyPriceDrops: true,
    sidebarPosition: 'right'
  },

  // Get all cars
  async getCars() {
    try {
      const result = await chrome.storage.local.get(this.KEYS.CARS);
      return result[this.KEYS.CARS] || [];
    } catch (e) {
      console.error('EVStorage.getCars error:', e);
      return [];
    }
  },

  // Save a new car
  async saveCar(car) {
    try {
      const cars = await this.getCars();
      const newCar = {
        ...car,
        id: car.id || Date.now(),
        addedAt: new Date().toISOString(),
        source: car.source || location?.hostname || 'manual',
        priceHistory: car.priceHistory || [{ price: car.price, date: new Date().toISOString().split('T')[0] }],
        photos: car.photos || [],
        starred: car.starred || false
      };
      cars.push(newCar);
      await chrome.storage.local.set({ [this.KEYS.CARS]: cars });

      // Notify other parts of extension
      chrome.runtime.sendMessage({ type: 'CAR_ADDED', car: newCar });

      return newCar;
    } catch (e) {
      console.error('EVStorage.saveCar error:', e);
      throw e;
    }
  },

  // Update existing car
  async updateCar(carId, updates) {
    try {
      const cars = await this.getCars();
      const index = cars.findIndex(c => c.id === carId);
      if (index === -1) throw new Error('Car not found');

      const oldCar = cars[index];
      const updatedCar = { ...oldCar, ...updates };

      // Track price changes
      if (updates.price && updates.price !== oldCar.price) {
        const today = new Date().toISOString().split('T')[0];
        const priceHistory = updatedCar.priceHistory || [];
        const todayEntry = priceHistory.find(h => h.date === today);
        if (todayEntry) {
          todayEntry.price = updates.price;
        } else {
          priceHistory.push({ price: updates.price, date: today });
        }
        updatedCar.priceHistory = priceHistory;
      }

      cars[index] = updatedCar;
      await chrome.storage.local.set({ [this.KEYS.CARS]: cars });

      chrome.runtime.sendMessage({ type: 'CAR_UPDATED', car: updatedCar });

      return updatedCar;
    } catch (e) {
      console.error('EVStorage.updateCar error:', e);
      throw e;
    }
  },

  // Delete car
  async deleteCar(carId) {
    try {
      const cars = await this.getCars();
      const filtered = cars.filter(c => c.id !== carId);
      await chrome.storage.local.set({ [this.KEYS.CARS]: filtered });

      chrome.runtime.sendMessage({ type: 'CAR_DELETED', carId });

      return true;
    } catch (e) {
      console.error('EVStorage.deleteCar error:', e);
      throw e;
    }
  },

  // Toggle star
  async toggleStar(carId) {
    const cars = await this.getCars();
    const car = cars.find(c => c.id === carId);
    if (car) {
      return this.updateCar(carId, { starred: !car.starred });
    }
  },

  // Check if URL already saved
  async isUrlSaved(url) {
    const cars = await this.getCars();
    return cars.some(c => c.url === url);
  },

  // Find car by URL
  async findByUrl(url) {
    const cars = await this.getCars();
    return cars.find(c => c.url === url);
  },

  // Get weights
  async getWeights() {
    try {
      const result = await chrome.storage.local.get(this.KEYS.WEIGHTS);
      return result[this.KEYS.WEIGHTS] || this.DEFAULT_WEIGHTS;
    } catch (e) {
      return this.DEFAULT_WEIGHTS;
    }
  },

  // Save weights
  async saveWeights(weights) {
    await chrome.storage.local.set({ [this.KEYS.WEIGHTS]: weights });
    chrome.runtime.sendMessage({ type: 'WEIGHTS_UPDATED', weights });
  },

  // Get settings
  async getSettings() {
    try {
      const result = await chrome.storage.local.get(this.KEYS.SETTINGS);
      return { ...this.DEFAULT_SETTINGS, ...result[this.KEYS.SETTINGS] };
    } catch (e) {
      return this.DEFAULT_SETTINGS;
    }
  },

  // Save settings
  async saveSettings(settings) {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    await chrome.storage.local.set({ [this.KEYS.SETTINGS]: updated });
    chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings: updated });
  },

  // Export all data (for backup or sync with web app)
  async exportData() {
    const cars = await this.getCars();
    const weights = await this.getWeights();
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      cars,
      weights
    };
  },

  // Import data
  async importData(data) {
    if (!data || !data.cars) throw new Error('Invalid import data');

    await chrome.storage.local.set({
      [this.KEYS.CARS]: data.cars,
      [this.KEYS.WEIGHTS]: data.weights || this.DEFAULT_WEIGHTS
    });

    chrome.runtime.sendMessage({ type: 'DATA_IMPORTED' });
    return true;
  },

  // Clear all data
  async clearAll() {
    await chrome.storage.local.remove([this.KEYS.CARS, this.KEYS.WEIGHTS, this.KEYS.SETTINGS]);
    chrome.runtime.sendMessage({ type: 'DATA_CLEARED' });
  }
};

// Make available globally
if (typeof window !== 'undefined') {
  window.EVStorage = EVStorage;
}
