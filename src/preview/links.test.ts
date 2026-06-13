import { describe, expect, it } from 'vitest'
import { serviceLinks } from './links.ts'

describe('serviceLinks', () => {
  it('builds search links for the three services', () => {
    const links = serviceLinks('Radiohead', 'Paranoid Android')
    expect(links.map((l) => l.name)).toEqual(['Spotify', 'YouTube', 'Apple Music'])
    expect(links[0].url).toBe('https://open.spotify.com/search/Radiohead%20Paranoid%20Android')
    expect(links[1].url).toBe(
      'https://www.youtube.com/results?search_query=Radiohead%20Paranoid%20Android',
    )
    expect(links[2].url).toBe('https://music.apple.com/search?term=Radiohead%20Paranoid%20Android')
  })

  it('escapes special characters in artist and title', () => {
    const [spotify] = serviceLinks('AC/DC', 'T.N.T.')
    expect(spotify.url).toBe('https://open.spotify.com/search/AC%2FDC%20T.N.T.')
  })
})
