/**
 * When each open chat on the Messages page was last read from the server, so
 * clicking back into a chat within FRESH_MS shows what was on screen instead
 * of asking again (every messaging route shares one per-user rate limit).
 *
 * Kept in memory for this tab only. The history itself lives in the
 * account-scoped TanStack Query cache (cachedData/storeData); a chat is only
 * skipped when that cache also has it, so another account in the same tab
 * never benefits from this map.
 *
 * Anything that may have changed a chat while it was closed (a message in it,
 * an unsent message, a reaction) calls markChatStale, and the next open reads
 * fresh.
 */
export const FRESH_MS = 30_000

const loadedAt = new Map<string, number>()

export const dmChatKey    = (conversationId: string) => `dm:${conversationId}`
export const groupChatKey = (groupId: string)        => `group:${groupId}`

export function markChatFresh(key: string): void { loadedAt.set(key, Date.now()) }
export function markChatStale(key: string): void { loadedAt.delete(key) }

/** Every chat whose key starts with `prefix` reads fresh next time, except `keep`. */
export function markAllChatsStale(prefix: string, keep: string | null = null): void {
  for (const key of [...loadedAt.keys()]) if (key.startsWith(prefix) && key !== keep) loadedAt.delete(key)
}

export function isChatFresh(key: string): boolean {
  const at = loadedAt.get(key)
  return at !== undefined && Date.now() - at < FRESH_MS
}
