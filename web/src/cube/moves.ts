import type { Face } from './model';

export type Direction = 'cw' | 'ccw' | '180';

export interface SolveStep {
  notation: string;        // e.g. "R'", "U2"
  face: Face;              // R, U, F, D, L, B
  direction: Direction;
  description: string;     // "Right face clockwise"
  kidDescription: string;  // "Turn the RED side this way"
  stepNumber: number;      // 1-indexed
  totalSteps: number;
}

const FACE_NAMES_FULL: Record<Face, string> = {
  U: 'Top', D: 'Bottom', F: 'Front', B: 'Back', L: 'Left', R: 'Right',
};

const COLOR_NAMES: Record<Face, string> = {
  U: 'WHITE', D: 'YELLOW', F: 'GREEN', B: 'BLUE', L: 'ORANGE', R: 'RED',
};

const DIR_NAMES: Record<Direction, string> = {
  cw: 'clockwise', ccw: 'counter-clockwise', '180': '180°',
};

const KID_DIR: Record<Direction, string> = {
  cw: 'this way ↻', ccw: 'the other way ↺', '180': 'TWICE 🔄',
};

export function parseMove(notation: string): { face: Face; direction: Direction } {
  const m = notation.match(/^([URFDLB])(['2]?)$/);
  if (!m) throw new Error(`Invalid move notation: ${notation}`);
  const face = m[1] as Face;
  const suffix = m[2];
  const direction: Direction =
    suffix === "'" ? 'ccw' : suffix === '2' ? '180' : 'cw';
  return { face, direction };
}

export function parseSolution(solution: string): SolveStep[] {
  const tokens = solution.trim().split(/\s+/).filter(Boolean);
  const total = tokens.length;
  return tokens.map((tok, i) => {
    const { face, direction } = parseMove(tok);
    return {
      notation: tok,
      face,
      direction,
      description: `${FACE_NAMES_FULL[face]} face ${DIR_NAMES[direction]}`,
      kidDescription: `Turn the ${COLOR_NAMES[face]} side ${KID_DIR[direction]}`,
      stepNumber: i + 1,
      totalSteps: total,
    };
  });
}
