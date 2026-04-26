"""Rubik's Cube solving logic using the Kociemba two-phase algorithm."""

from __future__ import annotations

from typing import List, Optional

import kociemba

from cube_model import CubeModel
from move_parser import SolveStep, parse_solution


class SolverError(Exception):
    """Raised when the cube cannot be solved."""
    pass


def solve_cube(cube: CubeModel) -> List[SolveStep]:
    """Solve the given cube and return the list of steps.

    Args:
        cube: A CubeModel with the current configuration.

    Returns:
        A list of SolveStep objects describing the solution.

    Raises:
        SolverError: If the cube state is invalid or unsolvable.
    """
    # Validate cube first
    is_valid, error_msg = cube.is_valid()
    if not is_valid:
        raise SolverError(f"Invalid cube configuration: {error_msg}")

    # Convert to Kociemba string
    cube_string = cube.to_kociemba_string()

    try:
        solution = kociemba.solve(cube_string)
    except ValueError as e:
        raise SolverError(f"Cannot solve this cube: {e}")
    except Exception as e:
        raise SolverError(f"Solver error: {e}")

    # Parse solution into steps
    steps = parse_solution(solution)
    return steps


def get_intermediate_states(
    cube: CubeModel, steps: List[SolveStep]
) -> List[CubeModel]:
    """Generate the cube state after each step.

    Returns a list where index 0 is the initial state and index i+1 is
    the state after applying step i.
    """
    states: List[CubeModel] = [cube.clone()]
    current = cube.clone()

    for step in steps:
        current.apply_move(step.move_notation)
        states.append(current.clone())

    return states
