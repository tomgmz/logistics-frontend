import type { StateStorage } from 'zustand/middleware'

/**
 * Encrypted localStorage, for state the app persists between visits (the
 * signed-in user's profile).
 *
 * Values are AES-256-GCM encrypted under a key generated in this browser with
 * Web Crypto as NON-EXTRACTABLE and kept in IndexedDB. Page code can ask the
 * browser to encrypt and decrypt with it, but nothing — not the app, not a
 * script that copies storage out — can read the key's bytes. So a copy of
 * localStorage (a backup, another profile, a malware sweep of the disk, a
 * DevTools screenshot) is ciphertext that cannot be opened anywhere else.
 *
 * What this does NOT do: stop a script already running inside the page from
 * calling decrypt, because the page itself must be able to. That is what the
 * httpOnly session cookies and the CSP are for.
 *
 * Where IndexedDB is unavailable (some private-browsing modes) nothing is
 * persisted rather than falling back to plaintext; the session is rebuilt from
 * the server on the next load.
 */

const DB_NAME  = 'fleetview-secure'
const STORE    = 'keys'
const KEY_ID   = 'local-storage'
const PREFIX   = 'enc.v1.'

let keyPromise: Promise<CryptoKey | null> | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function loadOrCreateKey(): Promise<CryptoKey | null> {
  try {
    // Generated up front: an IndexedDB transaction closes across an await.
    const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const db = await openDb()
    return await new Promise<CryptoKey>((resolve, reject) => {
      const tx    = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const get   = store.get(KEY_ID)
      // Another tab may have created the key first; whichever is stored wins,
      // inside one transaction, so every tab ends up on the same key.
      get.onsuccess = () => {
        if (get.result) {
          resolve(get.result as CryptoKey)
        } else {
          store.put(fresh, KEY_ID)
          resolve(fresh)
        }
      }
      tx.onerror = () => reject(tx.error)
      tx.oncomplete = () => db.close()
    })
  } catch {
    return null
  }
}

function getKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.indexedDB || !window.crypto?.subtle) return Promise.resolve(null)
  keyPromise ??= loadOrCreateKey()
  return keyPromise
}

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

export async function encryptString(plain: string, label: string): Promise<string | null> {
  const key = await getKey()
  if (!key) return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(label) },
    key,
    new TextEncoder().encode(plain),
  )
  return `${PREFIX}${toB64(iv)}.${toB64(new Uint8Array(ct))}`
}

/** Null for anything that is not ours or does not open (old plaintext, another browser's key). */
export async function decryptString(stored: string | null, label: string): Promise<string | null> {
  if (!stored?.startsWith(PREFIX)) return null
  const [ivPart, ctPart] = stored.slice(PREFIX.length).split('.')
  if (!ivPart || !ctPart) return null
  const key = await getKey()
  if (!key) return null
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(ivPart), additionalData: new TextEncoder().encode(label) },
      key,
      fromB64(ctPart),
    )
    return new TextDecoder().decode(pt)
  } catch {
    return null
  }
}

/** Decrypt and parse a persisted zustand value (e.g. from a `storage` event). */
export async function readPersisted<T = unknown>(stored: string | null, name: string): Promise<T | null> {
  const json = await decryptString(stored, name)
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

/** A zustand `StateStorage` over encrypted localStorage. The item name is the associated data. */
export const encryptedLocalStorage: StateStorage = {
  getItem: async (name) => {
    if (typeof window === 'undefined') return null
    const stored = window.localStorage.getItem(name)
    const plain  = await decryptString(stored, name)
    // Not ours or no longer opens (a pre-encryption plaintext value, or a key
    // that was lost): drop it rather than leave readable data lying around.
    if (stored && plain === null) window.localStorage.removeItem(name)
    return plain
  },
  setItem: async (name, value) => {
    if (typeof window === 'undefined') return
    const sealed = await encryptString(value, name)
    if (sealed) window.localStorage.setItem(name, sealed)
    else window.localStorage.removeItem(name)
  },
  removeItem: (name) => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(name)
  },
}
