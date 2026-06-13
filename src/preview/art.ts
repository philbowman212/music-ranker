/**
 * Album art via the Cover Art Archive, keyed by the MusicBrainz release-group
 * id we already store on each song — so it's the exact album we imported, not
 * a fuzzy search guess. Served as a plain <img> (no CORS or fetch needed);
 * release groups without cover art 404, which the <img> onError handles.
 */
export function albumArtUrl(releaseGroupId: string): string {
  return `https://coverartarchive.org/release-group/${releaseGroupId}/front-250`
}
