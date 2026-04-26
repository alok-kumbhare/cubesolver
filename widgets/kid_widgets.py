"""Kid-friendly widgets for the Rubik's Cube Solver.

Designed for children aged ~5: large targets, emoji labels, guided
face-by-face input, simple language, star progress, and celebrations.
"""

from __future__ import annotations

import random
from typing import List, Optional

from PyQt6.QtCore import Qt, QRectF, QTimer, QPointF, pyqtSignal
from PyQt6.QtGui import (
    QColor, QPainter, QPen, QBrush, QFont, QMouseEvent, QPolygonF,
)
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QSizePolicy, QFrame,
)

from cube_model import CubeModel
from move_parser import SolveStep
from styles import (
    FACE_COLORS, COLOR_NAMES, COLOR_EMOJI, PALETTE_ORDER,
    KID_FACE_NAMES, KID_DIRECTION, KID_FACE_GUIDE_ORDER,
    KID_FACE_GUIDE_PROMPTS,
)


# ────────────────────────────────────────────────────────────────────
#  Kid Color Palette — big round swatches with emoji
# ────────────────────────────────────────────────────────────────────
class KidColorPaletteWidget(QWidget):
    """Large circular color swatches for kids to tap."""

    colorSelected = pyqtSignal(str)

    SWATCH_SIZE = 56

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._selected: str = "R"
        self.setMinimumHeight(self.SWATCH_SIZE + 36)
        self.setMaximumHeight(self.SWATCH_SIZE + 36)
        self.setMouseTracking(True)
        self._hover_index: int = -1

    def _swatch_rect(self, index: int) -> QRectF:
        gap = 14
        total_width = len(PALETTE_ORDER) * (self.SWATCH_SIZE + gap) - gap
        start_x = (self.width() - total_width) / 2
        x = start_x + index * (self.SWATCH_SIZE + gap)
        y = 6.0
        return QRectF(x, y, self.SWATCH_SIZE, self.SWATCH_SIZE)

    def paintEvent(self, event) -> None:  # type: ignore[override]
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        for i, key in enumerate(PALETTE_ORDER):
            rect = self._swatch_rect(i)
            color = QColor(FACE_COLORS[key])
            if i == self._hover_index:
                color = color.lighter(120)

            painter.setBrush(QBrush(color))
            if key == self._selected:
                pen = QPen(QColor("#f9e2af"), 4)
            else:
                pen = QPen(QColor("#45475a"), 2)
            painter.setPen(pen)
            painter.drawEllipse(rect)

            # Emoji label inside circle
            painter.setPen(Qt.PenStyle.NoPen)
            font = QFont("Segoe UI Emoji", 20)
            painter.setFont(font)
            painter.setPen(QPen(QColor("#11111b")))
            painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, COLOR_EMOJI[key])

        painter.end()

    def mousePressEvent(self, event: QMouseEvent) -> None:  # type: ignore[override]
        if event.button() == Qt.MouseButton.LeftButton:
            pos = event.position()
            for i, key in enumerate(PALETTE_ORDER):
                rect = self._swatch_rect(i)
                cx = rect.center().x()
                cy = rect.center().y()
                r = self.SWATCH_SIZE / 2
                if (pos.x() - cx) ** 2 + (pos.y() - cy) ** 2 <= r ** 2:
                    self._selected = key
                    self.colorSelected.emit(key)
                    self.update()
                    break

    def mouseMoveEvent(self, event: QMouseEvent) -> None:  # type: ignore[override]
        pos = event.position()
        self._hover_index = -1
        for i, key in enumerate(PALETTE_ORDER):
            rect = self._swatch_rect(i)
            cx = rect.center().x()
            cy = rect.center().y()
            r = self.SWATCH_SIZE / 2
            if (pos.x() - cx) ** 2 + (pos.y() - cy) ** 2 <= r ** 2:
                self._hover_index = i
                break
        self.update()

    def leaveEvent(self, event) -> None:  # type: ignore[override]
        self._hover_index = -1
        self.update()


# ────────────────────────────────────────────────────────────────────
#  Kid Cube Net — guided face-by-face with large cells
# ────────────────────────────────────────────────────────────────────
class KidCubeNetWidget(QWidget):
    """Guided face-by-face cube input with large, kid-friendly cells.

    Shows one face at a time with a big prompt, Prev/Next face buttons,
    and bigger sticker cells (60px).
    """

    cubeChanged = pyqtSignal()

    CELL_SIZE = 60
    CELL_GAP = 4

    def __init__(self, cube: CubeModel, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.cube = cube
        self.selected_color: str = "R"
        self._current_face_idx: int = 0

        self._setup_ui()

    @property
    def _current_face(self) -> str:
        return KID_FACE_GUIDE_ORDER[self._current_face_idx]

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setSpacing(10)

        # Prompt label
        self._prompt_label = QLabel()
        self._prompt_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._prompt_label.setStyleSheet(
            "font-size: 20px; font-weight: bold; color: #f9e2af;"
        )
        layout.addWidget(self._prompt_label)

        # Face name + color indicator
        self._face_label = QLabel()
        self._face_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._face_label.setStyleSheet("font-size: 28px; font-weight: bold;")
        layout.addWidget(self._face_label)

        # The 3x3 grid canvas
        self._canvas = _KidFaceCanvas(self)
        canvas_size = 3 * self.CELL_SIZE + 2 * self.CELL_GAP + 20
        self._canvas.setFixedSize(canvas_size, canvas_size)
        canvas_container = QHBoxLayout()
        canvas_container.addStretch()
        canvas_container.addWidget(self._canvas)
        canvas_container.addStretch()
        layout.addLayout(canvas_container)

        # Hint
        self._hint = QLabel("Tap a square, then tap a color circle above! 🎨")
        self._hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._hint.setStyleSheet("font-size: 14px; color: #a6adc8;")
        self._hint.setWordWrap(True)
        layout.addWidget(self._hint)

        # Prev / Next face buttons
        nav = QHBoxLayout()
        nav.setSpacing(16)

        self._btn_prev_face = QPushButton("⬅️  Previous Face")
        self._btn_prev_face.setStyleSheet(
            "font-size: 16px; padding: 10px 20px; font-weight: bold;"
        )
        self._btn_prev_face.setCursor(Qt.CursorShape.PointingHandCursor)
        self._btn_prev_face.clicked.connect(self._prev_face)

        self._btn_next_face = QPushButton("Next Face  ➡️")
        self._btn_next_face.setStyleSheet(
            "font-size: 16px; padding: 10px 20px; font-weight: bold;"
        )
        self._btn_next_face.setCursor(Qt.CursorShape.PointingHandCursor)
        self._btn_next_face.clicked.connect(self._next_face)

        nav.addStretch()
        nav.addWidget(self._btn_prev_face)
        nav.addWidget(self._btn_next_face)
        nav.addStretch()
        layout.addLayout(nav)

        # Face progress dots
        self._dots_label = QLabel()
        self._dots_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._dots_label.setStyleSheet("font-size: 22px;")
        layout.addWidget(self._dots_label)

        self._update_face_display()

    def set_color(self, color_key: str) -> None:
        """Set the active painting color."""
        self.selected_color = color_key
        self._canvas.update()

    def _prev_face(self) -> None:
        if self._current_face_idx > 0:
            self._current_face_idx -= 1
            self._update_face_display()

    def _next_face(self) -> None:
        if self._current_face_idx < len(KID_FACE_GUIDE_ORDER) - 1:
            self._current_face_idx += 1
            self._update_face_display()

    def _update_face_display(self) -> None:
        face = self._current_face
        self._prompt_label.setText(KID_FACE_GUIDE_PROMPTS[face])

        emoji = COLOR_EMOJI[face]
        name = KID_FACE_NAMES[face]
        color_name = COLOR_NAMES[face]
        self._face_label.setText(f"{emoji} {name} ({color_name}) {emoji}")
        self._face_label.setStyleSheet(
            f"font-size: 28px; font-weight: bold; color: {FACE_COLORS[face]};"
        )

        # Dots progress
        dots = ""
        for i, f in enumerate(KID_FACE_GUIDE_ORDER):
            if i == self._current_face_idx:
                dots += f" {COLOR_EMOJI[f]} "
            else:
                dots += " ⚫ "
        self._dots_label.setText(dots)

        self._btn_prev_face.setEnabled(self._current_face_idx > 0)
        self._btn_next_face.setEnabled(
            self._current_face_idx < len(KID_FACE_GUIDE_ORDER) - 1
        )

        self._canvas.update()

    def handle_cell_click(self, index: int) -> None:
        """Called by the canvas when a cell is clicked."""
        if index == 4:
            return  # Center is locked
        self.cube.set_sticker(self._current_face, index, self.selected_color)
        self.cubeChanged.emit()
        self._canvas.update()


class _KidFaceCanvas(QWidget):
    """Canvas that draws a single 3x3 face with large rounded cells."""

    def __init__(self, parent: KidCubeNetWidget) -> None:
        super().__init__(parent)
        self._net = parent
        self._hover_cell: int = -1
        self.setMouseTracking(True)

    def _cell_rect(self, index: int) -> QRectF:
        row, col = index // 3, index % 3
        sz = self._net.CELL_SIZE
        gap = self._net.CELL_GAP
        margin = 10
        x = margin + col * (sz + gap)
        y = margin + row * (sz + gap)
        return QRectF(x, y, sz, sz)

    def _hit_test(self, x: float, y: float) -> int:
        for i in range(9):
            if self._cell_rect(i).contains(x, y):
                return i
        return -1

    def paintEvent(self, event) -> None:  # type: ignore[override]
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        face = self._net._current_face

        for i in range(9):
            rect = self._cell_rect(i)
            color_key = self._net.cube.get_sticker(face, i)
            color = QColor(FACE_COLORS.get(color_key, "#888888"))

            if i == self._hover_cell and i != 4:
                color = color.lighter(130)

            painter.setBrush(QBrush(color))

            is_center = (i == 4)
            if is_center:
                pen = QPen(QColor("#f9e2af"), 3)
            else:
                pen = QPen(QColor("#11111b"), 2)
            painter.setPen(pen)
            painter.drawRoundedRect(rect, 10, 10)

            # Center gets a lock emoji
            if is_center:
                font = QFont("Segoe UI Emoji", 18)
                painter.setFont(font)
                painter.setPen(QPen(QColor("#11111b")))
                painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, "🔒")

        painter.end()

    def mousePressEvent(self, event: QMouseEvent) -> None:  # type: ignore[override]
        if event.button() == Qt.MouseButton.LeftButton:
            idx = self._hit_test(event.position().x(), event.position().y())
            if idx >= 0:
                self._net.handle_cell_click(idx)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:  # type: ignore[override]
        idx = self._hit_test(event.position().x(), event.position().y())
        if idx != self._hover_cell:
            self._hover_cell = idx
            self.update()

    def leaveEvent(self, event) -> None:  # type: ignore[override]
        self._hover_cell = -1
        self.update()


# ────────────────────────────────────────────────────────────────────
#  Kid Flat Face Widget — shows a single face with rotation arrow
# ────────────────────────────────────────────────────────────────────
class KidFlatFaceWidget(QWidget):
    """Renders a single 3x3 face flat with a large rotation arrow overlay.

    Used in kid step viewer to show the face that is "looking at you"
    (the face being turned) with a clear direction arrow.
    """

    CELL_SIZE = 60
    CELL_GAP = 4
    MARGIN = 16

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._cube: Optional[CubeModel] = None
        self._face: Optional[str] = None
        self._direction: Optional[str] = None
        grid = 3 * self.CELL_SIZE + 2 * self.CELL_GAP + 2 * self.MARGIN
        self.setFixedSize(grid, grid)

    def set_state(
        self,
        cube: Optional[CubeModel],
        face: Optional[str],
        direction: Optional[str],
    ) -> None:
        self._cube = cube
        self._face = face
        self._direction = direction
        self.update()

    def clear(self) -> None:
        self._cube = None
        self._face = None
        self._direction = None
        self.update()

    def _cell_rect(self, index: int) -> QRectF:
        row, col = index // 3, index % 3
        sz = self.CELL_SIZE
        gap = self.CELL_GAP
        x = self.MARGIN + col * (sz + gap)
        y = self.MARGIN + row * (sz + gap)
        return QRectF(x, y, sz, sz)

    def paintEvent(self, event) -> None:  # type: ignore[override]
        if not self._cube or not self._face:
            return

        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        face = self._face

        # Draw the 3x3 grid
        for i in range(9):
            rect = self._cell_rect(i)
            color_key = self._cube.get_sticker(face, i)
            color = QColor(FACE_COLORS.get(color_key, "#888888"))

            painter.setBrush(QBrush(color))
            painter.setPen(QPen(QColor("#11111b"), 2))
            painter.drawRoundedRect(rect, 8, 8)

        # Draw rotation arrow overlay
        if self._direction:
            self._draw_rotation_arrow(painter)

        painter.end()

    def _draw_rotation_arrow(self, painter: QPainter) -> None:
        """Draw a large curved rotation arrow over the face grid."""
        direction = self._direction
        if not direction:
            return

        cx = self.width() / 2.0
        cy = self.height() / 2.0
        r = 85.0

        # Semi-transparent circle background
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QBrush(QColor(30, 30, 46, 160)))
        painter.drawEllipse(QPointF(cx, cy), r, r)

        # Arrow symbol
        symbol_map = {
            "cw": "↻",
            "ccw": "↺",
            "180": "🔄",
        }
        symbol = symbol_map.get(direction, "↻")

        painter.setPen(QPen(QColor("#f9e2af")))
        font = QFont("Segoe UI Emoji", 44, QFont.Weight.Bold)
        painter.setFont(font)
        painter.drawText(
            QRectF(cx - r, cy - r, 2 * r, 2 * r),
            Qt.AlignmentFlag.AlignCenter,
            symbol,
        )

        # Label below the arrow
        label_map = {
            "cw": "Turn this way ➡️",
            "ccw": "Turn this way ⬅️",
            "180": "Turn TWICE 🔄",
        }
        label = label_map.get(direction, "")
        if label:
            painter.setPen(QPen(QColor("#f9e2af")))
            font2 = QFont("Segoe UI", 11, QFont.Weight.Bold)
            painter.setFont(font2)
            label_rect = QRectF(0, self.height() - self.MARGIN - 4, self.width(), 20)
            painter.drawText(label_rect, Qt.AlignmentFlag.AlignCenter, label)


# ────────────────────────────────────────────────────────────────────
#  Kid 3D Cube — larger with big painted arrows
# ────────────────────────────────────────────────────────────────────
class KidCube3DWidget(QWidget):
    """Larger isometric cube view with big colorful rotation arrows."""

    SIZE = 400

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._cube: Optional[CubeModel] = None
        self._highlight_face: Optional[str] = None
        self._highlight_direction: Optional[str] = None
        self.setMinimumSize(self.SIZE, self.SIZE)
        self.setMaximumSize(self.SIZE + 40, self.SIZE + 40)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)

    def set_cube(self, cube: CubeModel) -> None:
        """Set the cube state to display."""
        self._cube = cube
        self.update()

    def set_highlight(self, face: Optional[str], direction: Optional[str]) -> None:
        """Highlight a face with rotation direction indicator."""
        self._highlight_face = face
        self._highlight_direction = direction
        self.update()

    def clear_highlight(self) -> None:
        self._highlight_face = None
        self._highlight_direction = None
        self.update()

    def paintEvent(self, event) -> None:  # type: ignore[override]
        if self._cube is None:
            return

        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        cx = self.width() / 2
        cy = self.height() / 2

        # Scale cell size to fit within the actual widget dimensions
        # The isometric cube spans roughly 6*ry vertically (3 top + 3 front)
        # plus some offset, so use a factor that keeps it inside bounds.
        cell = min(self.width(), self.height()) / 9.5

        rx, ry = 0.866 * cell, 0.5 * cell
        lx, ly = -0.866 * cell, 0.5 * cell
        ux, uy = 0, -cell

        ox = cx - 0.5 * (3 * rx + 3 * lx)
        oy = cy - 0.5 * (3 * uy)

        def project(right: float, up: float, depth: float) -> QPointF:
            x = ox + right * rx + depth * lx + up * ux
            y = oy + right * ry + depth * ly + up * uy
            return QPointF(x, y)

        # Draw faces: U (top), F (front), R (right)
        face_specs = [
            ("U", lambda r, c: [
                project(c, 3, r), project(c + 1, 3, r),
                project(c + 1, 3, r + 1), project(c, 3, r + 1),
            ], 0),
            ("F", lambda r, c: [
                project(c, 3 - r, 3), project(c + 1, 3 - r, 3),
                project(c + 1, 3 - r - 1, 3), project(c, 3 - r - 1, 3),
            ], 25),
            ("R", lambda r, c: [
                project(3, 3 - r, 3 - c), project(3, 3 - r, 3 - c - 1),
                project(3, 3 - r - 1, 3 - c - 1), project(3, 3 - r - 1, 3 - c),
            ], 50),
        ]

        for face_name, corner_fn, darken in face_specs:
            for row in range(3):
                for col in range(3):
                    index = row * 3 + col
                    color_key = self._cube.get_sticker(face_name, index)
                    color = QColor(FACE_COLORS.get(color_key, "#888888"))
                    if darken > 0:
                        color = color.darker(100 + darken)
                    if face_name == self._highlight_face:
                        color = color.lighter(140)

                    corners = corner_fn(row, col)
                    painter.setBrush(QBrush(color))
                    painter.setPen(QPen(QColor("#11111b"), 1.5))
                    painter.drawPolygon(QPolygonF(corners))

        # Draw big arrow indicator
        if self._highlight_face and self._highlight_direction:
            self._draw_big_arrow(painter, cx, cy)

        painter.end()

    def _draw_big_arrow(self, painter: QPainter, cx: float, cy: float) -> None:
        """Draw a large rotation arrow with a yellow circle background."""
        face = self._highlight_face
        direction = self._highlight_direction
        if not face or not direction:
            return

        symbol_map = {
            "cw": "↻",
            "ccw": "↺",
            "180": "↻↻",
        }
        symbol = symbol_map.get(direction, "↻")

        # Scale offsets proportionally to widget size
        s = min(self.width(), self.height()) * 0.32
        positions = {
            "U": QPointF(cx, cy - s),
            "F": QPointF(cx - s * 0.6, cy + s * 0.6),
            "R": QPointF(cx + s * 0.6, cy + s * 0.6),
            "D": QPointF(cx, cy + s),
            "L": QPointF(cx - s, cy),
            "B": QPointF(cx + s, cy - s * 0.4),
        }
        pos = positions.get(face, QPointF(cx, cy - s))

        r = min(self.width(), self.height()) * 0.085

        # Big yellow circle background
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QBrush(QColor(249, 226, 175, 200)))
        painter.drawEllipse(pos, r, r)

        # Arrow symbol
        painter.setPen(QPen(QColor("#1e1e2e")))
        font_size = max(12, int(r * 0.9))
        font = QFont("Segoe UI", font_size, QFont.Weight.Bold)
        painter.setFont(font)
        painter.drawText(
            QRectF(pos.x() - r, pos.y() - r * 0.6, 2 * r, 1.2 * r),
            Qt.AlignmentFlag.AlignCenter,
            symbol,
        )


# ────────────────────────────────────────────────────────────────────
#  Confetti overlay for celebration
# ────────────────────────────────────────────────────────────────────
class ConfettiWidget(QWidget):
    """Transparent overlay that animates falling confetti pieces."""

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self._pieces: List[dict] = []
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._active = False

    def start(self) -> None:
        """Launch confetti for ~3 seconds."""
        self._pieces = []
        w = self.width() or 500
        for _ in range(60):
            self._pieces.append({
                "x": random.uniform(0, w),
                "y": random.uniform(-200, -20),
                "vx": random.uniform(-2, 2),
                "vy": random.uniform(3, 8),
                "size": random.uniform(6, 14),
                "color": QColor(random.choice([
                    "#f38ba8", "#a6e3a1", "#89b4fa", "#f9e2af",
                    "#cba6f7", "#fab387", "#94e2d5",
                ])),
                "rot": random.uniform(0, 360),
            })
        self._active = True
        self._timer.start(30)
        QTimer.singleShot(3500, self.stop)

    def stop(self) -> None:
        """Stop the confetti animation."""
        self._active = False
        self._timer.stop()
        self._pieces = []
        self.update()

    def _tick(self) -> None:
        for p in self._pieces:
            p["x"] += p["vx"]
            p["y"] += p["vy"]
            p["rot"] += 5
        self.update()

    def paintEvent(self, event) -> None:  # type: ignore[override]
        if not self._active or not self._pieces:
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        for p in self._pieces:
            painter.save()
            painter.translate(p["x"], p["y"])
            painter.rotate(p["rot"])
            painter.setBrush(QBrush(p["color"]))
            painter.setPen(Qt.PenStyle.NoPen)
            s = p["size"]
            painter.drawRoundedRect(QRectF(-s / 2, -s / 2, s, s * 0.5), 2, 2)
            painter.restore()
        painter.end()


# ────────────────────────────────────────────────────────────────────
#  Kid Step Viewer — simple words, big arrows, star progress
# ────────────────────────────────────────────────────────────────────
class KidStepViewerWidget(QWidget):
    """Kid-friendly step-by-step viewer with visual instructions.

    Shows a hold-orientation instruction, a flat 2D face view of the
    face being turned (primary), and a smaller 3D cube preview.
    """

    stepChanged = pyqtSignal(int)

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._steps: List[SolveStep] = []
        self._states: List[CubeModel] = []
        self._current_step: int = 0

        self._setup_ui()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setSpacing(10)

        # Title
        title = QLabel("🧩 Let's Solve It!")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setStyleSheet(
            "font-size: 26px; font-weight: bold; color: #89b4fa;"
        )
        layout.addWidget(title)

        # Visuals row: flat face (primary) + 3D preview (secondary)
        visuals = QHBoxLayout()
        visuals.setSpacing(12)

        # Flat face view — the main action display
        face_col = QVBoxLayout()
        face_col.setSpacing(4)
        face_title = QLabel("👇 This face is looking at you")
        face_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        face_title.setStyleSheet(
            "font-size: 13px; color: #a6adc8; font-weight: bold;"
        )
        face_col.addWidget(face_title)
        self._flat_face = KidFlatFaceWidget()
        face_col.addWidget(self._flat_face, alignment=Qt.AlignmentFlag.AlignCenter)
        visuals.addLayout(face_col)

        # 3D preview — secondary, smaller
        preview_col = QVBoxLayout()
        preview_col.setSpacing(4)
        preview_title = QLabel("🔍 Whole cube preview")
        preview_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        preview_title.setStyleSheet(
            "font-size: 13px; color: #a6adc8; font-weight: bold;"
        )
        preview_col.addWidget(preview_title)
        self._cube_3d = KidCube3DWidget()
        self._cube_3d.SIZE = 260
        self._cube_3d.setMinimumSize(260, 260)
        self._cube_3d.setMaximumSize(300, 300)
        preview_col.addWidget(self._cube_3d, alignment=Qt.AlignmentFlag.AlignCenter)
        visuals.addLayout(preview_col)

        layout.addLayout(visuals)

        # Big instruction label
        self._instruction_label = QLabel("Press Solve to start! 🚀")
        self._instruction_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._instruction_label.setWordWrap(True)
        self._instruction_label.setStyleSheet(
            "font-size: 24px; font-weight: bold; color: #cdd6f4; "
            "padding: 12px; background-color: #313244; border-radius: 12px;"
        )
        layout.addWidget(self._instruction_label)

        # Progress stars
        self._progress_label = QLabel("")
        self._progress_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._progress_label.setStyleSheet("font-size: 20px;")
        layout.addWidget(self._progress_label)

        # Step counter
        self._counter_label = QLabel("")
        self._counter_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._counter_label.setStyleSheet("font-size: 16px; color: #a6adc8;")
        layout.addWidget(self._counter_label)

        # Separator
        sep = QFrame()
        sep.setObjectName("separator")
        sep.setFrameShape(QFrame.Shape.HLine)
        layout.addWidget(sep)

        # BIG navigation buttons
        nav = QHBoxLayout()
        nav.setSpacing(20)

        self._btn_prev = QPushButton("⬅️  Back")
        self._btn_prev.setStyleSheet(
            "font-size: 22px; padding: 14px 28px; font-weight: bold; "
            "border-radius: 12px;"
        )
        self._btn_prev.setCursor(Qt.CursorShape.PointingHandCursor)
        self._btn_prev.clicked.connect(self._go_prev)

        self._btn_next = QPushButton("Next  ➡️")
        self._btn_next.setStyleSheet(
            "font-size: 22px; padding: 14px 28px; font-weight: bold; "
            "background-color: #a6e3a1; color: #1e1e2e; border-radius: 12px;"
        )
        self._btn_next.setCursor(Qt.CursorShape.PointingHandCursor)
        self._btn_next.clicked.connect(self._go_next)

        nav.addStretch()
        nav.addWidget(self._btn_prev)
        nav.addWidget(self._btn_next)
        nav.addStretch()
        layout.addLayout(nav)

        layout.addStretch()

        # Confetti overlay
        self._confetti = ConfettiWidget(self)

        self._update_buttons()

    def resizeEvent(self, event) -> None:  # type: ignore[override]
        super().resizeEvent(event)
        self._confetti.setGeometry(self.rect())

    def set_solution(
        self, steps: List[SolveStep], states: List[CubeModel]
    ) -> None:
        """Load a new solution to display."""
        self._steps = steps
        self._states = states
        self._current_step = 0
        self._update_display()

    def clear(self) -> None:
        """Clear the solution display."""
        self._steps = []
        self._states = []
        self._current_step = 0
        self._instruction_label.setText("Press Solve to start! 🚀")
        self._instruction_label.setStyleSheet(
            "font-size: 24px; font-weight: bold; color: #cdd6f4; "
            "padding: 12px; background-color: #313244; border-radius: 12px;"
        )
        self._progress_label.setText("")
        self._counter_label.setText("")
        self._cube_3d.set_cube(CubeModel())
        self._cube_3d.clear_highlight()
        self._flat_face.clear()
        self._confetti.stop()
        self._update_buttons()

    def _update_display(self) -> None:
        if not self._steps:
            self._instruction_label.setText("Already solved! 🎉🥳")
            self._progress_label.setText("⭐")
            self._counter_label.setText("")
            self._cube_3d.clear_highlight()
            self._flat_face.clear()
            self._update_buttons()
            return

        idx = self._current_step
        total = len(self._steps)

        if idx == 0:
            self._instruction_label.setText(
                "This is your cube right now.\nReady? Press Next ➡️"
            )
            self._instruction_label.setStyleSheet(
                "font-size: 24px; font-weight: bold; color: #cdd6f4; "
                "padding: 12px; background-color: #313244; border-radius: 12px;"
            )
            self._cube_3d.clear_highlight()
            self._flat_face.clear()
        elif idx <= total:
            step = self._steps[idx - 1]
            face = step.face
            emoji = COLOR_EMOJI.get(face, "🔲")
            color_name = COLOR_NAMES.get(face, face)
            kid_dir = KID_DIRECTION.get(step.direction, "")

            # Main instruction
            self._instruction_label.setText(
                f"Turn the {emoji} {color_name} side\n{kid_dir}"
            )
            self._cube_3d.set_highlight(face, step.direction)

            # Flat face view: show pre-move state so the kid sees
            # the face as it is BEFORE they turn it
            pre_state = self._states[idx - 1] if idx - 1 < len(self._states) else None
            self._flat_face.set_state(pre_state, face, step.direction)

            # Celebration on last step!
            if idx == total:
                self._instruction_label.setText("You did it!! 🎉🥳🏆")
                self._instruction_label.setStyleSheet(
                    "font-size: 28px; font-weight: bold; color: #a6e3a1; "
                    "padding: 12px; background-color: #313244; "
                    "border-radius: 12px;"
                )
                self._confetti.start()
            else:
                self._instruction_label.setStyleSheet(
                    "font-size: 24px; font-weight: bold; color: #cdd6f4; "
                    "padding: 12px; background-color: #313244; "
                    "border-radius: 12px;"
                )

        # 3D preview shows post-move state (the goal)
        if idx < len(self._states):
            self._cube_3d.set_cube(self._states[idx])

        # Progress stars
        filled = idx
        stars = "⭐" * filled + "☆" * (total - filled)
        self._progress_label.setText(stars)

        # Counter
        self._counter_label.setText(f"{idx} of {total} steps done")

        self._update_buttons()
        self.stepChanged.emit(idx)

    def _update_buttons(self) -> None:
        total = len(self._states) - 1 if self._states else 0
        self._btn_prev.setEnabled(self._current_step > 0)
        self._btn_next.setEnabled(self._current_step < total)

    def _go_prev(self) -> None:
        if self._current_step > 0:
            self._current_step -= 1
            self._update_display()

    def _go_next(self) -> None:
        total = len(self._states) - 1 if self._states else 0
        if self._current_step < total:
            self._current_step += 1
            self._update_display()
