"""Parses Kociemba solution notation into human-readable steps."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List


FACE_NAMES = {
    "U": "Top (Up)",
    "D": "Bottom (Down)",
    "F": "Front",
    "B": "Back",
    "R": "Right",
    "L": "Left",
}

DIRECTION_DESCRIPTIONS = {
    "cw": "clockwise",
    "ccw": "counter-clockwise",
    "180": "180 degrees",
}


@dataclass
class SolveStep:
    """Represents a single step in the solving process."""

    move_notation: str       # e.g. "R", "U'", "F2"
    face: str                # e.g. "R", "U", "F"
    direction: str           # "cw", "ccw", or "180"
    description: str         # Human-readable description
    step_number: int         # 1-based step number
    total_steps: int         # Total number of steps

    @property
    def direction_text(self) -> str:
        return DIRECTION_DESCRIPTIONS[self.direction]

    @property
    def face_name(self) -> str:
        return FACE_NAMES.get(self.face, self.face)


def parse_move(notation: str) -> tuple[str, str]:
    """Parse a single move notation into (face, direction).

    Args:
        notation: A move like 'R', "U'", 'F2'

    Returns:
        Tuple of (face_letter, direction)
    """
    if not notation:
        return ("", "")

    face = notation[0]
    if len(notation) == 1:
        direction = "cw"
    elif notation[1] == "'":
        direction = "ccw"
    elif notation[1] == "2":
        direction = "180"
    else:
        direction = "cw"

    return face, direction


def parse_solution(solution_string: str) -> List[SolveStep]:
    """Parse a full Kociemba solution string into a list of SolveSteps.

    Args:
        solution_string: Space-separated moves, e.g. "R U R' U' F2 D"

    Returns:
        List of SolveStep objects.
    """
    if not solution_string or not solution_string.strip():
        return []

    moves = solution_string.strip().split()
    total = len(moves)
    steps: List[SolveStep] = []

    for i, move in enumerate(moves):
        face, direction = parse_move(move)
        if not face:
            continue

        face_name = FACE_NAMES.get(face, face)
        dir_text = DIRECTION_DESCRIPTIONS.get(direction, direction)
        description = f"Rotate the {face_name} face {dir_text}"

        step = SolveStep(
            move_notation=move,
            face=face,
            direction=direction,
            description=description,
            step_number=i + 1,
            total_steps=total,
        )
        steps.append(step)

    return steps
