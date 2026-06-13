import { describe, expect, it } from 'vitest'
import { pickItunesMatch, type ItunesResult } from './itunes.ts'

function r(artistName: string, trackName: string, previewUrl = 'https://p/x.m4a'): ItunesResult {
  return { artistName, trackName, previewUrl }
}

describe('pickItunesMatch', () => {
  it('picks the result by the right artist, not the fuzzy top hit', () => {
    // The classic failure: generic words surface wrong artists first.
    const results = [
      r('Bowling for Soup', 'Bed'),
      r('Some Cover Band', 'Brand New Day'),
      r('Brand New', 'Bed'),
    ]
    const match = pickItunesMatch(results, 'Brand New', 'Bed')
    expect(match?.artistName).toBe('Brand New')
    expect(match?.trackName).toBe('Bed')
  })

  it('returns null when no result matches the artist (no wrong preview)', () => {
    const results = [r('Bowling for Soup', 'Bed'), r('Random Artist', 'Bed')]
    expect(pickItunesMatch(results, 'Brand New', 'Bed')).toBeNull()
  })

  it('prefers an exact title match among the artist matches', () => {
    const results = [
      r('Radiohead', 'Creep (Acoustic)'),
      r('Radiohead', 'Creep'),
    ]
    expect(pickItunesMatch(results, 'Radiohead', 'Creep')?.trackName).toBe('Creep')
  })

  it('falls back to the first artist match when no exact title match exists', () => {
    const results = [r('Radiohead', 'Creep (Live in Prague)')]
    expect(pickItunesMatch(results, 'Radiohead', 'Creep')?.trackName).toBe('Creep (Live in Prague)')
  })

  it('tolerates feat. suffixes and case/punctuation in the artist name', () => {
    const results = [r('Daft Punk feat. Pharrell Williams', 'Get Lucky')]
    expect(pickItunesMatch(results, 'Daft Punk', 'Get Lucky')?.trackName).toBe('Get Lucky')
  })

  it('does not match a different artist that merely shares a prefix word', () => {
    const results = [r('Airbourne', 'Runnin Wild')]
    expect(pickItunesMatch(results, 'Air', 'Playground Love')).toBeNull()
  })

  it('ignores results without a preview url', () => {
    const results = [{ artistName: 'Brand New', trackName: 'Bed' }]
    expect(pickItunesMatch(results, 'Brand New', 'Bed')).toBeNull()
  })
})
