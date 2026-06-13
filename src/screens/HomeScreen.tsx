import { evaluate } from '../ranking/engine.ts'
import type { SavedSession } from '../storage/sessions.ts'

interface Props {
  sessions: SavedSession[]
  storageOk: boolean
  onNew: () => void
  onOpen: (session: SavedSession) => void
  onDelete: (id: string) => void
}

function progressLabel(s: SavedSession): string {
  if (s.completedAt !== null) return 'Completed'
  const view = evaluate(s.engine)
  const pct = view.estimatedTotal === 0 ? 0 : Math.round((view.comparisonsMade / view.estimatedTotal) * 100)
  return `In progress — ${pct}%`
}

export function HomeScreen({ sessions, storageOk, onNew, onOpen, onDelete }: Props) {
  return (
    <main className="screen home">
      <h1>Music Ranker</h1>
      <p className="tagline">Rank any artist's discography through head-to-head matchups.</p>
      {!storageOk && (
        <p className="banner warning">
          Storage is unavailable in this browser — rankings won't survive a reload.
        </p>
      )}
      <button className="primary" onClick={onNew}>
        New ranking
      </button>
      {sessions.length > 0 && (
        <section className="session-list">
          <h2>Your rankings</h2>
          <ul>
            {sessions.map((s) => (
              <li key={s.id} className="session-row">
                <button className="session-open" onClick={() => onOpen(s)}>
                  <span className="session-artist">{s.artist.name}</span>
                  <span className="session-meta">
                    {s.songs.length} songs · {progressLabel(s)} ·{' '}
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  className="ghost danger"
                  aria-label={`Delete ${s.artist.name} ranking`}
                  onClick={() => {
                    if (window.confirm(`Delete the ${s.artist.name} ranking?`)) onDelete(s.id)
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
