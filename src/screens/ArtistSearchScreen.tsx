import { useRef, useState } from 'react'
import { searchArtists } from '../musicbrainz/client.ts'
import { MbError } from '../musicbrainz/rateLimiter.ts'
import type { MbArtist } from '../musicbrainz/types.ts'

interface Props {
  onSelect: (artist: MbArtist) => void
  onHome: () => void
}

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; artists: MbArtist[] }
  | { status: 'error'; message: string }

export function ArtistSearchScreen({ onSelect, onHome }: Props) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  async function search() {
    const name = query.trim()
    if (name === '') return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ status: 'searching' })
    try {
      const artists = await searchArtists(name, controller.signal)
      setState({ status: 'results', artists })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setState({
        status: 'error',
        message: err instanceof MbError ? err.message : 'Search failed. Please try again.',
      })
    }
  }

  return (
    <main className="screen">
      <button className="ghost back" onClick={onHome}>
        ← Home
      </button>
      <h2>Who are we ranking?</h2>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <input
          autoFocus
          type="search"
          placeholder="Artist name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" type="submit" disabled={state.status === 'searching'}>
          {state.status === 'searching' ? 'Searching…' : 'Search'}
        </button>
      </form>
      {state.status === 'error' && <p className="banner error">{state.message}</p>}
      {state.status === 'results' &&
        (state.artists.length === 0 ? (
          <p className="muted">No artists found.</p>
        ) : (
          <ul className="artist-results">
            {state.artists.map((a) => (
              <li key={a.id}>
                <button className="artist-row" onClick={() => onSelect(a)}>
                  <span className="artist-name">{a.name}</span>
                  <span className="artist-meta">
                    {[a.type, a.country, a.disambiguation].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </main>
  )
}
