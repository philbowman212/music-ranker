/** Quick-launch search links to streaming services. No API or auth needed —
 * these just open a search for "<artist> <title>" on each service, which
 * always works as a reliable fallback to in-app preview. */

export interface ServiceLink {
  name: string
  url: string
}

export function serviceLinks(artist: string, title: string): ServiceLink[] {
  const q = `${artist} ${title}`.trim()
  const enc = encodeURIComponent(q)
  return [
    { name: 'Spotify', url: `https://open.spotify.com/search/${enc}` },
    { name: 'YouTube', url: `https://www.youtube.com/results?search_query=${enc}` },
    { name: 'Apple Music', url: `https://music.apple.com/search?term=${enc}` },
  ]
}
