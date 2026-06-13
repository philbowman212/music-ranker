/**
 * Heuristic song deduplication.
 *
 * Tracks from different editions/albums are the "same song" when their
 * normalized titles match. Normalization only ever strips *trailing*
 * parenthetical/dash suffixes, and only when the suffix matches a known
 * variant vocabulary — so "(Don't Fear) The Reaper" (leading) and
 * "Time (Clock of the Heart)" (non-variant trailing) survive intact.
 * "Reprise" is deliberately not a variant keyword: reprises are distinct
 * tracks. The song-review screen before ranking is the human backstop for
 * whatever these heuristics get wrong.
 */
import type { AlbumWithTracks, RawTrack, Song } from './types.ts'

export type VariantClass =
  | 'canonical'
  | 'live'
  | 'demo'
  | 'remix'
  | 'acoustic'
  | 'instrumental'
  | 'alternate'
  | 'edit'

// Parenthesized feat credits anywhere; bare trailing "feat./ft./featuring X".
const PAREN_FEAT_RE = /\s*[([](?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]/gi
const TRAILING_FEAT_RE = /\s+(?:-\s+)?(?:feat\.?|ft\.?|featuring)\s+.+$/i

// A trailing suffix is removable only if it contains one of these.
const VARIANT_CONTENT_RE = new RegExp(
  '(?:\\b(?:' +
    [
      'remaster(?:ed)?',
      'live',
      'demo',
      'acoustic',
      'unplugged',
      'radio edit',
      'single (?:version|edit|mix)',
      'album version',
      'original (?:mix|version)',
      'mono',
      'stereo',
      'instrumental',
      're-?mix',
      'club mix',
      'extended (?:mix|version)',
      'edit',
      'version',
      'take \\d+',
      'alternate',
      'alternative',
      'early (?:version|take)',
      'rough mix',
      'outtake',
      'session',
      'rehearsal',
      're-?record(?:ed|ing)?',
      'bonus track',
      'b-side',
      'karaoke',
      'a cappella',
      'acapella',
      'clean',
      'explicit',
      'anniversary',
      'deluxe',
      're-?issue',
    ].join('|') +
    ')\\b)|(?:\\bfrom\\s+["“])',
  'i',
)

// First match wins; anything unmatched (remaster, mono, deluxe…) is treated
// as canonical because it's the same performance, just repackaged.
const CLASS_PATTERNS: [Exclude<VariantClass, 'canonical'>, RegExp][] = [
  ['live', /\b(?:live|unplugged)\b/i],
  ['demo', /\b(?:demo|rough mix|outtake|rehearsal|early (?:version|take)|session)\b/i],
  ['remix', /\b(?:re-?mix|club mix|extended (?:mix|version))\b/i],
  ['acoustic', /\bacoustic\b/i],
  ['instrumental', /\b(?:instrumental|karaoke|a cappella|acapella)\b/i],
  ['alternate', /\b(?:alternate|alternative|take \d+|re-?record(?:ed|ing)?)\b/i],
  ['edit', /\b(?:radio edit|single (?:version|edit|mix)|edit)\b/i],
]

// Preference order when a group has no canonical member.
const CLASS_PRIORITY: VariantClass[] = [
  'canonical',
  'edit',
  'alternate',
  'acoustic',
  'instrumental',
  'demo',
  'remix',
  'live',
]

function stripFeat(title: string): string {
  return title.replace(PAREN_FEAT_RE, '').replace(TRAILING_FEAT_RE, '').trim()
}

/**
 * Repeatedly strip trailing "(…)"/"[…]"/" - …" suffixes whose content matches
 * the variant vocabulary. Collected suffix texts are returned for
 * classification. Never strips a suffix that would empty the title.
 */
function stripVariantSuffixes(title: string): { base: string; suffixes: string[] } {
  let t = title.trim()
  const suffixes: string[] = []
  for (;;) {
    const paren = t.match(/^(.*?)\s*[([]([^()[\]]*)[)\]]$/)
    if (paren && paren[1].trim() !== '' && VARIANT_CONTENT_RE.test(paren[2])) {
      suffixes.push(paren[2])
      t = paren[1].trimEnd()
      continue
    }
    const dash = t.match(/^(.*\S)\s+-\s+([^-]+)$/)
    if (dash && VARIANT_CONTENT_RE.test(dash[2])) {
      suffixes.push(dash[2])
      t = dash[1].trimEnd()
      continue
    }
    return { base: t, suffixes }
  }
}

export function normalizeTitle(raw: string): string {
  let t = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[‘’]/g, "'")
  t = stripFeat(t)
  t = stripVariantSuffixes(t).base
  return t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function classifyVariant(raw: string): VariantClass {
  const { suffixes } = stripVariantSuffixes(stripFeat(raw))
  if (suffixes.length === 0) return 'canonical'
  const text = suffixes.join(' ')
  for (const [cls, re] of CLASS_PATTERNS) {
    if (re.test(text)) return cls
  }
  return 'canonical'
}

/** Display form: feat credits and variant suffixes removed, casing kept. */
function displayTitle(raw: string): string {
  const stripped = stripVariantSuffixes(stripFeat(raw)).base
  return stripped !== '' ? stripped : raw.trim()
}

interface Candidate {
  track: RawTrack
  album: AlbumWithTracks
  variant: VariantClass
}

function albumDateKey(a: AlbumWithTracks): string {
  // Missing dates sort last.
  return a.firstReleaseDate === '' ? '9999-99-99' : a.firstReleaseDate
}

export function dedupeTracks(albums: AlbumWithTracks[]): Song[] {
  const sorted = [...albums].sort(
    (a, b) => albumDateKey(a).localeCompare(albumDateKey(b)) || a.title.localeCompare(b.title),
  )

  const seenRecordings = new Set<string>()
  const groups = new Map<string, Candidate[]>()

  for (const album of sorted) {
    for (const track of album.tracks) {
      if (track.title.trim() === '') continue
      // Same recording reused across editions is trivially the same song.
      if (track.recordingId !== '') {
        if (seenRecordings.has(track.recordingId)) continue
        seenRecordings.add(track.recordingId)
      }
      const key = normalizeTitle(track.title) || track.title.trim().toLowerCase()
      let group = groups.get(key)
      if (!group) {
        group = []
        groups.set(key, group)
      }
      group.push({ track, album, variant: classifyVariant(track.title) })
    }
  }

  const songs: Song[] = []
  for (const [key, group] of groups) {
    // Group members are already in (album date, track position) order.
    const pick = CLASS_PRIORITY.map((cls) => group.find((c) => c.variant === cls)).find(
      (c) => c !== undefined,
    )!
    const title =
      pick.variant === 'canonical'
        ? displayTitle(pick.track.title)
        : // Only non-canonical takes exist (e.g. live-only song): keep the
          // suffix visible so the user knows what they're ranking.
          stripFeat(pick.track.title)
    songs.push({
      id: key,
      title,
      albumTitle: pick.album.title,
      releaseGroupId: pick.album.releaseGroupId,
    })
  }
  return songs
}
