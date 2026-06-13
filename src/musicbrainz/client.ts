import type { AlbumWithTracks } from '../songs/types.ts'
import { flattenTracks, pickRelease } from './pickRelease.ts'
import { MbError, rateLimitedFetchJson } from './rateLimiter.ts'
import type {
  MbArtist,
  MbReleaseGroup,
  RawArtistSearchResponse,
  RawReleaseBrowseResponse,
  RawReleaseGroupBrowseResponse,
} from './types.ts'

const BASE = 'https://musicbrainz.org/ws/2'

/** Escape Lucene query syntax so user input is a literal phrase. */
function escapeLucene(input: string): string {
  return input.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&')
}

export async function searchArtists(name: string, signal?: AbortSignal): Promise<MbArtist[]> {
  const query = encodeURIComponent(`artist:"${escapeLucene(name.trim())}"`)
  const url = `${BASE}/artist?query=${query}&fmt=json&limit=8`
  const data = (await rateLimitedFetchJson(url, signal)) as RawArtistSearchResponse
  return (data.artists ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    disambiguation: a.disambiguation ?? '',
    country: a.country ?? '',
    type: a.type ?? '',
  }))
}

export async function fetchReleaseGroups(
  artistId: string,
  signal?: AbortSignal,
): Promise<MbReleaseGroup[]> {
  const groups: MbReleaseGroup[] = []
  const limit = 100
  for (let offset = 0; ; offset += limit) {
    const url =
      `${BASE}/release-group?artist=${encodeURIComponent(artistId)}` +
      `&type=album%7Cep&fmt=json&limit=${limit}&offset=${offset}`
    const data = (await rateLimitedFetchJson(url, signal)) as RawReleaseGroupBrowseResponse
    const page = data['release-groups'] ?? []
    for (const rg of page) {
      groups.push({
        id: rg.id,
        title: rg.title,
        primaryType: rg['primary-type'] ?? '',
        secondaryTypes: rg['secondary-types'] ?? [],
        firstReleaseDate: rg['first-release-date'] ?? '',
      })
    }
    const total = data['release-group-count'] ?? groups.length
    if (page.length === 0 || groups.length >= total) break
  }
  groups.sort((a, b) =>
    (a.firstReleaseDate || '9999').localeCompare(b.firstReleaseDate || '9999'),
  )
  return groups
}

export async function fetchTracklist(
  rg: MbReleaseGroup,
  signal?: AbortSignal,
): Promise<AlbumWithTracks> {
  const url =
    `${BASE}/release?release-group=${encodeURIComponent(rg.id)}` +
    `&status=official&inc=recordings&fmt=json&limit=100`
  const data = (await rateLimitedFetchJson(url, signal)) as RawReleaseBrowseResponse
  const release = pickRelease(data.releases ?? [])
  if (!release) {
    throw new MbError('http', `No release with tracks found for "${rg.title}"`)
  }
  return {
    releaseGroupId: rg.id,
    title: rg.title,
    firstReleaseDate: rg.firstReleaseDate,
    tracks: flattenTracks(release),
  }
}
