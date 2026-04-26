# Rubik's Cube Solver

A standalone Python desktop application that solves 3×3 Rubik's Cubes. Users input their cube's current configuration via an interactive 2D net, and the app computes and displays visual step-by-step solving instructions with a 3D isometric cube preview.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup & Run](#setup--run)
- [Architecture Overview](#architecture-overview)
- [File-by-File Reference](#file-by-file-reference)
- [Data Model & Conventions](#data-model--conventions)
- [Signal/Slot Wiring](#signalslot-wiring)
- [Extending the Application](#extending-the-application)
- [Known Limitations & Future Ideas](#known-limitations--future-ideas)
- [Testing](#testing)

---

## Features

| Feature | Description |
|---|---|
| **Interactive 2D Cube Net** | Click-to-paint interface for all 54 stickers across 6 faces |
| **Color Palette** | Select from 6 standard Rubik's colors; click stickers to assign |
| **Kociemba Solver** | Two-phase algorithm producing near-optimal solutions (≤22 moves) |
| **3D Isometric Preview** | Shows U, F, R faces with correct sticker colors at each step |
| **Step Navigation** | First / Prev / Next / Last buttons with highlighted step list |
| **Move Annotations** | Each step shows standard notation (e.g. `R'`), face name, and direction in plain English |
| **Validation** | Checks color counts and center uniqueness before solving |
| **Dark Theme** | Catppuccin Mocha–inspired dark UI via Qt stylesheet |

---

## Tech Stack

| Component | Choice | Why |
|---|---|---|
| Language | Python 3.10+ | Type hints, `tuple[…]` lowercase generics |
| GUI | PyQt6 | Mature, cross-platform desktop framework |
| Solver | `kociemba` (pip package) | Fast C-backed two-phase Rubik's solver |
| Styling | Qt Stylesheet (QSS) | Centralized in `styles.py`, easy to theme |

---

## Prerequisites

- **Python 3.10+** (uses `tuple[…]` lowercase generics and `from __future__ import annotations`)
- **pip** (comes with Python)
- No OS-level dependencies beyond Python itself

---

## Setup & Run

```bash
# 1. Clone the repo
git clone <repo-url> && cd <repo-folder>

# 2. Create a virtual environment
python -m venv .venv

# 3. Activate
#    Windows:
.venv\Scripts\activate
#    macOS/Linux:
source .venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Launch the application
python main.py
```

In VS Code, you can also run the pre-configured task **"Run Rubik's Cube Solver"** from the task menu.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                      main.py                             │
│                     MainWindow                           │
│  ┌─────────────────────┐   ┌──────────────────────────┐  │
│  │     Left Panel       │   │     Right Panel          │  │
│  │ ┌─────────────────┐  │   │  StepViewerWidget        │  │
│  │ │ColorPaletteWidget│──────▶ ┌──────────────────┐    │  │
│  │ └─────────────────┘  │   │  │  Cube3DWidget     │    │  │
│  │ ┌─────────────────┐  │   │  └──────────────────┘    │  │
│  │ │ CubeNetWidget    │  │   │  Step label + nav btns   │  │
│  │ │ (paints onto     │  │   │  Scrollable step list    │  │
│  │ │  CubeModel)      │  │   └──────────────────────────┘  │
│  │ └─────────────────┘  │                                │
│  │  [Reset] [Solve]     │                                │
│  └─────────────────────┘                                │
└──────────────────────────────────────────────────────────┘

Data flow:
  CubeModel ──▶ solver.solve_cube() ──▶ List[SolveStep]
       │                                       │
       └── get_intermediate_states() ──▶ List[CubeModel]
                                               │
                              StepViewerWidget.set_solution(steps, states)
```

**Key principle:** `CubeModel` is the single source of truth. Widgets read from it; only `CubeNetWidget` writes to it (via click-to-paint). The solver treats it as read-only and clones it for intermediate state generation.

---

## File-by-File Reference

### `main.py` — Application Entry Point (178 lines)

| Symbol | Role |
|---|---|
| `MainWindow` | `QMainWindow` subclass; owns the `CubeModel`, wires all widgets together |
| `MainWindow._on_solve()` | Calls `solve_cube()`, then `get_intermediate_states()`, passes results to `StepViewerWidget` |
| `MainWindow._on_reset()` | Resets `CubeModel`, clears the step viewer |
| `main()` | Creates `QApplication`, applies `DARK_THEME` stylesheet, shows `MainWindow` |

### `cube_model.py` — Cube State Representation (197 lines)

| Symbol | Role |
|---|---|
| `FACE_ORDER` | `["U", "R", "F", "D", "L", "B"]` — the order Kociemba expects |
| `CubeModel.faces` | `Dict[str, List[str]]` — each face is a 9-element list (row-major, indices 0–8) |
| `CubeModel.to_kociemba_string()` | Serializes all 54 stickers into the URFDLB string format |
| `CubeModel.is_valid()` | Returns `(bool, error_msg)` — checks 9-of-each-color and unique centers |
| `CubeModel.apply_move(move)` | Applies a single move (`"R"`, `"U'"`, `"F2"`, etc.) by rotating the face and cycling adjacent edge strips |
| `CubeModel.clone()` | Deep copy via `copy.deepcopy` |

**Sticker index layout per face (row-major):**
```
0 1 2
3 4 5     ← index 4 is always the center
6 7 8
```

**Edge cycling internals (`_cycle_edges`):**
Each face move has 4 strips of 3 stickers that cycle. The `cycles` dict lists them so that `strip[i]` receives from `strip[i+1]` during a clockwise move. For counter-clockwise, the list is reversed before cycling. The indices in each strip account for flips (e.g., R's cycle includes `B[6,3,0]` because the B face is viewed from behind).

> ⚠️ **Critical note for future agents:** The edge cycle definitions were carefully validated against the `kociemba` library. If you modify `_cycle_edges`, run `test_moves.py` to verify all 6 CW, 6 CCW, and the complex scramble tests still pass. Getting these wrong will produce solutions that don't actually solve the cube.

### `solver.py` — Solving Logic (66 lines)

| Symbol | Role |
|---|---|
| `SolverError` | Custom exception for invalid/unsolvable cubes |
| `solve_cube(cube)` | Validates → converts to Kociemba string → calls `kociemba.solve()` → parses into `List[SolveStep]` |
| `get_intermediate_states(cube, steps)` | Returns `N+1` `CubeModel` snapshots: index 0 = initial, index i = state after step i |

### `move_parser.py` — Notation Parser (106 lines)

| Symbol | Role |
|---|---|
| `SolveStep` | Dataclass: `move_notation`, `face`, `direction` (`"cw"`/`"ccw"`/`"180"`), `description`, `step_number`, `total_steps` |
| `parse_move(notation)` | Single move string → `(face, direction)` tuple |
| `parse_solution(solution_string)` | Full Kociemba output string → `List[SolveStep]` |
| `FACE_NAMES` | Maps `"U"` → `"Top (Up)"`, etc. |
| `DIRECTION_DESCRIPTIONS` | Maps `"cw"` → `"clockwise"`, etc. |

### `styles.py` — Theme & Color Constants (130 lines)

| Symbol | Role |
|---|---|
| `FACE_COLORS` | `Dict[str, str]` mapping face keys to hex colors (e.g., `"U"` → `"#FFFFFF"`) |
| `COLOR_NAMES` | `Dict[str, str]` mapping face keys to human names (e.g., `"U"` → `"White"`) |
| `PALETTE_ORDER` | Order of swatches in the color picker: `["U", "R", "F", "D", "L", "B"]` |
| `DARK_THEME` | Multi-line QSS string; uses `objectName` selectors like `#solveButton`, `#title` |

**Standard color scheme:**
| Face | Key | Color | Hex |
|------|-----|-------|-----|
| Up | `U` | White | `#FFFFFF` |
| Down | `D` | Yellow | `#FFFF00` |
| Front | `F` | Green | `#00AA00` |
| Back | `B` | Blue | `#0000FF` |
| Left | `L` | Orange | `#FF8800` |
| Right | `R` | Red | `#FF0000` |

### `widgets/cube_net_widget.py` — 2D Net & Palette (223 lines)

| Class | Role |
|---|---|
| `CubeNetWidget` | Draws the unfolded cube net; handles click-to-paint. Layout: `U` top center, `L F R B` middle row, `D` bottom center. Emits `cubeChanged` signal on edit. Centers (index 4) are locked. |
| `ColorPaletteWidget` | Row of 6 color swatches. Emits `colorSelected(str)` with the face key when clicked. |

**Net grid layout (column, row):**
```
          [U]  (1,0)
[L](0,1) [F](1,1) [R](2,1) [B](3,1)
          [D]  (1,2)
```

### `widgets/cube_3d_widget.py` — Isometric 3D View (213 lines)

| Symbol | Role |
|---|---|
| `Cube3DWidget` | QPainter-based isometric projection showing U (top), F (front), R (right) faces. Supports face highlighting and rotation arrow overlay. |
| `set_cube(cube)` | Updates displayed state |
| `set_highlight(face, direction)` | Highlights a face and shows rotation arrow (↻/↺) |
| `project(right, up, depth)` | Maps 3D cube coordinates to 2D screen points using isometric vectors |

**Only 3 faces (U, F, R) are visible** in the isometric view. Moves on L, D, B faces show an arrow indicator but the affected stickers aren't directly visible.

### `widgets/step_viewer_widget.py` — Step Navigation (239 lines)

| Symbol | Role |
|---|---|
| `StepViewerWidget` | Composite widget: 3D preview + step info labels + nav buttons + scrollable step list |
| `set_solution(steps, states)` | Loads a solution; builds the step list UI; resets to step 0 (initial state) |
| `_current_step` | Index into `_states`: 0 = initial, 1..N = after each move |
| `stepChanged` signal | Emits the current step index whenever navigation occurs |

**Step indexing convention:**
```
_current_step = 0  → Initial state (before any moves)
_current_step = 1  → State after step 1 (shows step 1's move info)
_current_step = N  → Solved state (shows step N's move info)
```

The 3D widget shows `_states[_current_step]`. The step info labels show `_steps[_current_step - 1]` (when `_current_step > 0`).

### `test_moves.py` — Move Validation Tests

Verifies that `CubeModel.apply_move()` produces states consistent with `kociemba.solve()`. Tests:
1. All 6 single CW moves (R, U, F, D, L, B)
2. All 6 single CCW moves (R', U', F', D', L', B')
3. Five complex multi-move scrambles (3–10 moves each)

**Always run this after modifying `_cycle_edges` or `_rotate_face_cw`/`_rotate_face_ccw`.**

---

## Data Model & Conventions

### Face Naming
```
       ┌───┐
       │ U │  (Up / Top — White)
  ┌───┬┼───┼┬───┬───┐
  │ L ││ F ││ R │ B │
  └───┴┼───┼┴───┴───┘
       │ D │  (Down / Bottom — Yellow)
       └───┘
```
- **U** = Up (top, white) — the face you see looking down
- **D** = Down (bottom, yellow)
- **F** = Front (green) — the face facing you
- **B** = Back (blue) — opposite of front
- **R** = Right (red)
- **L** = Left (orange)

### Move Notation (Standard Singmaster)
| Notation | Meaning |
|----------|---------|
| `R` | Right face 90° clockwise (looking at the right face) |
| `R'` | Right face 90° counter-clockwise |
| `R2` | Right face 180° |
| Same pattern for `U`, `D`, `F`, `B`, `L` | |

### Kociemba String Format
54 characters in face order **U R F D L B**, 9 characters per face (row-major). Each character is the face key of the color on that sticker. Example solved state:
```
UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
```

---

## Signal/Slot Wiring

```
ColorPaletteWidget.colorSelected(str)  ──▶  CubeNetWidget.set_color(str)
CubeNetWidget.cubeChanged()            ──▶  (not currently connected — available for future use)
QPushButton("Solve").clicked           ──▶  MainWindow._on_solve()
QPushButton("Reset").clicked           ──▶  MainWindow._on_reset()
StepViewerWidget.stepChanged(int)      ──▶  (not currently connected — available for future use)
```

---

## Extending the Application

### Adding a New Widget
1. Create `widgets/your_widget.py`
2. Import and instantiate in `MainWindow._setup_ui()`
3. Connect to existing signals (e.g., `cubeChanged`, `stepChanged`)
4. Add any new QSS styles to `DARK_THEME` in `styles.py` using `objectName` selectors

### Adding a New Solver Backend
1. Implement a function with signature: `def solve(cube: CubeModel) -> List[SolveStep]`
2. Call it from `MainWindow._on_solve()` instead of (or in addition to) `solve_cube()`
3. The rest of the pipeline (`get_intermediate_states`, `StepViewerWidget`) works unchanged

### Adding Animation / Transitions
- `StepViewerWidget` emits `stepChanged(int)` on every navigation — connect to a `QTimer`-based animation
- `Cube3DWidget.paintEvent` can be extended with `QPropertyAnimation` for smooth face rotation
- The `_highlight_face` / `_highlight_direction` properties already isolate which face is moving

### Adding Support for Wider Move Sets (Slice/Rotation Moves)
- Add entries to `_cycle_edges` in `cube_model.py` for M, E, S, x, y, z moves
- Extend `parse_move()` in `move_parser.py` to recognize the new notation
- The Kociemba library only outputs face moves (U/D/R/L/F/B), so slice moves would only be needed if you add a different solver

### Showing All 6 Faces in the 3D View
- `Cube3DWidget` currently only draws U, F, R (isometric limitation)
- Option A: Add a rotation button to cycle between camera angles
- Option B: Draw a second isometric view showing D, B, L
- Option C: Integrate a real 3D renderer (e.g., PyOpenGL or Qt3D)

### Packaging as a Standalone Executable
```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name "RubiksCubeSolver" main.py
```
Output appears in `dist/`. No Python installation needed on the target machine.

---

## Known Limitations & Future Ideas

| Limitation | Notes |
|---|---|
| 3D view shows only U/F/R | See "Showing All 6 Faces" above |
| No undo on cube net painting | Could track paint history with a stack |
| No scramble import/export | Could add a text field to paste a scramble string |
| Solver runs on UI thread | For very complex states, could move to `QThread` |
| No animated 3D rotation | Step transitions are instant; could add `QPropertyAnimation` |
| No timer / move counter | Could add a practice mode with timing |
| No beginner-friendly mode | Kociemba gives optimal-ish moves, not layer-by-layer |

---

## Testing

```bash
# Run move validation tests
python test_moves.py
```

The test verifies:
- Each of the 12 single-move scrambles (6 CW + 6 CCW) can be solved by Kociemba and applying the solution returns to the solved state
- Five complex multi-move scrambles (3–10 moves) round-trip correctly

**If any test fails after a code change, the cube model's move logic is broken and will produce incorrect solutions in the UI.**

---

## License

MIT
