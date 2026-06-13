import { useEffect, useState } from 'react'
import { applyChoice, canUndo, evaluate, undo, type ChoiceTag } from '../ranking/engine.ts'
import type { SavedSession } from '../storage/sessions.ts'

interface Props {
  session: SavedSession
  onChange: (session: SavedSession) => void
  onComplete: (session: SavedSession) => void
  onHome: () => void
}

export function RankingScreen({ session, onChange, onComplete, onHome }: Props) {
  const view = evaluate(session.engine)
  // The estimate can shrink when ties collapse groups; never show progress
  // moving backwards.
  const [maxPercent, setMaxPercent] = useState(0)
  const percent =
    view.estimatedTotal === 0 ? 100 : (view.comparisonsMade / view.estimatedTotal) * 100
  const shownPercent = Math.max(maxPercent, percent)

  function update(snapshot: SavedSession['engine']) {
    const done = evaluate(snapshot).done
    const next: SavedSession = {
      ...session,
      engine: snapshot,
      updatedAt: Date.now(),
      completedAt: done ? Date.now() : null,
    }
    if (done) onComplete(next)
    else onChange(next)
  }

  function choose(choice: ChoiceTag) {
    if (view.done) return
    setMaxPercent(shownPercent)
    update(applyChoice(session.engine, choice))
  }

  function undoLast() {
    if (!canUndo(session.engine)) return
    update(undo(session.engine))
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') choose('a')
      else if (e.key === 'ArrowRight') choose('b')
      else if (e.key === 'ArrowDown') choose('tie')
      else if (e.key === 'z' || e.key === 'Z') undoLast()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (view.done || view.next === null) return null

  const a = session.songs[view.next.a]
  const b = session.songs[view.next.b]

  return (
    <main className="screen ranking">
      <button className="ghost back" onClick={onHome}>
        ← Home (auto-saved)
      </button>
      <h2 className="ranking-artist">{session.artist.name}</h2>
      <p className="muted">Which song do you prefer?</p>
      <div className="matchup">
        <button className="song-card" onClick={() => choose('a')}>
          <span className="song-title">{a.title}</span>
          <span className="song-album">{a.albumTitle}</span>
        </button>
        <span className="vs">vs</span>
        <button className="song-card" onClick={() => choose('b')}>
          <span className="song-title">{b.title}</span>
          <span className="song-album">{b.albumTitle}</span>
        </button>
      </div>
      <div className="ranking-actions">
        <button className="ghost" onClick={() => choose('tie')}>
          Can't decide
        </button>
        <button className="ghost" disabled={!canUndo(session.engine)} onClick={undoLast}>
          Undo
        </button>
      </div>
      <div className="progress">
        <div className="progress-bar" style={{ width: `${shownPercent}%` }} />
      </div>
      <p className="muted small">
        {view.comparisonsMade} done · ~{Math.max(0, view.estimatedTotal - view.comparisonsMade)}{' '}
        comparisons left · keys: ← → pick, ↓ tie, Z undo
      </p>
    </main>
  )
}
