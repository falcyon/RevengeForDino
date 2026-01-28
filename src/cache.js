// Persistent cache: Curated (L0) + Firebase Realtime DB (L1)
// Keys are pre-normalized by Gemini (see gemini.js normalizePrompt).

import { CURATED_OBJECTS } from './curatedCache.js';

// Firebase keys cannot contain . $ # [ ] /
function encodeFirebaseKey(key) {
  return key.replace(/[.$#\[\]/]/g, '_');
}

// Kept for dev.js compatibility (no longer used for caching)
export const LS_PREFIX_EXPORT = 'objcache:';

export async function fetchAllFirebase() {
  const firebaseUrl = import.meta.env.VITE_FIREBASE_DB_URL || '';
  if (!firebaseUrl) return {};
  try {
    const res = await fetch(`${firebaseUrl}/cache.json`);
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

export function createCache() {
  const firebaseUrl = import.meta.env.VITE_FIREBASE_DB_URL || '';

  async function getFirebase(key) {
    if (!firebaseUrl) return null;
    try {
      const fbKey = encodeFirebaseKey(key);
      const res = await fetch(`${firebaseUrl}/cache/${fbKey}.json`);
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data === 'string' ? data : null;
    } catch {
      return null;
    }
  }

  function setFirebase(key, code) {
    if (!firebaseUrl) return;
    const fbKey = encodeFirebaseKey(key);
    // Fire-and-forget
    fetch(`${firebaseUrl}/cache/${fbKey}.json`, {
      method: 'PUT',
      body: JSON.stringify(code),
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
  }

  return {
    async get(key) {
      // L0: Curated (highest priority)
      if (CURATED_OBJECTS[key]) {
        console.log('[Cache hit] Curated:', key);
        return CURATED_OBJECTS[key];
      }

      // L1: Firebase
      const remote = await getFirebase(key);
      if (remote) {
        console.log('[Cache hit] Firebase:', key);
        return remote;
      }

      console.log('[Cache miss]', key);
      return null;
    },

    set(key, code) {
      setFirebase(key, code);
    },
  };
}
