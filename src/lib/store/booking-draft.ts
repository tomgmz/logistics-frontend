/**
 * The client booking draft survives a reload of the same tab, and nothing more.
 *
 * The form itself is the Redux `booking` slice, persisted by redux-persist into
 * sessionStorage (one copy per tab, gone when the tab closes). The attached
 * documents are File objects, which JSON storage cannot hold, so they go to
 * IndexedDB under an id kept in that same tab's sessionStorage. IndexedDB is
 * shared by every tab, so entries are stamped and old ones swept.
 *
 * Every storage call is wrapped: private browsing on iOS Safari and blocked
 * site data must fall back to an empty form, never throw.
 */

export const BOOKING_PERSIST_KEY = 'booking'

const TAB_KEY   = 'booking-draft-tab'
const DB_NAME   = 'booking-draft'
const DB_STORE  = 'files'
const STALE_MS  = 24 * 60 * 60 * 1000

function session(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** redux-persist storage engine over sessionStorage; a no-op on the server. */
export const sessionDraftStorage = {
  getItem(key: string): Promise<string | null> {
    try { return Promise.resolve(session()?.getItem(key) ?? null) } catch { return Promise.resolve(null) }
  },
  setItem(key: string, value: string): Promise<void> {
    try { session()?.setItem(key, value) } catch { /* full or blocked: the draft just won't survive */ }
    return Promise.resolve()
  },
  removeItem(key: string): Promise<void> {
    try { session()?.removeItem(key) } catch { /* ignore */ }
    return Promise.resolve()
  },
}

function tabId(): string | null {
  const s = session()
  if (!s) return null
  try {
    let id = s.getItem(TAB_KEY)
    if (!id) {
      id = crypto.randomUUID()
      s.setItem(TAB_KEY, id)
    }
    return id
  } catch {
    return null
  }
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror   = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

interface FileEntry { files: File[]; savedAt: number }

/** The documents this tab had attached before the reload. */
export async function loadDraftFiles(): Promise<File[]> {
  const id = tabId()
  const db = id ? await openDb() : null
  if (!db || !id) return []
  return new Promise((resolve) => {
    try {
      const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(id)
      req.onsuccess = () => resolve((req.result as FileEntry | undefined)?.files ?? [])
      req.onerror   = () => resolve([])
    } catch {
      resolve([])
    }
  }).finally(() => db.close()) as Promise<File[]>
}

/** Replaces this tab's saved documents, and sweeps entries left by closed tabs. */
export async function saveDraftFiles(files: File[]): Promise<void> {
  const id = tabId()
  const db = id ? await openDb() : null
  if (!db || !id) return
  try {
    const tx    = db.transaction(DB_STORE, 'readwrite')
    const store = tx.objectStore(DB_STORE)
    if (files.length) store.put({ files, savedAt: Date.now() } satisfies FileEntry, id)
    else store.delete(id)

    const cutoff = Date.now() - STALE_MS
    const cursorReq = store.openCursor()
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (!cursor) return
      if (cursor.key !== id && ((cursor.value as FileEntry).savedAt ?? 0) < cutoff) cursor.delete()
      cursor.continue()
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve()
      tx.onerror    = () => resolve()
      tx.onabort    = () => resolve()
    })
  } catch {
    /* ignore */
  } finally {
    db.close()
  }
}

/**
 * Drops this tab's draft at once. Synchronous for the form, so it is gone even
 * when a sign-out navigates away before redux-persist's next write.
 */
export function clearBookingDraft(): void {
  try { session()?.removeItem(`persist:${BOOKING_PERSIST_KEY}`) } catch { /* ignore */ }
  void saveDraftFiles([])
}
