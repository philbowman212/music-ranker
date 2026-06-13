export interface RawTrack {
  title: string
  recordingId: string
  position: number
}

export interface AlbumWithTracks {
  releaseGroupId: string
  title: string
  /** ISO date (possibly partial, e.g. "1997" or "1997-05") or empty. */
  firstReleaseDate: string
  tracks: RawTrack[]
}

export interface Song {
  /** Normalized dedupe key; stable within a session. */
  id: string
  title: string
  /** Earliest selected album containing this song. */
  albumTitle: string
  releaseGroupId: string
}
