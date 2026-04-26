"""Comprehensive test suite for the Rubik's Cube Solver.

Run with:  python -m pytest test_moves.py -v
    or:    python test_moves.py

Covers:
  - CubeModel: reset, clone, sticker access, validation, kociemba string,
    every single/prime/double move, face rotations, edge cycling identity,
    multi-move scrambles solved via Kociemba round-trip.
  - MoveParser: parse_move, parse_solution, SolveStep fields.
  - Solver: solve_cube, get_intermediate_states, SolverError on invalid input.
"""

from __future__ import annotations

import unittest
from typing import List

import kociemba

from cube_model import CubeModel, FACE_ORDER
from move_parser import SolveStep, parse_move, parse_solution
from solver import solve_cube, get_intermediate_states, SolverError

SOLVED_STR = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"


# ────────────────────────────────────────────────────────────────────
#  CubeModel — basic operations
# ────────────────────────────────────────────────────────────────────
class TestCubeModelBasics(unittest.TestCase):
    """Tests for CubeModel initialisation, reset, clone, sticker access."""

    def test_initial_state_is_solved(self) -> None:
        c = CubeModel()
        self.assertEqual(c.to_kociemba_string(), SOLVED_STR)

    def test_reset_restores_solved(self) -> None:
        c = CubeModel()
        c.apply_move("R")
        c.reset()
        self.assertEqual(c.to_kociemba_string(), SOLVED_STR)

    def test_clone_is_independent(self) -> None:
        c = CubeModel()
        c.apply_move("R")
        clone = c.clone()
        clone.apply_move("U")
        # Original should not be affected by clone's move
        self.assertNotEqual(c.to_kociemba_string(), clone.to_kociemba_string())
        # Original should still be just-R
        c2 = CubeModel()
        c2.apply_move("R")
        self.assertEqual(c.to_kociemba_string(), c2.to_kociemba_string())

    def test_get_set_sticker(self) -> None:
        c = CubeModel()
        self.assertEqual(c.get_sticker("U", 0), "U")
        c.set_sticker("U", 0, "R")
        self.assertEqual(c.get_sticker("U", 0), "R")

    def test_centers_are_at_index_4(self) -> None:
        c = CubeModel()
        for face in FACE_ORDER:
            self.assertEqual(c.get_sticker(face, 4), face)


# ────────────────────────────────────────────────────────────────────
#  CubeModel — validation
# ────────────────────────────────────────────────────────────────────
class TestCubeModelValidation(unittest.TestCase):
    """Tests for CubeModel.is_valid()."""

    def test_solved_cube_is_valid(self) -> None:
        c = CubeModel()
        valid, msg = c.is_valid()
        self.assertTrue(valid)
        self.assertEqual(msg, "")

    def test_scrambled_cube_is_valid(self) -> None:
        c = CubeModel()
        c.apply_move("R")
        c.apply_move("U")
        c.apply_move("F")
        valid, msg = c.is_valid()
        self.assertTrue(valid)

    def test_wrong_color_count_is_invalid(self) -> None:
        c = CubeModel()
        c.set_sticker("U", 0, "R")  # Now R has 10, U has 8
        valid, msg = c.is_valid()
        self.assertFalse(valid)
        self.assertIn("appears", msg)

    def test_duplicate_centers_is_invalid(self) -> None:
        c = CubeModel()
        # Make U center = R and R center = R (duplicate center)
        # Also swap a non-center sticker to keep color counts at 9 each
        c.faces["U"][4] = "R"  # U center is now R
        c.faces["R"][0] = "U"  # Compensate: put a U sticker on R face
        # Now R appears 10 times and U appears 8 — color count check fires first
        # We need to also move a U→R to balance: set U[0] = R won't help...
        # Simplest: just swap center + one sticker between U and R, then set
        # R center back to R.
        c2 = CubeModel()
        c2.faces["U"][4] = "R"  # center U → R (duplicate)
        c2.faces["U"][0] = "R"  # extra R on U face
        c2.faces["R"][0] = "U"  # move one R→U to compensate partial
        c2.faces["R"][1] = "U"  # move another R→U to balance (U:9, R:9)
        # Counts: U face has 7 U + 2 R = 9, R face has 7 R + 2 U = 9 — OK
        # Centers: U→R, R→R → only 5 unique centers
        valid, msg = c2.is_valid()
        self.assertFalse(valid)
        # The color count check passes (9 each), so the center check must fire
        self.assertIn("Center", msg)


# ────────────────────────────────────────────────────────────────────
#  CubeModel — single moves (CW, CCW, 180) verified via Kociemba
# ────────────────────────────────────────────────────────────────────
class TestSingleMoves(unittest.TestCase):
    """Every single face move must round-trip through Kociemba solve."""

    def _assert_move_roundtrip(self, move: str) -> None:
        """Scramble with `move`, solve with Kociemba, verify solved state."""
        c = CubeModel()
        c.apply_move(move)
        scrambled = c.to_kociemba_string()
        self.assertNotEqual(scrambled, SOLVED_STR, f"{move} should change the cube")
        solution = kociemba.solve(scrambled)
        for m in solution.split():
            c.apply_move(m)
        self.assertEqual(
            c.to_kociemba_string(), SOLVED_STR,
            f"Round-trip failed for move {move} (solution was: {solution})",
        )

    def test_R(self) -> None:
        self._assert_move_roundtrip("R")

    def test_U(self) -> None:
        self._assert_move_roundtrip("U")

    def test_F(self) -> None:
        self._assert_move_roundtrip("F")

    def test_D(self) -> None:
        self._assert_move_roundtrip("D")

    def test_L(self) -> None:
        self._assert_move_roundtrip("L")

    def test_B(self) -> None:
        self._assert_move_roundtrip("B")

    def test_R_prime(self) -> None:
        self._assert_move_roundtrip("R'")

    def test_U_prime(self) -> None:
        self._assert_move_roundtrip("U'")

    def test_F_prime(self) -> None:
        self._assert_move_roundtrip("F'")

    def test_D_prime(self) -> None:
        self._assert_move_roundtrip("D'")

    def test_L_prime(self) -> None:
        self._assert_move_roundtrip("L'")

    def test_B_prime(self) -> None:
        self._assert_move_roundtrip("B'")

    def test_R2(self) -> None:
        self._assert_move_roundtrip("R2")

    def test_U2(self) -> None:
        self._assert_move_roundtrip("U2")

    def test_F2(self) -> None:
        self._assert_move_roundtrip("F2")

    def test_D2(self) -> None:
        self._assert_move_roundtrip("D2")

    def test_L2(self) -> None:
        self._assert_move_roundtrip("L2")

    def test_B2(self) -> None:
        self._assert_move_roundtrip("B2")


# ────────────────────────────────────────────────────────────────────
#  CubeModel — algebraic move identities
# ────────────────────────────────────────────────────────────────────
class TestMoveIdentities(unittest.TestCase):
    """Verify algebraic properties of moves (inverses, order, commutativity)."""

    def test_move_times_4_is_identity(self) -> None:
        """Any face move applied 4 times returns to solved."""
        for face in FACE_ORDER:
            c = CubeModel()
            for _ in range(4):
                c.apply_move(face)
            self.assertEqual(
                c.to_kociemba_string(), SOLVED_STR,
                f"{face} * 4 should be identity",
            )

    def test_move_and_prime_cancel(self) -> None:
        """X followed by X' returns to solved."""
        for face in FACE_ORDER:
            c = CubeModel()
            c.apply_move(face)
            c.apply_move(f"{face}'")
            self.assertEqual(
                c.to_kociemba_string(), SOLVED_STR,
                f"{face} then {face}' should cancel",
            )

    def test_double_move_equals_two_singles(self) -> None:
        """X2 should equal X applied twice."""
        for face in FACE_ORDER:
            c1 = CubeModel()
            c1.apply_move(f"{face}2")
            c2 = CubeModel()
            c2.apply_move(face)
            c2.apply_move(face)
            self.assertEqual(
                c1.to_kociemba_string(), c2.to_kociemba_string(),
                f"{face}2 should equal {face} + {face}",
            )

    def test_double_move_times_2_is_identity(self) -> None:
        """X2 applied twice should return to solved."""
        for face in FACE_ORDER:
            c = CubeModel()
            c.apply_move(f"{face}2")
            c.apply_move(f"{face}2")
            self.assertEqual(
                c.to_kociemba_string(), SOLVED_STR,
                f"{face}2 * 2 should be identity",
            )

    def test_prime_times_4_is_identity(self) -> None:
        """X' applied 4 times returns to solved."""
        for face in FACE_ORDER:
            c = CubeModel()
            for _ in range(4):
                c.apply_move(f"{face}'")
            self.assertEqual(
                c.to_kociemba_string(), SOLVED_STR,
                f"{face}' * 4 should be identity",
            )

    def test_three_cw_equals_one_ccw(self) -> None:
        """X * 3 should equal X'."""
        for face in FACE_ORDER:
            c_cw3 = CubeModel()
            for _ in range(3):
                c_cw3.apply_move(face)
            c_ccw = CubeModel()
            c_ccw.apply_move(f"{face}'")
            self.assertEqual(
                c_cw3.to_kociemba_string(), c_ccw.to_kociemba_string(),
                f"{face} * 3 should equal {face}'",
            )

    def test_opposite_face_moves_commute(self) -> None:
        """Moves on opposite faces should commute: XY = YX."""
        opposites = [("U", "D"), ("R", "L"), ("F", "B")]
        for a, b in opposites:
            c1 = CubeModel()
            c1.apply_move(a)
            c1.apply_move(b)
            c2 = CubeModel()
            c2.apply_move(b)
            c2.apply_move(a)
            self.assertEqual(
                c1.to_kociemba_string(), c2.to_kociemba_string(),
                f"{a} and {b} should commute (opposite faces)",
            )


# ────────────────────────────────────────────────────────────────────
#  CubeModel — complex scramble round-trips
# ────────────────────────────────────────────────────────────────────
class TestComplexScrambles(unittest.TestCase):
    """Multi-move scrambles solved via Kociemba must round-trip to solved."""

    SCRAMBLES: List[List[str]] = [
        ["R", "U", "F"],
        ["R", "U", "R'", "U'"],
        ["F", "R", "U", "R'", "U'", "F'"],
        ["R", "U2", "R'", "F", "D", "L'", "B2"],
        ["U", "R2", "D'", "F", "L", "B'", "U2", "R", "D", "F'"],
        # Superflip-like long scramble
        ["U", "R2", "F", "B", "R", "B2", "R", "U2", "L", "B2",
         "R", "U'", "D'", "R2", "F", "R'", "L", "B2", "U2", "F2"],
        # All-face scramble
        ["R", "L", "U", "D", "F", "B"],
        # Heavy single-face
        ["R", "R", "U", "U", "R", "R", "U", "U"],
        # Prime-heavy
        ["R'", "U'", "F'", "D'", "L'", "B'", "R'", "U'"],
    ]

    def test_scramble_roundtrips(self) -> None:
        for scramble in self.SCRAMBLES:
            with self.subTest(scramble=scramble):
                c = CubeModel()
                for m in scramble:
                    c.apply_move(m)
                scrambled = c.to_kociemba_string()
                solution = kociemba.solve(scrambled)
                for m in solution.split():
                    c.apply_move(m)
                self.assertEqual(
                    c.to_kociemba_string(), SOLVED_STR,
                    f"Scramble {' '.join(scramble)} failed "
                    f"(solution: {solution})",
                )


# ────────────────────────────────────────────────────────────────────
#  CubeModel — face rotation internals
# ────────────────────────────────────────────────────────────────────
class TestFaceRotation(unittest.TestCase):
    """Verify face-only rotation (ignoring edges) preserves center & permutes."""

    def test_cw_rotation_permutation(self) -> None:
        """CW rotation: 0→2, 1→5, 2→8, 3→1, 4→4, 5→7, 6→0, 7→3, 8→6."""
        c = CubeModel()
        # Label U face stickers uniquely
        c.faces["U"] = list("ABCDEFGHI")
        c._rotate_face_cw("U")
        self.assertEqual(c.faces["U"], list("GDAHEBIFC"))

    def test_ccw_rotation_permutation(self) -> None:
        """CCW rotation is the inverse of CW."""
        c = CubeModel()
        c.faces["U"] = list("ABCDEFGHI")
        c._rotate_face_ccw("U")
        # Should be the inverse of CW
        c._rotate_face_cw("U")
        self.assertEqual(c.faces["U"], list("ABCDEFGHI"))

    def test_cw_ccw_inverse(self) -> None:
        """CW then CCW on any face should restore original face stickers."""
        for face in FACE_ORDER:
            c = CubeModel()
            c.faces[face] = list("123456789")
            c._rotate_face_cw(face)
            c._rotate_face_ccw(face)
            self.assertEqual(c.faces[face], list("123456789"))


# ────────────────────────────────────────────────────────────────────
#  MoveParser — parse_move
# ────────────────────────────────────────────────────────────────────
class TestParseMove(unittest.TestCase):

    def test_cw_moves(self) -> None:
        for face in "URFDLB":
            f, d = parse_move(face)
            self.assertEqual(f, face)
            self.assertEqual(d, "cw")

    def test_ccw_moves(self) -> None:
        for face in "URFDLB":
            f, d = parse_move(f"{face}'")
            self.assertEqual(f, face)
            self.assertEqual(d, "ccw")

    def test_double_moves(self) -> None:
        for face in "URFDLB":
            f, d = parse_move(f"{face}2")
            self.assertEqual(f, face)
            self.assertEqual(d, "180")

    def test_empty_string(self) -> None:
        f, d = parse_move("")
        self.assertEqual(f, "")
        self.assertEqual(d, "")


# ────────────────────────────────────────────────────────────────────
#  MoveParser — parse_solution
# ────────────────────────────────────────────────────────────────────
class TestParseSolution(unittest.TestCase):

    def test_empty_string_returns_empty(self) -> None:
        self.assertEqual(parse_solution(""), [])
        self.assertEqual(parse_solution("   "), [])

    def test_none_returns_empty(self) -> None:
        self.assertEqual(parse_solution(None), [])  # type: ignore[arg-type]

    def test_single_move(self) -> None:
        steps = parse_solution("R")
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0].move_notation, "R")
        self.assertEqual(steps[0].face, "R")
        self.assertEqual(steps[0].direction, "cw")
        self.assertEqual(steps[0].step_number, 1)
        self.assertEqual(steps[0].total_steps, 1)

    def test_multi_move(self) -> None:
        steps = parse_solution("R U' F2")
        self.assertEqual(len(steps), 3)
        self.assertEqual(steps[0].move_notation, "R")
        self.assertEqual(steps[1].move_notation, "U'")
        self.assertEqual(steps[1].direction, "ccw")
        self.assertEqual(steps[2].move_notation, "F2")
        self.assertEqual(steps[2].direction, "180")
        self.assertEqual(steps[2].step_number, 3)
        self.assertEqual(steps[2].total_steps, 3)

    def test_description_format(self) -> None:
        steps = parse_solution("R'")
        self.assertIn("Right", steps[0].description)
        self.assertIn("counter-clockwise", steps[0].description)

    def test_solve_step_properties(self) -> None:
        steps = parse_solution("U")
        self.assertEqual(steps[0].face_name, "Top (Up)")
        self.assertEqual(steps[0].direction_text, "clockwise")


# ────────────────────────────────────────────────────────────────────
#  Solver — solve_cube
# ────────────────────────────────────────────────────────────────────
class TestSolveCube(unittest.TestCase):

    def test_solved_cube_solution_is_valid(self) -> None:
        """Solving an already-solved cube should return a valid (possibly empty)
        solution that keeps the cube solved."""
        c = CubeModel()
        steps = solve_cube(c)
        # Apply whatever the solver returns
        for s in steps:
            c.apply_move(s.move_notation)
        self.assertEqual(c.to_kociemba_string(), SOLVED_STR)

    def test_single_move_scramble(self) -> None:
        c = CubeModel()
        c.apply_move("R")
        steps = solve_cube(c)
        self.assertGreater(len(steps), 0)
        # Verify solution actually solves it
        for s in steps:
            c.apply_move(s.move_notation)
        self.assertEqual(c.to_kociemba_string(), SOLVED_STR)

    def test_complex_scramble(self) -> None:
        c = CubeModel()
        for m in ["R", "U", "F", "D'", "L2", "B"]:
            c.apply_move(m)
        steps = solve_cube(c)
        for s in steps:
            c.apply_move(s.move_notation)
        self.assertEqual(c.to_kociemba_string(), SOLVED_STR)

    def test_invalid_cube_raises(self) -> None:
        c = CubeModel()
        c.set_sticker("U", 0, "R")  # Breaks color count
        with self.assertRaises(SolverError):
            solve_cube(c)


# ────────────────────────────────────────────────────────────────────
#  Solver — get_intermediate_states
# ────────────────────────────────────────────────────────────────────
class TestIntermediateStates(unittest.TestCase):

    def test_states_count(self) -> None:
        """Should return N+1 states for N steps."""
        c = CubeModel()
        c.apply_move("R")
        steps = solve_cube(c)
        states = get_intermediate_states(c, steps)
        self.assertEqual(len(states), len(steps) + 1)

    def test_first_state_matches_input(self) -> None:
        c = CubeModel()
        c.apply_move("R")
        steps = solve_cube(c)
        states = get_intermediate_states(c, steps)
        self.assertEqual(states[0].to_kociemba_string(), c.to_kociemba_string())

    def test_last_state_is_solved(self) -> None:
        c = CubeModel()
        c.apply_move("R")
        steps = solve_cube(c)
        states = get_intermediate_states(c, steps)
        self.assertEqual(states[-1].to_kociemba_string(), SOLVED_STR)

    def test_each_state_differs_from_previous(self) -> None:
        """Each intermediate state should differ from the one before it."""
        c = CubeModel()
        for m in ["R", "U", "F"]:
            c.apply_move(m)
        steps = solve_cube(c)
        states = get_intermediate_states(c, steps)
        for i in range(1, len(states)):
            self.assertNotEqual(
                states[i].to_kociemba_string(),
                states[i - 1].to_kociemba_string(),
                f"State {i} should differ from state {i-1}",
            )

    def test_states_are_independent_copies(self) -> None:
        """Mutating one state should not affect others."""
        c = CubeModel()
        c.apply_move("R")
        steps = solve_cube(c)
        states = get_intermediate_states(c, steps)
        original = states[0].to_kociemba_string()
        states[1].apply_move("U")
        self.assertEqual(states[0].to_kociemba_string(), original)


# ────────────────────────────────────────────────────────────────────
#  Kociemba string format
# ────────────────────────────────────────────────────────────────────
class TestKociembaString(unittest.TestCase):

    def test_length_is_54(self) -> None:
        c = CubeModel()
        self.assertEqual(len(c.to_kociemba_string()), 54)

    def test_solved_string_format(self) -> None:
        c = CubeModel()
        s = c.to_kociemba_string()
        # Should be 9 of each face letter in URFDLB order
        self.assertEqual(s[0:9], "U" * 9)
        self.assertEqual(s[9:18], "R" * 9)
        self.assertEqual(s[18:27], "F" * 9)
        self.assertEqual(s[27:36], "D" * 9)
        self.assertEqual(s[36:45], "L" * 9)
        self.assertEqual(s[45:54], "B" * 9)

    def test_scrambled_string_has_all_colors(self) -> None:
        c = CubeModel()
        c.apply_move("R")
        s = c.to_kociemba_string()
        for face in FACE_ORDER:
            self.assertEqual(s.count(face), 9)


# ────────────────────────────────────────────────────────────────────
#  Entry point
# ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    unittest.main()