import { useEffect, useRef, useState } from 'react'
import { fetchPreviewUrl } from '../preview/itunes.ts'
import { serviceLinks } from '../preview/links.ts'
import { applyChoice, canUndo, evaluate, undo, type ChoiceTag } from '../ranking/engine.ts'
import type { Song } from '../songs/types.ts'
import type { SavedSession } from '../storage/sessions.ts'

interface Props {
  session: SavedSession
  onChange: (session: SavedSession) => void
  onComplete: (session: SavedSession) => void
  onHome: () => void
}

type PreviewStatus = 'loading' | 'playing' | 'unavailable' | 'error'
interface PreviewState {
  songId: string
  status: PreviewStatus
}

export function RankingScreen({ session, onChange, onComplete, onHome }: Props) {
  const view = evaluate(session.engine)
  // The estimate can shrink when ties collapse groups; never show progress
  // moving backwards.
  const [maxPercent, setMaxPercent] = useState(0)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fetchAbortRef = useRef<AbortController | null>(null)

  const percent =
    view.estimatedTotal === 0 ? 100 : (view.comparisonsMade / view.estimatedTotal) * 100
  const shownPercent = Math.max(maxPercent, percent)

  const pairKey = view.next ? `${view.next.a}|${view.next.b}` : 'done'

  function stopPreview() {
    audioRef.current?.pause()
    fetchAbortRef.current?.abort()
    setPreview(null)
  }

  // Stop audio whenever the matchup advances or the screen unmounts.
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      fetchAbortRef.current?.abort()
    }
  }, [pairKey])

  async function togglePreview(song: Song) {
    // Clicking the song that's currently playing (or loading) stops it.
    if (preview?.songId === song.id && preview.status !== 'unavailable') {
      stopPreview()
      return
    }
    audioRef.current?.pause()
    fetchAbortRef.current?.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller
    setPreview({ songId: song.id, status: 'loading' })
    try {
      const url = await fetchPreviewUrl(song.id, session.artist.name, song.title, controller.signal)
      if (controller.signal.aborted) return
      if (url === null) {
        setPreview({ songId: song.id, status: 'unavailable' })
        return
      }
      const audio = audioRef.current ?? new Audio()
      audioRef.current = audio
      audio.src = url
      audio.onended = () => setPreview((p) => (p?.songId === song.id ? null : p))
      await audio.play()
      setPreview({ songId: song.id, status: 'playing' })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setPreview({ songId: song.id, status: 'error' })
    }
  }

  function update(snapshot: SavedSession['engine']) {
    stopPreview()
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
        <SongCard
          song={a}
          artist={session.artist.name}
          preview={preview?.songId === a.id ? preview.status : null}
          onPick={() => choose('a')}
          onPreview={() => void togglePreview(a)}
        />
        <span className="vs">vs</span>
        <SongCard
          song={b}
          artist={session.artist.name}
          preview={preview?.songId === b.id ? preview.status : null}
          onPick={() => choose('b')}
          onPreview={() => void togglePreview(b)}
        />
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

interface SongCardProps {
  song: Song
  artist: string
  preview: PreviewStatus | null
  onPick: () => void
  onPreview: () => void
}

function previewLabel(status: PreviewStatus | null): string {
  switch (status) {
    case 'loading':
      return 'Loading…'
    case 'playing':
      return '⏸ Stop'
    case 'unavailable':
      return 'No preview'
    case 'error':
      return '↻ Retry preview'
    default:
      return '▶ Preview'
  }
}

function SongCard({ song, artist, preview, onPick, onPreview }: SongCardProps) {
  return (
    <div className="song-card">
      <button className="song-pick" onClick={onPick}>
        <span className="song-title">{song.title}</span>
        <span className="song-album">{song.albumTitle}</span>
      </button>
      <div className="song-actions">
        <button
          className="preview-btn"
          onClick={onPreview}
          disabled={preview === 'unavailable'}
          aria-label={`Preview ${song.title}`}
        >
          {previewLabel(preview)}
        </button>
        <span className="service-links">
          {serviceLinks(artist, song.title).map((link) => (
            <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer">
              {link.name}
            </a>
          ))}
        </span>
      </div>
    </div>
  )
}
