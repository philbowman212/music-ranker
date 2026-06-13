import { describe, expect, it } from 'vitest'
import { classifyVariant, dedupeTracks, normalizeTitle } from './dedupe.ts'
import type { AlbumWithTracks } from './types.ts'

let nextRecording = 0
function album(
  title: string,
  date: string,
  trackTitles: string[],
  opts: { reuseRecordingIds?: string[] } = {},
): AlbumWithTracks {
  return {
    releaseGroupId: `rg-${title}`,
    title,
    firstReleaseDate: date,
    tracks: trackTitles.map((t, i) => ({
      title: t,
      recordingId: opts.reuseRecordingIds?.[i] ?? `rec-${nextRecording++}`,
      position: i + 1,
    })),
  }
}

describe('normalizeTitle', () => {
  it('strips variant suffixes in parens, brackets, and dash form', () => {
    expect(normalizeTitle('Creep (Acoustic)')).toBe('creep')
    expect(normalizeTitle('Airbag - 2009 Remaster')).toBe('airbag')
    expect(normalizeTitle('Karma Police [Live at Glastonbury]')).toBe('karma police')
    expect(normalizeTitle('Lucky (Live) (2011 Remaster)')).toBe('lucky')
    expect(normalizeTitle('One More Time - Club Mix')).toBe('one more time')
  })

  it('keeps leading and non-variant trailing parentheticals', () => {
    expect(normalizeTitle("(Don't Fear) The Reaper")).toBe('dont fear the reaper')
    expect(normalizeTitle('Time (Clock of the Heart)')).not.toBe(normalizeTitle('Time'))
  })

  it('merges feat credits into the base song', () => {
    expect(normalizeTitle('Get Lucky (feat. Pharrell Williams)')).toBe('get lucky')
    expect(normalizeTitle('Get Lucky feat. Pharrell Williams')).toBe('get lucky')
    expect(normalizeTitle('Get Lucky')).toBe('get lucky')
  })

  it('normalizes case, punctuation, and diacritics', () => {
    expect(normalizeTitle('Búrn!!')).toBe('burn')
    expect(normalizeTitle("Don’t Stop")).toBe(normalizeTitle("Don't Stop"))
  })

  it('does not strip a suffix that would empty the title', () => {
    expect(normalizeTitle('(Live)')).toBe('live')
  })
})

describe('classifyVariant', () => {
  it('classifies common variants', () => {
    expect(classifyVariant('Creep (Acoustic)')).toBe('acoustic')
    expect(classifyVariant('Creep (Live at the Astoria)')).toBe('live')
    expect(classifyVariant('Creep (Demo)')).toBe('demo')
    expect(classifyVariant('Around the World (Extended Mix)')).toBe('remix')
    expect(classifyVariant('Creep (Radio Edit)')).toBe('edit')
    expect(classifyVariant('Creep (Instrumental)')).toBe('instrumental')
    expect(classifyVariant('Creep (Alternate Take)')).toBe('alternate')
  })

  it('treats remasters and plain titles as canonical', () => {
    expect(classifyVariant('Airbag - 2009 Remaster')).toBe('canonical')
    expect(classifyVariant('Airbag')).toBe('canonical')
    expect(classifyVariant('Time (Clock of the Heart)')).toBe('canonical')
  })
})

describe('dedupeTracks', () => {
  it('collapses variants into the canonical song and drops non-canonical takes', () => {
    const songs = dedupeTracks([
      album('Pablo Honey', '1993-02-22', ['Creep', 'Stop Whispering']),
      album('B-Sides', '1994-01-01', ['Creep (Acoustic)', 'Creep (Live)', 'Stop Whispering']),
    ])
    expect(songs.map((s) => s.title)).toEqual(['Creep', 'Stop Whispering'])
    expect(songs[0].albumTitle).toBe('Pablo Honey')
  })

  it('collapses remastered duplicates and keeps a clean display title', () => {
    const songs = dedupeTracks([
      album('OK Computer', '1997-05-21', ['Airbag']),
      album('OK Computer OKNOTOK', '2017-06-23', ['Airbag - 2017 Remaster']),
    ])
    expect(songs).toHaveLength(1)
    expect(songs[0].title).toBe('Airbag')
    expect(songs[0].albumTitle).toBe('OK Computer')
  })

  it('keeps a live-only song with its suffix visible', () => {
    const songs = dedupeTracks([album('Alive 2007', '2007-11-19', ['Steam Machine (Live)'])])
    expect(songs).toHaveLength(1)
    expect(songs[0].title).toBe('Steam Machine (Live)')
  })

  it('merges feat-credit variants and identical recording ids', () => {
    const songs = dedupeTracks([
      album('Random Access Memories', '2013-05-17', ['Get Lucky (feat. Pharrell Williams)']),
      album('Deluxe Edition', '2014-01-01', ['Get Lucky'], {
        reuseRecordingIds: ['shared-rec'],
      }),
      album('Another Comp', '2015-01-01', ['Get Lucky'], { reuseRecordingIds: ['shared-rec'] }),
    ])
    expect(songs).toHaveLength(1)
    expect(songs[0].title).toBe('Get Lucky')
    expect(songs[0].albumTitle).toBe('Random Access Memories')
  })

  it('keeps protected parenthetical titles distinct', () => {
    const songs = dedupeTracks([
      album('Agents of Fortune', '1976-05-21', ["(Don't Fear) The Reaper"]),
      album('Colour by Numbers', '1983-10-10', ['Time (Clock of the Heart)', 'Time']),
    ])
    expect(songs.map((s) => s.title).sort()).toEqual([
      "(Don't Fear) The Reaper",
      'Time',
      'Time (Clock of the Heart)',
    ])
  })

  it('keeps reprises distinct', () => {
    const songs = dedupeTracks([
      album('The Wall', '1979-11-30', ['Another Brick in the Wall', 'Another Brick in the Wall (Reprise)']),
    ])
    expect(songs).toHaveLength(2)
  })

  it('skips blank titles and orders output by album date then position', () => {
    const songs = dedupeTracks([
      album('Second', '2001-01-01', ['B1', '', 'B2']),
      album('First', '1999-01-01', ['A1', 'A2']),
    ])
    expect(songs.map((s) => s.title)).toEqual(['A1', 'A2', 'B1', 'B2'])
  })
})
