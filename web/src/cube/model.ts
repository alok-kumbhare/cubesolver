// CubeModel: the painted state of all 54 stickers.
//
// We delegate move application and solving entirely to cubejs (which
// uses Kociemba). Our model just holds the painted state and converts
// to/from the cubejs facelet string format.

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';

// Order required by cubejs' Cube.fromString() / asString():
// 9 chars per face, U R F D L B.
export const FACE_ORDER: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

export type Faces = Record<Face, Face[]>; // Face -> 9 sticker face-letters

export function createSolved(): Faces {
  return {
    U: Array<Face>(9).fill('U'),
    R: Array<Face>(9).fill('R'),
    F: Array<Face>(9).fill('F'),
    D: Array<Face>(9).fill('D'),
    L: Array<Face>(9).fill('L'),
    B: Array<Face>(9).fill('B'),
  };
}

export function cloneFaces(faces: Faces): Faces {
  return {
    U: [...faces.U], R: [...faces.R], F: [...faces.F],
    D: [...faces.D], L: [...faces.L], B: [...faces.B],
  };
}

export function setSticker(faces: Faces, face: Face, index: number, color: Face): Faces {
  if (index === 4) return faces; // center is locked
  const next = cloneFaces(faces);
  next[face][index] = color;
  return next;
}

export function toFaceletString(faces: Faces): string {
  let s = '';
  for (const f of FACE_ORDER) s += faces[f].join('');
  return s;
}

export function fromFaceletString(s: string): Faces {
  if (s.length !== 54) throw new Error(`Facelet string must be 54 chars, got ${s.length}`);
  const out = createSolved();
  let i = 0;
  for (const f of FACE_ORDER) {
    out[f] = s.slice(i, i + 9).split('') as Face[];
    i += 9;
  }
  return out;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validate(faces: Faces): ValidationResult {
  // Each color must appear exactly 9 times.
  const counts: Record<string, number> = {};
  for (const f of FACE_ORDER) for (const c of faces[f]) counts[c] = (counts[c] ?? 0) + 1;

  for (const f of FACE_ORDER) {
    if ((counts[f] ?? 0) !== 9) {
      return { valid: false, error: `Need exactly 9 ${f} stickers (have ${counts[f] ?? 0})` };
    }
  }

  // Centers must be the canonical face color (we lock them, but double-check).
  for (const f of FACE_ORDER) {
    if (faces[f][4] !== f) {
      return { valid: false, error: `Center of face ${f} must be ${f}` };
    }
  }

  return { valid: true };
}

export function isSolved(faces: Faces): boolean {
  for (const f of FACE_ORDER) {
    for (const c of faces[f]) if (c !== f) return false;
  }
  return true;
}

// Rotate a face's 9 stickers (row-major) 90° clockwise:
//   0 1 2        6 3 0
//   3 4 5  --->  7 4 1
//   6 7 8        8 5 2
const ROT_CW_MAP = [6, 3, 0, 7, 4, 1, 8, 5, 2];
export function rotateFaceCW(s: Face[]): Face[] {
  return ROT_CW_MAP.map((i) => s[i]);
}
export function rotateFaceN(s: Face[], turns: number): Face[] {
  let out = s;
  const n = ((turns % 4) + 4) % 4;
  for (let i = 0; i < n; i++) out = rotateFaceCW(out);
  return out;
}

// The 12 edges of the cube, given as the (face, sticker-index) pairs that
// make up each edge cubie. Used to validate the cube's color layout.
const EDGES: Array<[[Face, number], [Face, number]]> = [
  [['U', 7], ['F', 1]], // UF
  [['U', 5], ['R', 1]], // UR
  [['U', 1], ['B', 1]], // UB
  [['U', 3], ['L', 1]], // UL
  [['D', 1], ['F', 7]], // DF
  [['D', 5], ['R', 7]], // DR
  [['D', 7], ['B', 7]], // DB
  [['D', 3], ['L', 7]], // DL
  [['F', 5], ['R', 3]], // FR
  [['F', 3], ['L', 5]], // FL
  [['B', 3], ['R', 5]], // BR
  [['B', 5], ['L', 3]], // BL
];
const CORNERS: Array<[[Face, number], [Face, number], [Face, number]]> = [
  [['U', 8], ['F', 2], ['R', 0]], // UFR
  [['U', 6], ['F', 0], ['L', 2]], // UFL
  [['U', 2], ['B', 0], ['R', 2]], // UBR
  [['U', 0], ['B', 2], ['L', 0]], // UBL
  [['D', 2], ['F', 8], ['R', 6]], // DFR
  [['D', 0], ['F', 6], ['L', 8]], // DFL
  [['D', 8], ['B', 6], ['R', 8]], // DBR
  [['D', 6], ['B', 8], ['L', 6]], // DBL
];

const CANON_EDGE_KEYS = EDGES
  .map(([[a], [b]]) => [a, b].sort().join(''))
  .sort();
const CANON_CORNER_KEYS = CORNERS
  .map(([[a], [b], [c]]) => [a, b, c].sort().join(''))
  .sort();

// True if the painted faces have correct edge + corner color multisets.
// (Stronger than `validate()`, which only checks counts and centers.)
export function hasValidPieces(faces: Faces): boolean {
  const edgeKeys = EDGES
    .map(([[fa, ia], [fb, ib]]) => [faces[fa][ia], faces[fb][ib]].sort().join(''))
    .sort();
  for (let i = 0; i < 12; i++) if (edgeKeys[i] !== CANON_EDGE_KEYS[i]) return false;
  const cornerKeys = CORNERS
    .map(([[fa, ia], [fb, ib], [fc, ic]]) =>
      [faces[fa][ia], faces[fb][ib], faces[fc][ic]].sort().join(''))
    .sort();
  for (let i = 0; i < 8; i++) if (cornerKeys[i] !== CANON_CORNER_KEYS[i]) return false;
  return true;
}

// Search the 4^6 = 4096 per-face rotations and return the one that produces
// a piece-valid cube layout, preferring fewest total rotations. Returns null
// if no rotation combo yields a valid cube (i.e. the painted colors are
// genuinely inconsistent — duplicate edges, missing corners, etc.).
export function normalizeOrientation(faces: Faces): Faces | null {
  let best: { faces: Faces; cost: number } | null = null;
  for (let u = 0; u < 4; u++) {
    const U = rotateFaceN(faces.U, u);
    for (let r = 0; r < 4; r++) {
      const R = rotateFaceN(faces.R, r);
      for (let f = 0; f < 4; f++) {
        const F = rotateFaceN(faces.F, f);
        for (let d = 0; d < 4; d++) {
          const D = rotateFaceN(faces.D, d);
          for (let l = 0; l < 4; l++) {
            const L = rotateFaceN(faces.L, l);
            for (let b = 0; b < 4; b++) {
              const B = rotateFaceN(faces.B, b);
              const cand: Faces = { U, R, F, D, L, B };
              if (!hasValidPieces(cand)) continue;
              const cost = u + r + f + d + l + b;
              if (!best || cost < best.cost) best = { faces: cand, cost };
            }
          }
        }
      }
    }
  }
  return best ? best.faces : null;
}
