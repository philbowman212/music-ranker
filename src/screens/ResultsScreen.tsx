import { useMemo, useState } from 'react'
import { evaluate } from '../ranking/engine.ts'
import type { SavedSession } from '../storage/sessions.ts'
import type { Song } from '../songs/types.ts'

interface Props {
  session: SavedSession
  onHome: () => void
}

interface RankedGroup {
  rank: number
  songs: Song[]
}

function rankedGroups(session: SavedSession): RankedGroup[] {
  const ranking = evaluate(session.engine).ranking ?? []
  const out: RankedGroup[] = []
  let rank = 1
  for (const group of ranking) {
    out.push({ rank, songs: group.map((i) => session.songs[i]) })
    rank += group.length // competition ranking: 1, 2, 2, 4
  }
  return out
}

function asText(session: SavedSession, groups: RankedGroup[]): string {
  const lines = [`${session.artist.name} — ranked with Music Ranker`, '']
  for (const g of groups) {
    for (const song of g.songs) {
      lines.push(`${g.rank}. ${song.title}${g.songs.length > 1 ? ' (tie)' : ''}`)
    }
  }
  return lines.join('\n')
}

export function ResultsScreen({ session, onHome }: Props) {
  const groups = useMemo(() => rankedGroups(session), [session])
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText(session, groups))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be unavailable (permissions, http); fail quietly.
    }
  }

  return (
    <main className="screen results">
      <button className="ghost back" onClick={onHome}>
        ← Home
      </button>
      <h2>{session.artist.name}</h2>
      <p className="muted">
        {session.songs.length} songs, ranked. Ties share a position.
      </p>
      <button className="primary" onClick={() => void copy()}>
        {copied ? 'Copied!' : 'Copy as text'}
      </button>
      <ol className="results-list">
        {groups.flatMap((g) =>
          g.songs.map((song, i) => (
            <li key={song.id} value={g.rank} className={i > 0 ? 'tied' : undefined}>
              <span className="result-rank">{g.rank}</span>
              <span className="result-title">
                {song.title}
                {g.songs.length > 1 && <span className="tie-badge"> tie</span>}
              </span>
              <span className="muted small">{song.albumTitle}</span>
            </li>
          )),
        )}
      </ol>
    </main>
  )
}
