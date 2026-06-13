import { useMemo, useState } from 'react'
import type { MbArtist } from './musicbrainz/types.ts'
import { createEngine, evaluate } from './ranking/engine.ts'
import { AlbumSelectScreen } from './screens/AlbumSelectScreen.tsx'
import { ArtistSearchScreen } from './screens/ArtistSearchScreen.tsx'
import { HomeScreen } from './screens/HomeScreen.tsx'
import { RankingScreen } from './screens/RankingScreen.tsx'
import { ResultsScreen } from './screens/ResultsScreen.tsx'
import { shuffle } from './songs/shuffle.ts'
import type { Song } from './songs/types.ts'
import {
  deleteSession,
  listSessions,
  saveSession,
  storageAvailable,
  STORAGE_VERSION,
  type SavedSession,
} from './storage/sessions.ts'

type Phase =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'albums'; artist: MbArtist }
  | { name: 'ranking'; session: SavedSession }
  | { name: 'results'; session: SavedSession }

function newSessionId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function App() {
  const [phase, setPhase] = useState<Phase>({ name: 'home' })
  const [sessions, setSessions] = useState<SavedSession[]>(() => listSessions())
  const storageOk = useMemo(() => storageAvailable(), [])

  function persist(session: SavedSession) {
    saveSession(session)
    setSessions(listSessions())
  }

  function startRanking(artist: MbArtist, albums: { id: string; title: string }[], songs: Song[]) {
    const now = Date.now()
    const session: SavedSession = {
      version: STORAGE_VERSION,
      id: newSessionId(),
      createdAt: now,
      updatedAt: now,
      artist: { id: artist.id, name: artist.name },
      albums,
      songs: shuffle(songs),
      engine: createEngine(songs.length),
      completedAt: null,
    }
    persist(session)
    // Degenerate catalogs (0–1 songs) are already "done".
    if (evaluate(session.engine).done) {
      setPhase({ name: 'results', session })
    } else {
      setPhase({ name: 'ranking', session })
    }
  }

  switch (phase.name) {
    case 'home':
      return (
        <HomeScreen
          sessions={sessions}
          storageOk={storageOk}
          onNew={() => setPhase({ name: 'search' })}
          onOpen={(session) =>
            setPhase(
              session.completedAt !== null
                ? { name: 'results', session }
                : { name: 'ranking', session },
            )
          }
          onDelete={(id) => {
            deleteSession(id)
            setSessions(listSessions())
          }}
        />
      )
    case 'search':
      return (
        <ArtistSearchScreen
          onHome={() => setPhase({ name: 'home' })}
          onSelect={(artist) => setPhase({ name: 'albums', artist })}
        />
      )
    case 'albums':
      return (
        <AlbumSelectScreen
          artist={phase.artist}
          onHome={() => setPhase({ name: 'home' })}
          onStart={(albums, songs) => startRanking(phase.artist, albums, songs)}
        />
      )
    case 'ranking':
      return (
        <RankingScreen
          session={phase.session}
          onHome={() => setPhase({ name: 'home' })}
          onChange={(session) => {
            persist(session)
            setPhase({ name: 'ranking', session })
          }}
          onComplete={(session) => {
            persist(session)
            setPhase({ name: 'results', session })
          }}
        />
      )
    case 'results':
      return <ResultsScreen session={phase.session} onHome={() => setPhase({ name: 'home' })} />
  }
}

export default App
