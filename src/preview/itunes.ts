/**
 * 30-second audio previews via the iTunes Search API (no key required).
 *
 * Fetched on demand (only when the user clicks Preview), and cached by song id
 * — a song recurs across many comparisons, so caching keeps us well under the
 * API's ~20 req/min limit. A `null` result is cached too, so "no preview
 * available" isn't retried on every encounter.
 *
 * iTunes' fuzzy search returns the wrong track for songs/artists with common
 * words (e.g. Brand New – "Bed"), so we fetch several candidates and pick the
 * one whose artist actually matches the artist we imported from MusicBrainz,
 * rather than blindly trusting the top result.
 */
import { classifyVariant, normalizeTitle } from '../songs/dedupe.ts'

export interface ItunesResult {
  previewUrl?: string
  artistName?: string
  trackName?: string
}

interface ItunesResponse {
  results?: ItunesResult[]
}

// songId -> preview URL, or null when iTunes has no confident match.
const cache = new Map<string, string | null>()

function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function artistMatches(candidate: string, target: string): boolean {
  const a = normalizeName(candidate)
  const b = normalizeName(target)
  if (a === '' || b === '') return false
  // Equality, or one is a leading prefix of the other at a word boundary
  // (covers "Brand New" vs "Brand New feat. X" without matching "Air"→"Airbourne").
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `)
}

/**
 * Choose the iTunes result that genuinely matches our artist + title, or null
 * if none does (better no preview than a confidently wrong one).
 */
export function pickItunesMatch(
  results: ItunesResult[],
  artist: string,
  title: string,
): ItunesResult | null {
  const playable = results.filter((r) => r.previewUrl)
  const byArtist = playable.filter((r) => artistMatches(r.artistName ?? '', artist))
  if (byArtist.length === 0) return null
  const wantTitle = normalizeTitle(title)
  const titleMatches = byArtist.filter((r) => normalizeTitle(r.trackName ?? '') === wantTitle)
  const pool = titleMatches.length > 0 ? titleMatches : byArtist
  // Prefer the canonical studio take over live/acoustic/remix versions, then
  // the shortest title (avoids "... - Remastered 2008" style padding).
  return [...pool].sort((x, y) => {
    const cx = classifyVariant(x.trackName ?? '') === 'canonical' ? 0 : 1
    const cy = classifyVariant(y.trackName ?? '') === 'canonical' ? 0 : 1
    return cx - cy || (x.trackName?.length ?? 0) - (y.trackName?.length ?? 0)
  })[0]
}

export async function fetchPreviewUrl(
  songId: string,
  artist: string,
  title: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const cached = cache.get(songId)
  if (cached !== undefined) return cached

  const term = encodeURIComponent(`${artist} ${title}`.trim())
  const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=25`
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`iTunes search failed: HTTP ${response.status}`)
  }
  const data = (await response.json()) as ItunesResponse
  const match = pickItunesMatch(data.results ?? [], artist, title)
  const previewUrl = match?.previewUrl ?? null
  cache.set(songId, previewUrl)
  return previewUrl
}
