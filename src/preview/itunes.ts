/**
 * 30-second audio previews via the iTunes Search API (no key required).
 *
 * Fetched on demand (only when the user clicks Preview), and cached by song id
 * — a song recurs across many comparisons, so caching keeps us well under the
 * API's ~20 req/min limit. A `null` result is cached too, so "no preview
 * available" isn't retried on every encounter.
 *
 * If the request fails (offline, CORS, rate limit), callers fall back to the
 * streaming-service search links.
 */

interface ItunesResult {
  previewUrl?: string
}

interface ItunesResponse {
  results?: ItunesResult[]
}

// songId -> preview URL, or null when iTunes has no match.
const cache = new Map<string, string | null>()

export function cachedPreview(songId: string): string | null | undefined {
  return cache.get(songId)
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
  const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=1`
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`iTunes search failed: HTTP ${response.status}`)
  }
  const data = (await response.json()) as ItunesResponse
  const previewUrl = data.results?.[0]?.previewUrl ?? null
  cache.set(songId, previewUrl)
  return previewUrl
}
