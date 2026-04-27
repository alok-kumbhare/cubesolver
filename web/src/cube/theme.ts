// Standard Rubik's color scheme keyed by face letter.
import type { Face } from './model';

export const FACE_COLORS: Record<Face, string> = {
  U: '#FFFFFF', // white
  D: '#FFD500', // yellow
  F: '#009E60', // green
  B: '#1E5BFF', // blue
  L: '#FF8C00', // orange
  R: '#D90000', // red
};

export const COLOR_NAMES: Record<Face, string> = {
  U: 'White',
  D: 'Yellow',
  F: 'Green',
  B: 'Blue',
  L: 'Orange',
  R: 'Red',
};

export const COLOR_EMOJI: Record<Face, string> = {
  U: '⬜',
  D: '🟨',
  F: '🟩',
  B: '🟦',
  L: '🟧',
  R: '🟥',
};

export const PALETTE_ORDER: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

// Face guide order for kid mode (start with the face whose center is white)
export const KID_FACE_GUIDE_ORDER: Face[] = ['U', 'F', 'R', 'B', 'L', 'D'];

// When showing each face to the camera, which neighbor color should be at
// the TOP of the camera frame (i.e. the top row of the captured 3x3 grid).
// This matches the Kociemba canonical sticker layout used by cubejs.
export const FACE_TOP_NEIGHBOR: Record<Face, Face> = {
  U: 'B', // looking down at white, blue side at top of frame
  D: 'F', // looking up at yellow, green side at top of frame
  F: 'U', R: 'U', B: 'U', L: 'U', // for the 4 side faces, white on top
};
