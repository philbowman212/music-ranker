import { describe, expect, it } from 'vitest'
import { flattenTracks, pickRelease } from './pickRelease.ts'
import type { RawRelease } from './types.ts'

function release(
  id: string,
  opts: { status?: string; date?: string; discs?: number[]; video?: boolean } = {},
): RawRelease {
  const discs = opts.discs ?? [10]
  return {
    id,
    status: opts.status ?? 'Official',
    date: opts.date ?? '2000-01-01',
    media: discs.map((n, d) => ({
      position: d + 1,
      tracks: Array.from({ length: n }, (_, i) => ({
        position: i + 1,
        title: `Track ${d + 1}-${i + 1}`,
        recording: { id: `${id}-rec-${d}-${i}`, video: opts.video ?? false },
      })),
    })),
  }
}

describe('pickRelease', () => {
  it('prefers official releases', () => {
    const picked = pickRelease([
      release('bootleg', { status: 'Bootleg', date: '1990-01-01' }),
      release('official', { date: '1995-01-01' }),
    ])
    expect(picked?.id).toBe('official')
  })

  it('falls back to any status when nothing is official', () => {
    const picked = pickRelease([release('promo', { status: 'Promotion' })])
    expect(picked?.id).toBe('promo')
  })

  it('prefers earliest date; missing dates sort last', () => {
    const picked = pickRelease([
      release('undated', { date: '' }),
      release('later', { date: '2001-06-01' }),
      release('earliest', { date: '1999-03-01' }),
    ])
    expect(picked?.id).toBe('earliest')
  })

  it('prefers fewer discs, then fewer tracks (avoids deluxe editions)', () => {
    const byDiscs = pickRelease([
      release('double', { discs: [10, 8] }),
      release('single', { discs: [10] }),
    ])
    expect(byDiscs?.id).toBe('single')

    const byTracks = pickRelease([
      release('deluxe', { discs: [16] }),
      release('standard', { discs: [11] }),
    ])
    expect(byTracks?.id).toBe('standard')
  })

  it('ignores releases without tracks; returns null when none qualify', () => {
    const picked = pickRelease([{ id: 'empty', status: 'Official', media: [] }])
    expect(picked).toBeNull()
    expect(pickRelease([])).toBeNull()
  })
})

describe('flattenTracks', () => {
  it('flattens multi-disc media in position order and renumbers', () => {
    const r = release('multi', { discs: [2, 2] })
    const tracks = flattenTracks(r)
    expect(tracks.map((t) => t.title)).toEqual([
      'Track 1-1',
      'Track 1-2',
      'Track 2-1',
      'Track 2-2',
    ])
    expect(tracks.map((t) => t.position)).toEqual([1, 2, 3, 4])
  })

  it('drops video recordings and blank titles', () => {
    const r: RawRelease = {
      id: 'x',
      status: 'Official',
      media: [
        {
          position: 1,
          tracks: [
            { position: 1, title: 'Song', recording: { id: 'a', video: false } },
            { position: 2, title: 'Music Video', recording: { id: 'b', video: true } },
            { position: 3, title: '  ', recording: { id: 'c' } },
          ],
        },
      ],
    }
    expect(flattenTracks(r).map((t) => t.title)).toEqual(['Song'])
  })
})
