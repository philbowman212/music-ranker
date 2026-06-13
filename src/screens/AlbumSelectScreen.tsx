import { useEffect, useRef, useState } from 'react'
import { fetchReleaseGroups, fetchTracklist } from '../musicbrainz/client.ts'
import { MbError } from '../musicbrainz/rateLimiter.ts'
import type { MbArtist, MbReleaseGroup } from '../musicbrainz/types.ts'
import { dedupeTracks } from '../songs/dedupe.ts'
import type { AlbumWithTracks, Song } from '../songs/types.ts'

interface Props {
  artist: MbArtist
  onHome: () => void
  onStart: (albums: { id: string; title: string }[], songs: Song[]) => void
}

// Secondary types that are usually redundant with the studio catalog.
const DEFAULT_EXCLUDED = new Set([
  'Live',
  'Compilation',
  'Remix',
  'DJ-mix',
  'Soundtrack',
  'Demo',
  'Interview',
  'Mixtape/Street',
])

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; groups: MbReleaseGroup[] }

type ImportState =
  | { status: 'idle' }
  | { status: 'fetching'; current: number; total: number; title: string }
  | { status: 'error'; message: string }
  | { status: 'review'; albums: AlbumWithTracks[]; songs: Song[] }

function errorMessage(err: unknown): string {
  return err instanceof MbError ? err.message : 'MusicBrainz request failed.'
}

function describe(rg: MbReleaseGroup): string {
  const year = rg.firstReleaseDate.slice(0, 4)
  const kind = [rg.primaryType, ...rg.secondaryTypes].filter(Boolean).join(' · ')
  return [year, kind].filter(Boolean).join(' — ')
}

export function AlbumSelectScreen({ artist, onHome, onStart }: Props) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' })
  // Tracklists fetched so far; lets a retry resume from the first unfetched album.
  const fetchedRef = useRef(new Map<string, AlbumWithTracks>())
  const importAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    fetchReleaseGroups(artist.id, controller.signal)
      .then((groups) => {
        setLoad({ status: 'ready', groups })
        setSelected(
          new Set(
            groups
              .filter((g) => !g.secondaryTypes.some((t) => DEFAULT_EXCLUDED.has(t)))
              .map((g) => g.id),
          ),
        )
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setLoad({ status: 'error', message: errorMessage(err) })
      })
    return () => controller.abort()
  }, [artist.id])

  useEffect(() => () => importAbortRef.current?.abort(), [])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function importAlbums(groups: MbReleaseGroup[]) {
    const chosen = groups.filter((g) => selected.has(g.id))
    importAbortRef.current?.abort()
    const controller = new AbortController()
    importAbortRef.current = controller
    try {
      for (let i = 0; i < chosen.length; i++) {
        const rg = chosen[i]
        if (fetchedRef.current.has(rg.id)) continue
        setImportState({ status: 'fetching', current: i + 1, total: chosen.length, title: rg.title })
        const album = await fetchTracklist(rg, controller.signal)
        fetchedRef.current.set(rg.id, album)
      }
      const albums = chosen.map((rg) => fetchedRef.current.get(rg.id)!)
      setImportState({ status: 'review', albums, songs: dedupeTracks(albums) })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setImportState({ status: 'error', message: errorMessage(err) })
    }
  }

  if (load.status === 'loading') {
    return (
      <main className="screen">
        <p className="muted">Loading {artist.name}'s discography…</p>
      </main>
    )
  }

  if (load.status === 'error') {
    return (
      <main className="screen">
        <button className="ghost back" onClick={onHome}>
          ← Home
        </button>
        <p className="banner error">{load.message}</p>
      </main>
    )
  }

  const { groups } = load

  if (importState.status === 'fetching') {
    return (
      <main className="screen">
        <h2>Importing {artist.name}</h2>
        <p className="muted">
          Fetching {importState.current}/{importState.total}: {importState.title}…
        </p>
        <progress value={importState.current} max={importState.total} />
        <p className="muted small">MusicBrainz allows one request per second — hang tight.</p>
      </main>
    )
  }

  if (importState.status === 'review') {
    const { albums, songs } = importState
    return (
      <main className="screen">
        <button className="ghost back" onClick={() => setImportState({ status: 'idle' })}>
          ← Albums
        </button>
        <h2>{songs.length} songs to rank</h2>
        <p className="muted">
          Duplicates, remasters, and alternate versions have been merged. Scan the list — if it
          looks right, start ranking.
        </p>
        <button
          className="primary"
          onClick={() =>
            onStart(
              albums.map((a) => ({ id: a.releaseGroupId, title: a.title })),
              songs,
            )
          }
        >
          Start ranking
        </button>
        <ul className="song-review">
          {songs.map((s) => (
            <li key={s.id}>
              <span>{s.title}</span>
              <span className="muted small">{s.albumTitle}</span>
            </li>
          ))}
        </ul>
      </main>
    )
  }

  return (
    <main className="screen">
      <button className="ghost back" onClick={onHome}>
        ← Home
      </button>
      <h2>{artist.name}</h2>
      {importState.status === 'error' && (
        <p className="banner error">
          {importState.message}{' '}
          <button className="ghost" onClick={() => void importAlbums(groups)}>
            Retry
          </button>
        </p>
      )}
      {groups.length === 0 ? (
        <p className="muted">No albums or EPs found for this artist.</p>
      ) : (
        <>
          <p className="muted">
            Choose which releases to include. Live albums and compilations are unchecked by
            default.
          </p>
          <ul className="album-list">
            {groups.map((g) => (
              <li key={g.id}>
                <label className="album-row">
                  <input
                    type="checkbox"
                    checked={selected.has(g.id)}
                    onChange={() => toggle(g.id)}
                  />
                  <span className="album-title">{g.title}</span>
                  <span className="muted small">{describe(g)}</span>
                </label>
              </li>
            ))}
          </ul>
          <button
            className="primary"
            disabled={selected.size === 0}
            onClick={() => void importAlbums(groups)}
          >
            Import {selected.size} {selected.size === 1 ? 'release' : 'releases'}
          </button>
        </>
      )}
    </main>
  )
}
