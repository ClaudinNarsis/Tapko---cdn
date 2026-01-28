import IndexedDBWrapper from '../db/IndexedDBWrapper.js';

/**
 * PinStorage - Manages local storage of pin comments in IndexedDB
 * Stores pins created in this browser and validates against backend
 */
class PinStorage {
  constructor() {
    this.dbName = 'tapko_feedback';
    this.storeName = 'pins';
    this.version = 1;
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize the IndexedDB connection with pin-specific schema
   */
  async init() {
    if (this.initialized) {
      return this.db;
    }

    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version);

        request.onerror = () => {
          console.error('[PinStorage] Error opening database:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          this.db = request.result;
          this.initialized = true;
          console.log('[PinStorage] Database initialized successfully');
          resolve(this.db);
        };

        request.onupgradeneeded = (event) => {
          console.log('[PinStorage] Creating pin store...');
          const db = event.target.result;

          // Create pins object store if it doesn't exist
          if (!db.objectStoreNames.contains(this.storeName)) {
            const objectStore = db.createObjectStore(this.storeName, {
              keyPath: 'id',
              autoIncrement: false
            });

            // Create indexes for efficient querying
            objectStore.createIndex('pageUrl', 'pageUrl', { unique: false });
            objectStore.createIndex('projectId', 'projectId', { unique: false });
            objectStore.createIndex('createdAt', 'createdAt', { unique: false });
            objectStore.createIndex('createdInThisBrowser', 'createdInThisBrowser', { unique: false });

            console.log('[PinStorage] Pin store created with indexes');
          }
        };
      });
    } catch (error) {
      console.error('[PinStorage] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Normalize URL (remove query params and hash)
   */
  _normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch (error) {
      console.error('[PinStorage] Invalid URL:', url);
      return url;
    }
  }

  /**
   * Save a pin to IndexedDB
   * @param {Object} pinData - Pin data object
   * @returns {Promise<string>} - Pin ID
   */
  async savePin(pinData) {
    await this.init();

    // Normalize URL before saving
    if (pinData.pageUrl) {
      pinData.pageUrl = this._normalizeUrl(pinData.pageUrl);
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.put(pinData);

      request.onsuccess = () => {
        console.log('[PinStorage] Pin saved:', pinData.id);
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('[PinStorage] Error saving pin:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all pins for a specific page URL
   * @param {string} pageUrl - The page URL to filter by
   * @returns {Promise<Array>} - Array of pin objects
   */
  async getPinsForPage(pageUrl) {
    await this.init();

    const normalizedUrl = this._normalizeUrl(pageUrl);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const index = objectStore.index('pageUrl');
      const request = index.getAll(normalizedUrl);

      request.onsuccess = () => {
        const pins = request.result || [];
        console.log(`[PinStorage] Found ${pins.length} pins for page:`, normalizedUrl);
        resolve(pins);
      };

      request.onerror = () => {
        console.error('[PinStorage] Error getting pins for page:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all stored pins (across all pages)
   * @returns {Promise<Array>} - Array of all pin objects
   */
  async getAllPins() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getAll();

      request.onsuccess = () => {
        const pins = request.result || [];
        console.log(`[PinStorage] Retrieved ${pins.length} total pins`);
        resolve(pins);
      };

      request.onerror = () => {
        console.error('[PinStorage] Error getting all pins:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get a single pin by ID
   * @param {string} pinId - The pin ID
   * @returns {Promise<Object|null>} - Pin object or null if not found
   */
  async getPin(pinId) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(pinId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('[PinStorage] Error getting pin:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete pins that no longer exist in the backend
   * Keeps only pins whose IDs are in the validIds array
   * @param {Array<string>} validIds - Array of valid feedback IDs from backend
   * @returns {Promise<number>} - Number of pins deleted
   */
  async cleanupDeletedPins(validIds) {
    await this.init();

    const validIdsSet = new Set(validIds);
    const allPins = await this.getAllPins();

    const pinsToDelete = allPins.filter(pin => !validIdsSet.has(pin.id));

    if (pinsToDelete.length === 0) {
      console.log('[PinStorage] No pins to cleanup');
      return 0;
    }

    console.log(`[PinStorage] Cleaning up ${pinsToDelete.length} deleted pins`);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);

      let deletedCount = 0;
      let errorOccurred = false;

      pinsToDelete.forEach((pin, index) => {
        const request = objectStore.delete(pin.id);

        request.onsuccess = () => {
          deletedCount++;
          console.log(`[PinStorage] Deleted pin: ${pin.id}`);

          // Resolve when all deletions are complete
          if (deletedCount === pinsToDelete.length) {
            resolve(deletedCount);
          }
        };

        request.onerror = () => {
          if (!errorOccurred) {
            errorOccurred = true;
            console.error('[PinStorage] Error deleting pin:', request.error);
            reject(request.error);
          }
        };
      });
    });
  }

  /**
   * Delete a specific pin by ID
   * @param {string} pinId - The pin ID to delete
   * @returns {Promise<boolean>} - True if deleted successfully
   */
  async deletePin(pinId) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.delete(pinId);

      request.onsuccess = () => {
        console.log('[PinStorage] Pin deleted:', pinId);
        resolve(true);
      };

      request.onerror = () => {
        console.error('[PinStorage] Error deleting pin:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Update an existing pin
   * @param {string} pinId - The pin ID
   * @param {Object} updates - Object with fields to update
   * @returns {Promise<string>} - Updated pin ID
   */
  async updatePin(pinId, updates) {
    await this.init();

    const pin = await this.getPin(pinId);

    if (!pin) {
      throw new Error(`Pin not found: ${pinId}`);
    }

    const updatedPin = {
      ...pin,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    return this.savePin(updatedPin);
  }

  /**
   * Clear all pins from storage
   * @returns {Promise<boolean>} - True if cleared successfully
   */
  async clearAll() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.clear();

      request.onsuccess = () => {
        console.log('[PinStorage] All pins cleared');
        resolve(true);
      };

      request.onerror = () => {
        console.error('[PinStorage] Error clearing pins:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get count of all stored pins
   * @returns {Promise<number>} - Total number of pins
   */
  async getCount() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('[PinStorage] Error counting pins:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Check if IndexedDB is supported
   * @returns {boolean}
   */
  static isSupported() {
    return 'indexedDB' in window;
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      console.log('[PinStorage] Database connection closed');
    }
  }
}

export default PinStorage;
