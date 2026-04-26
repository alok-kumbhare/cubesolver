import Cube from 'cubejs';
import { type Faces, toFaceletString, fromFaceletString, validate, normalizeOrientation, hasValidPieces } from './model';
import { parseSolution, type SolveStep } from './moves';

let solverReady = false;
let initPromise: Promise<void> | null = null;

// Kociemba precalculation takes 4-5s. Run once, lazily.
export function initSolver(): Promise<void> {
  if (solverReady) return Promise.resolve();
  if (initPromise) return initPromise;
  initPromise = new Promise<void>((resolve) => {
    // Defer to next tick so callers can show a loading indicator.
    setTimeout(() => {
      Cube.initSolver();
      solverReady = true;
      resolve();
    }, 0);
  });
  return initPromise;
}

export function isSolverReady(): boolean {
  return solverReady;
}

export class SolverError extends Error {}

export interface SolveResult {
  steps: SolveStep[];
  // states[0] = initial; states[i] = after step i (length = steps.length + 1)
  states: Faces[];
  rawSolution: string;
  // Faces actually solved — may differ from the input if some faces were
  // captured at an off rotation and `normalizeOrientation()` corrected them.
  normalizedFaces: Faces;
  // True if normalization rotated any face.
  rotated: boolean;
}

export async function solve(faces: Faces): Promise<SolveResult> {
  const v = validate(faces);
  if (!v.valid) throw new SolverError(v.error ?? 'Invalid cube');

  // If the painted faces don't already form a piece-valid cube, try to find
  // a per-face rotation that does. This rescues camera scans where the user
  // held a face at the wrong rotation.
  let normalized = faces;
  let rotated = false;
  if (!hasValidPieces(faces)) {
    const fixed = normalizeOrientation(faces);
    if (!fixed) {
      throw new SolverError(
        "Hmm, those colors don't fit a real cube — please re-check the stickers."
      );
    }
    normalized = fixed;
    rotated = true;
  }

  await initSolver();

  let cube: Cube;
  try {
    cube = Cube.fromString(toFaceletString(normalized));
  } catch (e) {
    throw new SolverError(`Cannot read cube state: ${(e as Error).message}`);
  }

  let raw: string;
  try {
    raw = cube.solve();
  } catch (e) {
    throw new SolverError(
      'This cube cannot be solved — please check your colors.'
    );
  }

  const steps = parseSolution(raw);

  // Build intermediate states by applying moves one at a time.
  const states: Faces[] = [fromFaceletString(toFaceletString(normalized))];
  const c2 = Cube.fromString(toFaceletString(normalized));
  for (const step of steps) {
    c2.move(step.notation);
    states.push(fromFaceletString(c2.asString()));
  }

  return { steps, states, rawSolution: raw, normalizedFaces: normalized, rotated };
}
