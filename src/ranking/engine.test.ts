import { describe, expect, it } from 'vitest'
import {
  applyChoice,
  canUndo,
  createEngine,
  evaluate,
  undo,
  type ChoiceTag,
  type EngineSnapshot,
} from './engine.ts'

/** Deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled(n: number, rand: () => number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Oracle: lower value ranks higher; equal values tie. */
function oracle(values: number[]): (a: number, b: number) => ChoiceTag {
  return (a, b) => (values[a] < values[b] ? 'a' : values[a] > values[b] ? 'b' : 'tie')
}

function runToCompletion(
  s: EngineSnapshot,
  answer: (a: number, b: number) => ChoiceTag,
  onStep?: (s: EngineSnapshot) => void,
): { snapshot: EngineSnapshot; ranking: number[][]; comparisons: number } {
  for (;;) {
    const view = evaluate(s)
    if (view.done) {
      return { snapshot: s, ranking: view.ranking!, comparisons: view.comparisonsMade }
    }
    s = applyChoice(s, answer(view.next!.a, view.next!.b))
    onStep?.(s)
  }
}

describe('engine basics', () => {
  it('handles n=0 and n=1 as immediately done', () => {
    expect(evaluate(createEngine(0))).toMatchObject({ done: true, ranking: [], estimatedTotal: 0 })
    expect(evaluate(createEngine(1))).toMatchObject({ done: true, ranking: [[0]] })
  })

  it('sorts two items with one comparison', () => {
    const view = evaluate(applyChoice(createEngine(2), 'b'))
    expect(view.done).toBe(true)
    expect(view.ranking).toEqual([[1], [0]])
  })

  it('rejects choices after completion and undo on empty log', () => {
    expect(() => applyChoice(applyChoice(createEngine(2), 'a'), 'a')).toThrow()
    expect(() => undo(createEngine(5))).toThrow()
    expect(canUndo(createEngine(5))).toBe(false)
  })

  it('rejects corrupt snapshots with excess decisions', () => {
    expect(() => evaluate({ itemCount: 2, decisions: ['a', 'a'] })).toThrow()
    expect(() => evaluate({ itemCount: 1, decisions: ['a'] })).toThrow()
  })
})

describe('engine correctness (fuzz vs oracle)', () => {
  const sizes = [0, 1, 2, 3, 5, 8, 17, 40, 100]

  it('reproduces a known total order within the comparison bound', () => {
    const rand = mulberry32(42)
    for (const n of sizes) {
      for (let trial = 0; trial < 5; trial++) {
        // values[i] = rank of item i in the true order
        const values = shuffled(n, rand)
        const { ranking, comparisons } = runToCompletion(createEngine(n), oracle(values))
        const flat = ranking.flat()
        expect(flat).toHaveLength(n)
        expect(ranking.every((g) => g.length === 1)).toBe(true)
        const sortedByOracle = [...flat].sort((a, b) => values[a] - values[b])
        expect(flat).toEqual(sortedByOracle)
        if (n > 1) {
          expect(comparisons).toBeLessThanOrEqual(n * Math.ceil(Math.log2(n)))
        }
      }
    }
  })

  it('groups equivalence classes exactly when the oracle ties', () => {
    const rand = mulberry32(7)
    for (const n of [2, 3, 5, 8, 17, 40]) {
      for (let trial = 0; trial < 5; trial++) {
        // ~3 items per class on average
        const classCount = Math.max(1, Math.floor(n / 3))
        const values = Array.from({ length: n }, () => Math.floor(rand() * classCount))
        const { ranking } = runToCompletion(createEngine(n), oracle(values))
        // groups are in strictly improving-to-worsening order and match classes
        const groupValues = ranking.map((g) => {
          const v = values[g[0]]
          for (const item of g) expect(values[item]).toBe(v)
          return v
        })
        expect(groupValues).toEqual([...new Set(values)].sort((a, b) => a - b))
        expect(ranking.flat().sort((a, b) => a - b)).toEqual(
          Array.from({ length: n }, (_, i) => i),
        )
      }
    }
  })

  it('handles the all-ties case with one group in n-1 comparisons', () => {
    const n = 13
    const { ranking, comparisons } = runToCompletion(createEngine(n), () => 'tie')
    expect(ranking).toHaveLength(1)
    expect(ranking[0]).toHaveLength(n)
    expect(comparisons).toBe(n - 1)
  })
})

describe('serialization', () => {
  it('JSON round-trips to an identical view at every step', () => {
    const rand = mulberry32(99)
    const values = shuffled(17, rand)
    runToCompletion(createEngine(17), oracle(values), (s) => {
      const revived = JSON.parse(JSON.stringify(s)) as EngineSnapshot
      expect(evaluate(revived)).toEqual(evaluate(s))
    })
  })
})

describe('undo', () => {
  it('matches a plain decision-list reference under random decide/undo interleaving', () => {
    const rand = mulberry32(1234)
    const n = 17
    const values = shuffled(n, rand)
    const answer = oracle(values)

    let s = createEngine(n)
    let reference: ChoiceTag[] = []
    for (let step = 0; step < 400; step++) {
      const view = evaluate(s)
      expect(s.decisions).toEqual(reference)
      if (view.done) break
      if (reference.length > 0 && rand() < 0.3) {
        s = undo(s)
        reference = reference.slice(0, -1)
      } else {
        const choice = answer(view.next!.a, view.next!.b)
        s = applyChoice(s, choice)
        reference = [...reference, choice]
      }
    }
  })

  it('reopens the final comparison after undoing a finished ranking', () => {
    const values = shuffled(8, mulberry32(5))
    const { snapshot } = runToCompletion(createEngine(8), oracle(values))
    const beforeLast = undo(snapshot)
    const view = evaluate(beforeLast)
    expect(view.done).toBe(false)
    expect(view.next).not.toBeNull()
    // re-answering identically finishes with the same ranking
    const redone = applyChoice(beforeLast, snapshot.decisions[snapshot.decisions.length - 1])
    expect(evaluate(redone).ranking).toEqual(evaluate(snapshot).ranking)
  })
})

describe('progress estimation', () => {
  it('is a valid upper bound that ends exactly at comparisonsMade', () => {
    const rand = mulberry32(2024)
    for (const n of [5, 17, 40]) {
      const values = shuffled(n, rand)
      let lastEstimate = Infinity
      const { snapshot } = runToCompletion(createEngine(n), oracle(values), (s) => {
        const view = evaluate(s)
        expect(view.estimatedTotal).toBeGreaterThanOrEqual(view.comparisonsMade)
        lastEstimate = view.estimatedTotal
      })
      const final = evaluate(snapshot)
      expect(final.estimatedTotal).toBe(final.comparisonsMade)
      expect(lastEstimate).toBe(final.comparisonsMade)
    }
  })

  it('never under-estimates: actual total stays <= every estimate without ties', () => {
    const rand = mulberry32(77)
    const n = 40
    const values = shuffled(n, rand)
    const estimates: number[] = []
    const { comparisons } = runToCompletion(createEngine(n), oracle(values), (s) => {
      estimates.push(evaluate(s).estimatedTotal)
    })
    for (const e of estimates) expect(comparisons).toBeLessThanOrEqual(e)
  })
})
