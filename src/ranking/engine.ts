/**
 * Interactive merge sort as a serializable state machine.
 *
 * The only persisted state is the decision log; every `evaluate` call replays
 * the log through a deterministic bottom-up merge sort to find the next
 * pending comparison (or the final ranking). Undo is just popping the log.
 *
 * PERSISTENCE CONTRACT: the replay below (initial run order, bottom-up
 * pairing, merge consumption order, tie handling) is frozen. Changing any of
 * it silently corrupts saved sessions — bump the storage version instead.
 *
 * Items are indices 0..itemCount-1; callers map them to songs. A "group" is a
 * set of items tied with each other; ties merge two groups into one, which
 * then moves as a unit for the rest of the sort.
 */

export type ChoiceTag = 'a' | 'b' | 'tie'

export interface PendingComparison {
  /** Representative item of the left group. */
  a: number
  /** Representative item of the right group. */
  b: number
}

/** JSON-serializable as-is. */
export interface EngineSnapshot {
  itemCount: number
  decisions: ChoiceTag[]
}

export interface EngineView {
  done: boolean
  next: PendingComparison | null
  comparisonsMade: number
  /** comparisonsMade + worst-case remaining; can shrink as ties collapse groups. */
  estimatedTotal: number
  /** Tie groups in rank order (best first), only when done. */
  ranking: number[][] | null
}

type Group = number[]
type Run = Group[]

export function createEngine(itemCount: number): EngineSnapshot {
  if (!Number.isInteger(itemCount) || itemCount < 0) {
    throw new Error(`invalid itemCount: ${itemCount}`)
  }
  return { itemCount, decisions: [] }
}

export function applyChoice(s: EngineSnapshot, choice: ChoiceTag): EngineSnapshot {
  if (evaluate(s).done) {
    throw new Error('cannot apply a choice to a finished engine')
  }
  return { itemCount: s.itemCount, decisions: [...s.decisions, choice] }
}

export function canUndo(s: EngineSnapshot): boolean {
  return s.decisions.length > 0
}

export function undo(s: EngineSnapshot): EngineSnapshot {
  if (!canUndo(s)) {
    throw new Error('nothing to undo')
  }
  return { itemCount: s.itemCount, decisions: s.decisions.slice(0, -1) }
}

export function evaluate(s: EngineSnapshot): EngineView {
  const made = s.decisions.length

  if (s.itemCount <= 1) {
    if (made > 0) throw new Error('corrupt snapshot: decisions on a trivial sort')
    return {
      done: true,
      next: null,
      comparisonsMade: 0,
      estimatedTotal: 0,
      ranking: s.itemCount === 0 ? [] : [[0]],
    }
  }

  let runs: Run[] = []
  for (let i = 0; i < s.itemCount; i++) runs.push([[i]])

  let di = 0
  while (runs.length > 1) {
    const nextRuns: Run[] = []
    for (let i = 0; i + 1 < runs.length; i += 2) {
      const left = runs[i]
      const right = runs[i + 1]
      const merged: Run = []
      let li = 0
      let ri = 0
      while (li < left.length && ri < right.length) {
        if (di >= s.decisions.length) {
          return {
            done: false,
            next: { a: left[li][0], b: right[ri][0] },
            comparisonsMade: made,
            estimatedTotal:
              made +
              remainingWorstCase(runs, nextRuns, i, merged, left, right, li, ri),
            ranking: null,
          }
        }
        const d = s.decisions[di++]
        if (d === 'a') {
          merged.push(left[li++])
        } else if (d === 'b') {
          merged.push(right[ri++])
        } else {
          merged.push([...left[li++], ...right[ri++]])
        }
      }
      while (li < left.length) merged.push(left[li++])
      while (ri < right.length) merged.push(right[ri++])
      nextRuns.push(merged)
    }
    if (runs.length % 2 === 1) nextRuns.push(runs[runs.length - 1])
    runs = nextRuns
  }

  if (di !== s.decisions.length) {
    throw new Error('corrupt snapshot: more decisions than comparisons')
  }
  return {
    done: true,
    next: null,
    comparisonsMade: made,
    estimatedTotal: made,
    ranking: runs[0],
  }
}

/**
 * Worst-case comparisons left, measured in groups (ties shrink the problem),
 * from the exact point in the replay where the decision log ran out.
 */
function remainingWorstCase(
  runs: Run[],
  nextRuns: Run[],
  pairIndex: number,
  merged: Run,
  left: Run,
  right: Run,
  li: number,
  ri: number,
): number {
  const leftRest = left.length - li
  const rightRest = right.length - ri
  let cost = leftRest + rightRest - 1

  // Run lengths (in groups) for the next round, assuming no further ties.
  const nextLengths = nextRuns.map((r) => r.length)
  nextLengths.push(merged.length + leftRest + rightRest)
  for (let i = pairIndex + 2; i + 1 < runs.length; i += 2) {
    const p = runs[i].length
    const q = runs[i + 1].length
    cost += p + q - 1
    nextLengths.push(p + q)
  }
  if (runs.length % 2 === 1) nextLengths.push(runs[runs.length - 1].length)

  return cost + worstCaseFromLengths(nextLengths)
}

function worstCaseFromLengths(lengths: number[]): number {
  let total = 0
  let cur = lengths
  while (cur.length > 1) {
    const next: number[] = []
    for (let i = 0; i + 1 < cur.length; i += 2) {
      total += cur[i] + cur[i + 1] - 1
      next.push(cur[i] + cur[i + 1])
    }
    if (cur.length % 2 === 1) next.push(cur[cur.length - 1])
    cur = next
  }
  return total
}
