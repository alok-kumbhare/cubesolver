// Browser-environment regression tests for the solver.
//
// These run via vitest in real Chromium (not Node), through the same
// Vite transform pipeline as the production app. They catch bundler
// issues (e.g. ESM `this === undefined`) that pure Node tests miss.

import { describe, it, expect, beforeAll } from 'vitest'
import Cube from 'cubejs'
import { createSolved, fromFaceletString, toFaceletString, isSolved, validate, hasValidPieces, normalizeOrientation, rotateFaceN, cloneFaces } from '../../src/cube/model'
import { solve, initSolver } from '../../src/cube/solver'

beforeAll(async () => {
  // Kociemba precalc; ~5s on first run.
  await initSolver()
}, 30_000)

describe('cubejs interop in the browser', () => {
  it('Cube class is importable and constructible', () => {
    expect(Cube).toBeTypeOf('function')
    const c = new Cube()
    expect(c).toBeInstanceOf(Cube)
    expect(c.isSolved()).toBe(true)
  })

  it('solve.js attached methods to Cube', () => {
    // If solve.js failed to bind to the same Cube class (the bug we fixed),
    // these would be undefined.
    expect(typeof Cube.initSolver).toBe('function')
    expect(typeof (new Cube()).solve).toBe('function')
    expect(typeof Cube.scramble).toBe('function')
  })

  it('Cube.fromString round-trips facelet strings', () => {
    const s = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
    const c = Cube.fromString(s)
    expect(c.asString()).toBe(s)
  })

  it('basic move + solve works end-to-end', () => {
    const c = new Cube()
    c.move("R U R' U'")
    expect(c.isSolved()).toBe(false)
    const sol = c.solve()
    expect(typeof sol).toBe('string')
    expect(sol.length).toBeGreaterThan(0)
    const verify = Cube.fromString(c.asString())
    for (const m of sol.trim().split(/\s+/).filter(Boolean)) verify.move(m)
    expect(verify.isSolved()).toBe(true)
  })
})

describe('our solver wrapper in the browser', () => {
  const SCRAMBLES = [
    "R U R' U'",
    "F R U R' U' F'",
    "L D2 B' R F2 U' L' B U2 F'",
    "U R U' R' U' F' U F",
  ]

  it('solved cube validates and the result still ends solved', async () => {
    const faces = createSolved()
    expect(validate(faces).valid).toBe(true)
    const res = await solve(faces)
    // cubejs may return a non-empty (but no-op) sequence for an already-solved
    // cube; what matters is the final state is still solved.
    expect(res.states.length).toBeGreaterThanOrEqual(1)
    expect(isSolved(res.states[res.states.length - 1])).toBe(true)
  })

  for (const scramble of SCRAMBLES) {
    it(`solves scramble: ${scramble}`, async () => {
      const c = new Cube()
      c.move(scramble)
      const faces = fromFaceletString(c.asString())
      expect(validate(faces).valid).toBe(true)

      const res = await solve(faces)
      expect(res.steps.length).toBeGreaterThan(0)
      expect(isSolved(res.states[res.states.length - 1])).toBe(true)
      expect(res.states.length).toBe(res.steps.length + 1)

      const verify = Cube.fromString(c.asString())
      for (const s of res.steps) verify.move(s.notation)
      expect(verify.isSolved()).toBe(true)
      expect(toFaceletString(res.states[res.states.length - 1]))
        .toBe(verify.asString())
    }, 20_000)
  }
})

describe('validation', () => {
  it('rejects state with wrong color counts', async () => {
    const faces = createSolved()
    faces.R[0] = 'U'
    expect(validate(faces).valid).toBe(false)
    await expect(solve(faces)).rejects.toThrow()
  })
})

describe('orientation normalization', () => {
  it('a real (piece-valid) scramble passes hasValidPieces', () => {
    const c = new Cube()
    c.move("R U R' U' F R F'")
    const faces = fromFaceletString(c.asString())
    expect(hasValidPieces(faces)).toBe(true)
  })

  it('rotating a single face 90° breaks hasValidPieces but normalize fixes it', () => {
    const c = new Cube()
    c.move("R U R' U' F R F' L D2 B'")
    const faces = fromFaceletString(c.asString())
    expect(hasValidPieces(faces)).toBe(true)

    // Simulate the user holding the F face at 90° during camera capture:
    // rotate just F by one CW turn.
    const skewed = cloneFaces(faces)
    skewed.F = rotateFaceN(skewed.F, 1)
    expect(hasValidPieces(skewed)).toBe(false)

    const fixed = normalizeOrientation(skewed)
    expect(fixed).not.toBeNull()
    expect(hasValidPieces(fixed!)).toBe(true)
    // And the recovered F should match the original F.
    expect(fixed!.F).toEqual(faces.F)
  })

  it('rotating multiple faces still recovers the original cube', () => {
    const c = new Cube()
    c.move("F R U2 R' U' F'")
    const faces = fromFaceletString(c.asString())

    const skewed = cloneFaces(faces)
    skewed.U = rotateFaceN(skewed.U, 1)
    skewed.R = rotateFaceN(skewed.R, 2)
    skewed.B = rotateFaceN(skewed.B, 3)

    const fixed = normalizeOrientation(skewed)
    expect(fixed).not.toBeNull()
    expect(hasValidPieces(fixed!)).toBe(true)
    expect(toFaceletString(fixed!)).toBe(toFaceletString(faces))
  })

  it('solve() auto-corrects a face captured at the wrong rotation', async () => {
    const c = new Cube()
    c.move("R U R' U' R' F R F'")
    const faces = fromFaceletString(c.asString())

    const skewed = cloneFaces(faces)
    skewed.R = rotateFaceN(skewed.R, 1)

    const res = await solve(skewed)
    expect(res.rotated).toBe(true)
    expect(toFaceletString(res.normalizedFaces)).toBe(toFaceletString(faces))
    expect(isSolved(res.states[res.states.length - 1])).toBe(true)
  }, 20_000)
})
