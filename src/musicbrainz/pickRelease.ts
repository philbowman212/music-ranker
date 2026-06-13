import type { RawTrack } from '../songs/types.ts'
import type { RawRelease } from './types.ts'

function trackCount(r: RawRelease): number {
  return (r.media ?? []).reduce((sum, m) => sum + (m.tracks?.length ?? 0), 0)
}

function dateKey(r: RawRelease): string {
  const d = r.date ?? ''
  return d === '' ? '9999-99-99' : d
}

/**
 * Choose the release that best represents a release group's canonical
 * tracklist: official status, then earliest date, then fewest discs, then
 * fewest tracks (avoids deluxe editions), then id for stability.
 */
export function pickRelease(releases: RawRelease[]): RawRelease | null {
  const withTracks = releases.filter((r) => trackCount(r) > 0)
  if (withTracks.length === 0) return null
  const official = withTracks.filter((r) => r.status === 'Official')
  const pool = official.length > 0 ? official : withTracks
  return [...pool].sort(
    (a, b) =>
      dateKey(a).localeCompare(dateKey(b)) ||
      (a.media?.length ?? 0) - (b.media?.length ?? 0) ||
      trackCount(a) - trackCount(b) ||
      a.id.localeCompare(b.id),
  )[0]
}

/** Flatten a release's media into one track list, dropping video recordings. */
export function flattenTracks(release: RawRelease): RawTrack[] {
  const media = [...(release.media ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  )
  const tracks: RawTrack[] = []
  for (const medium of media) {
    for (const t of medium.tracks ?? []) {
      if (t.recording?.video === true) continue
      const title = (t.title ?? '').trim()
      if (title === '') continue
      tracks.push({
        title,
        recordingId: t.recording?.id ?? '',
        position: tracks.length + 1,
      })
    }
  }
  return tracks
}
