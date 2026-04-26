"""Cube state representation and manipulation for Rubik's Cube Solver."""

from __future__ import annotations

import copy
from typing import Dict, List, Optional


# Standard face order for Kociemba: U R F D L B
FACE_ORDER = ["U", "R", "F", "D", "L", "B"]

# Each face is a 3x3 grid stored as a list of 9 values (row-major)
# Index layout per face:
# 0 1 2
# 3 4 5
# 6 7 8


class CubeModel:
    """Represents a 3x3 Rubik's Cube state."""

    def __init__(self) -> None:
        """Initialize a solved cube."""
        self.faces: Dict[str, List[str]] = {}
        self.reset()

    def reset(self) -> None:
        """Reset to solved state — each face has its own color."""
        for face in FACE_ORDER:
            self.faces[face] = [face] * 9

    def get_sticker(self, face: str, index: int) -> str:
        """Get the color key of a sticker at the given face and index."""
        return self.faces[face][index]

    def set_sticker(self, face: str, index: int, color: str) -> None:
        """Set the color key of a sticker at the given face and index."""
        self.faces[face][index] = color

    def clone(self) -> CubeModel:
        """Return a deep copy of this cube state."""
        new_cube = CubeModel()
        new_cube.faces = copy.deepcopy(self.faces)
        return new_cube

    def to_kociemba_string(self) -> str:
        """Convert cube state to Kociemba-format string.

        The string has 54 characters in face order U R F D L B.
        Each character represents the face that the sticker belongs to.
        """
        result = []
        for face in FACE_ORDER:
            for sticker in self.faces[face]:
                result.append(sticker)
        return "".join(result)

    def is_valid(self) -> tuple[bool, str]:
        """Validate the cube configuration.

        Returns:
            A tuple of (is_valid, error_message).
        """
        # Count colors
        counts: Dict[str, int] = {face: 0 for face in FACE_ORDER}
        for face in FACE_ORDER:
            for sticker in self.faces[face]:
                if sticker in counts:
                    counts[sticker] += 1

        # Each color must appear exactly 9 times
        for face, count in counts.items():
            if count != 9:
                return False, f"Color for face '{face}' appears {count} times (expected 9)"

        # Centers must be unique
        centers = [self.faces[face][4] for face in FACE_ORDER]
        if len(set(centers)) != 6:
            return False, "Center stickers must all be different colors"

        return True, ""

    def apply_move(self, move: str) -> None:
        """Apply a single move to the cube state.

        Supported moves: U, U', U2, D, D', D2, R, R', R2,
                        L, L', L2, F, F', F2, B, B', B2
        """
        if not move:
            return

        face = move[0]
        if len(move) == 1:
            self._rotate_face_cw(face)
            self._cycle_edges(face, clockwise=True)
        elif move[1] == "'":
            self._rotate_face_ccw(face)
            self._cycle_edges(face, clockwise=False)
        elif move[1] == "2":
            self._rotate_face_cw(face)
            self._cycle_edges(face, clockwise=True)
            self._rotate_face_cw(face)
            self._cycle_edges(face, clockwise=True)

    def _rotate_face_cw(self, face: str) -> None:
        """Rotate a single face 90 degrees clockwise."""
        f = self.faces[face]
        self.faces[face] = [
            f[6], f[3], f[0],
            f[7], f[4], f[1],
            f[8], f[5], f[2],
        ]

    def _rotate_face_ccw(self, face: str) -> None:
        """Rotate a single face 90 degrees counter-clockwise."""
        f = self.faces[face]
        self.faces[face] = [
            f[2], f[5], f[8],
            f[1], f[4], f[7],
            f[0], f[3], f[6],
        ]

    def _cycle_edges(self, face: str, clockwise: bool) -> None:
        """Cycle the edge stickers adjacent to the given face.

        Each cycle lists 4 strips in clockwise order. For a CW move,
        strip 0 receives from strip 1, strip 1 from strip 2, etc.
        """
        # Strips listed so that for CW rotation, strip[i] receives from
        # strip[i+1]. In other words, stickers flow: last → ... → 1 → 0.
        #
        # Standard CW conventions (physical sticker flow direction):
        #   U CW: F→R→B→L→F  (so R receives F, B receives R, L receives B, F receives L)
        #   D CW: F→L→B→R→F
        #   R CW: F→U→B(rev)→D→F
        #   L CW: F→D→B(rev)→U→F
        #   F CW: U→R→D(rev)→L→U
        #   B CW: U→L→D→R(rev)→U
        cycles = {
            "U": [
                ("L", [0, 1, 2]),
                ("F", [0, 1, 2]),
                ("R", [0, 1, 2]),
                ("B", [0, 1, 2]),
            ],
            "D": [
                ("R", [6, 7, 8]),
                ("F", [6, 7, 8]),
                ("L", [6, 7, 8]),
                ("B", [6, 7, 8]),
            ],
            "R": [
                ("U", [2, 5, 8]),
                ("F", [2, 5, 8]),
                ("D", [2, 5, 8]),
                ("B", [6, 3, 0]),
            ],
            "L": [
                ("D", [0, 3, 6]),
                ("F", [0, 3, 6]),
                ("U", [0, 3, 6]),
                ("B", [8, 5, 2]),
            ],
            "F": [
                ("R", [0, 3, 6]),
                ("U", [6, 7, 8]),
                ("L", [8, 5, 2]),
                ("D", [2, 1, 0]),
            ],
            "B": [
                ("L", [0, 3, 6]),
                ("U", [2, 1, 0]),
                ("R", [8, 5, 2]),
                ("D", [6, 7, 8]),
            ],
        }

        strips = cycles[face]
        if not clockwise:
            strips = list(reversed(strips))

        # Save the first strip
        first_face, first_indices = strips[0]
        saved = [self.faces[first_face][i] for i in first_indices]

        # Shift each strip to the previous position
        for s in range(len(strips) - 1):
            src_face, src_idx = strips[s + 1]
            dst_face, dst_idx = strips[s]
            for i in range(3):
                self.faces[dst_face][dst_idx[i]] = self.faces[src_face][src_idx[i]]

        # Place saved strip into the last position
        last_face, last_indices = strips[-1]
        for i in range(3):
            self.faces[last_face][last_indices[i]] = saved[i]
