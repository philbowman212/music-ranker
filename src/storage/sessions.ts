import type { EngineSnapshot } from '../ranking/engine.ts'
import type { Song } from '../songs/types.ts'

export const STORAGE_VERSION = 1 as const

export interface SavedSession {
  version: typeof STORAGE_VERSION
  id: string
  createdAt: number
  updatedAt: number
  artist: { id: string; name: string }
  albums: { id: string; title: string }[]
  /** Canonical song list, ALREADY SHUFFLED — defines the engine index space. */
  songs: Song[]
  engine: EngineSnapshot
  completedAt: number | null
}

const INDEX_KEY = 'mr:v1:index'
const sessionKey = (id: string) => `mr:v1:session:${id}`

// When localStorage is unavailable (private mode, quota), degrade to
// in-memory so the app still works for the current page load.
const memory = new Map<string, string>()
let usingMemory = false

function read(key: string): string | null {
  if (!usingMemory) {
    try {
      return localStorage.getItem(key)
    } catch {
      usingMemory = true
    }
  }
  return memory.get(key) ?? null
}

function write(key: string, value: string): void {
  if (!usingMemory) {
    try {
      localStorage.setItem(key, value)
      return
    } catch {
      usingMemory = true
    }
  }
  memory.set(key, value)
}

function remove(key: string): void {
  if (!usingMemory) {
    try {
      localStorage.removeItem(key)
      return
    } catch {
      usingMemory = true
    }
  }
  memory.delete(key)
}

export function storageAvailable(): boolean {
  if (usingMemory) return false
  try {
    const probe = 'mr:probe'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    usingMemory = true
    return false
  }
}

function readIndex(): string[] {
  const raw = read(INDEX_KEY)
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function loadSession(id: string): SavedSession | null {
  const raw = read(sessionKey(id))
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as SavedSession
    if (parsed.version !== STORAGE_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

/** Most recently updated first. */
export function listSessions(): SavedSession[] {
  return readIndex()
    .map(loadSession)
    .filter((s): s is SavedSession => s !== null)
}

export function saveSession(s: SavedSession): void {
  write(sessionKey(s.id), JSON.stringify(s))
  const index = readIndex().filter((id) => id !== s.id)
  index.unshift(s.id)
  write(INDEX_KEY, JSON.stringify(index))
}

export function deleteSession(id: string): void {
  remove(sessionKey(id))
  write(INDEX_KEY, JSON.stringify(readIndex().filter((x) => x !== id)))
}
