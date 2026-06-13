/**
 * Polite MusicBrainz access: a strict serial queue spacing request starts
 * >= 1.1s apart (their limit is 1 req/s), with retry + backoff on 429/503.
 *
 * Browsers cannot set User-Agent (forbidden header), which is MB's preferred
 * identification — the rate limit is our main act of etiquette, so every
 * request in the app MUST go through this queue.
 */

const MIN_INTERVAL_MS = 1100
const RETRY_DELAYS_MS = [2000, 5000, 10000]

export type MbErrorKind = 'throttled' | 'network' | 'http'

export class MbError extends Error {
  readonly kind: MbErrorKind
  readonly status: number | undefined

  constructor(kind: MbErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'MbError'
    this.kind = kind
    this.status = status
  }
}

let chain: Promise<void> = Promise.resolve()
let lastStartedAt = 0

function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function fetchWithRetry(url: string, signal?: AbortSignal): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw abortError()
    lastStartedAt = Date.now()

    let response: Response
    try {
      response = await fetch(url, {
        signal: signal ?? null,
        headers: { Accept: 'application/json' },
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt], signal)
        continue
      }
      throw new MbError('network', "Couldn't reach MusicBrainz — check your connection and retry.")
    }

    if (response.status === 503 || response.status === 429) {
      if (attempt < RETRY_DELAYS_MS.length) {
        const retryAfter = Number(response.headers.get('Retry-After'))
        const wait =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : RETRY_DELAYS_MS[attempt]
        await sleep(wait, signal)
        continue
      }
      throw new MbError(
        'throttled',
        'MusicBrainz is rate-limiting us; please wait a moment and retry.',
        response.status,
      )
    }
    if (!response.ok) {
      throw new MbError('http', `MusicBrainz returned HTTP ${response.status}`, response.status)
    }
    return response.json()
  }
}

/** Fetch JSON from MusicBrainz through the global serial 1 req/s queue. */
export function rateLimitedFetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const result = chain.then(async () => {
    if (signal?.aborted) throw abortError()
    const wait = lastStartedAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait, signal)
    return fetchWithRetry(url, signal)
  })
  // Keep the queue alive regardless of this request's outcome.
  chain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}
