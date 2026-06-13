/** Subset of MusicBrainz WS/2 JSON we actually read; everything optional-ish
 * because MB data is uneven. Raw* types mirror the wire format. */

export interface MbArtist {
  id: string
  name: string
  disambiguation: string
  country: string
  type: string
}

export interface MbReleaseGroup {
  id: string
  title: string
  primaryType: string
  secondaryTypes: string[]
  firstReleaseDate: string
}

export interface RawArtistSearchResponse {
  artists?: RawArtist[]
}

export interface RawArtist {
  id: string
  name: string
  disambiguation?: string
  country?: string
  type?: string
}

export interface RawReleaseGroupBrowseResponse {
  'release-group-count'?: number
  'release-group-offset'?: number
  'release-groups'?: RawReleaseGroup[]
}

export interface RawReleaseGroup {
  id: string
  title: string
  'primary-type'?: string | null
  'secondary-types'?: string[]
  'first-release-date'?: string
}

export interface RawReleaseBrowseResponse {
  releases?: RawRelease[]
}

export interface RawRelease {
  id: string
  title?: string
  status?: string | null
  date?: string
  media?: RawMedium[]
}

export interface RawMedium {
  position?: number
  tracks?: RawTrackEntry[]
}

export interface RawTrackEntry {
  position?: number
  title?: string
  recording?: {
    id?: string
    video?: boolean | null
  }
}
