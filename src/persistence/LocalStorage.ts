import type { SerializedGameState } from '../sim/types';
import { SAVE_VERSION } from '../utils/constants';
import * as LZString from 'lz-string';

const DB_NAME = 'deep_shaft_syndicate';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

let db: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function saveLocal(key: string, state: SerializedGameState): Promise<void> {
  try {
    const database = await getDB();
    const compressed = LZString.compressToUTF16(JSON.stringify(state));
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.put({
        key,
        data: compressed,
        version: SAVE_VERSION,
        timestamp: Date.now(),
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Local save failed:', err);
    // Fallback to localStorage if IndexedDB fails
    try {
      const compressed = LZString.compressToUTF16(JSON.stringify(state));
      localStorage.setItem(`dss_${key}`, compressed);
    } catch (e) {
      console.error('localStorage fallback also failed:', e);
    }
  }
}

export async function loadLocal(key: string): Promise<SerializedGameState | null> {
  try {
    const database = await getDB();
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          // Try localStorage fallback
          const lsData = localStorage.getItem(`dss_${key}`);
          if (lsData) {
            try {
              const decompressed = LZString.decompressFromUTF16(lsData);
              resolve(decompressed ? JSON.parse(decompressed) : null);
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
          return;
        }
        try {
          const decompressed = LZString.decompressFromUTF16(result.data);
          resolve(decompressed ? JSON.parse(decompressed) : null);
        } catch {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Local load failed:', err);
    // Fallback
    const lsData = localStorage.getItem(`dss_${key}`);
    if (lsData) {
      try {
        const decompressed = LZString.decompressFromUTF16(lsData);
        return decompressed ? JSON.parse(decompressed) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function deleteLocal(key: string): Promise<void> {
  try {
    const database = await getDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    localStorage.removeItem(`dss_${key}`);
  }
}

export async function listLocalSaves(): Promise<string[]> {
  try {
    const database = await getDB();
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result.map(String));
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export function exportSaveToJSON(state: SerializedGameState): string {
  return JSON.stringify(state, null, 2);
}

export function importSaveFromJSON(json: string): SerializedGameState | null {
  try {
    const data = JSON.parse(json);
    if (!data.tick && data.tick !== 0) return null;
    if (!data.tiles) return null;
    return data as SerializedGameState;
  } catch {
    return null;
  }
}
