/**
 * IndexedDBWrapper - Abstraction layer for IndexedDB operations
 * Provides a promise-based API for queue persistence
 */
class IndexedDBWrapper {
  constructor(dbName, storeName, version = 1) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
    this.db = null;
  }

  /**
   * Initialize the database connection
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('[IndexedDB] Error opening database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDB] Database opened successfully:', this.dbName);
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        console.log('[IndexedDB] Database upgrade needed, creating stores...');
        const db = event.target.result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, {
            keyPath: 'id',
            autoIncrement: false
          });

          // Create indexes for efficient querying
          objectStore.createIndex('status', 'status', { unique: false });
          objectStore.createIndex('createdAt', 'createdAt', { unique: false });
          objectStore.createIndex('projectId', 'feedbackData.projectId', { unique: false });
          objectStore.createIndex('attempts', 'attempts', { unique: false });

          console.log('[IndexedDB] Object store created:', this.storeName);
        }
      };
    });
  }

  /**
   * Add or update an item in the store
   */
  async put(item) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.put(item);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('[IndexedDB] Error putting item:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get an item by ID
   */
  async get(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(id);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('[IndexedDB] Error getting item:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all items, optionally filtered by index
   */
  async getAll(filter = null) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);

      let request;

      if (filter && filter.index && filter.value !== undefined) {
        // Use index for filtering
        const index = objectStore.index(filter.index);
        request = index.getAll(filter.value);
      } else {
        // Get all items
        request = objectStore.getAll();
      }

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[IndexedDB] Error getting all items:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete an item by ID
   */
  async delete(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.delete(id);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        console.error('[IndexedDB] Error deleting item:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete multiple items by filter
   */
  async deleteMany(filter) {
    const items = await this.getAll(filter);
    const promises = items.map(item => this.delete(item.id));
    return Promise.all(promises);
  }

  /**
   * Count items, optionally filtered by index
   */
  async count(filter = null) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);

      let request;

      if (filter && filter.index && filter.value !== undefined) {
        const index = objectStore.index(filter.index);
        request = index.count(filter.value);
      } else {
        request = objectStore.count();
      }

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('[IndexedDB] Error counting items:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clear all items from the store
   */
  async clear() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.clear();

      request.onsuccess = () => {
        console.log('[IndexedDB] Store cleared:', this.storeName);
        resolve(true);
      };

      request.onerror = () => {
        console.error('[IndexedDB] Error clearing store:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Check if IndexedDB is supported
   */
  static isSupported() {
    return 'indexedDB' in window;
  }

  /**
   * Estimate storage quota usage
   */
  static async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage,
        quota: estimate.quota,
        percentUsed: (estimate.usage / estimate.quota) * 100
      };
    }
    return null;
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[IndexedDB] Database connection closed');
    }
  }
}

export default IndexedDBWrapper;
