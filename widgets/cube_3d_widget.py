"""3D-like isometric cube visualization widget."""

from __future__ import annotations

import math
from typing import List, Optional, Tuple

from PyQt6.QtCore import Qt, QPointF, QRectF
from PyQt6.QtGui import (
    QColor, QPainter, QPen, QBrush, QPolygonF, QFont,
    QLinearGradient, QPainterPath,
)
from PyQt6.QtWidgets import QWidget, QSizePolicy

from styles import FACE_COLORS
from cube_model import CubeModel


class Cube3DWidget(QWidget):
    """Renders a 3D isometric view of a Rubik's Cube showing 3 visible faces.

    Visible faces are: U (top), F (front), R (right side).
    An arrow is drawn to indicate which face is being rotated and the direction.
    """

    SIZE = 300  # Widget size

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

        cell = 36  # Size of each cell in the isometric projection

        # Isometric projection vectors
        # Right direction (for R face / column)
        rx, ry = 0.866 * cell, 0.5 * cell  # cos(30), sin(30)
        # Left direction (for F face / column)
        lx, ly = -0.866 * cell, 0.5 * cell
        # Up direction
        ux, uy = 0, -cell

        # Origin: top-front-left corner of the cube
        ox = cx - 0.5 * (3 * rx + 3 * lx)
        oy = cy - 0.5 * (3 * uy) + 30

        def project(right: float, up: float, depth: float) -> QPointF:
            """Project cube coordinates to screen coordinates."""
            x = ox + right * rx + depth * lx + up * ux  # type: ignore
            y = oy + right * ry + depth * ly + up * uy  # type: ignore
            return QPointF(x, y)

        # Draw Top face (U) — row,col from back-left to front-right
        self._draw_face(
            painter, "U",
            lambda r, c: [
                project(c, 3, r),
                project(c + 1, 3, r),
                project(c + 1, 3, r + 1),
                project(c, 3, r + 1),
            ],
            darken=0,
        )

        # Draw Front face (F) — row from top to bottom, col from left to right
        self._draw_face(
            painter, "F",
            lambda r, c: [
                project(c, 3 - r, 3),
                project(c + 1, 3 - r, 3),
                project(c + 1, 3 - r - 1, 3),
                project(c, 3 - r - 1, 3),
            ],
            darken=25,
        )

        # Draw Right face (R) — row from top to bottom, col from front to back
        self._draw_face(
            painter, "R",
            lambda r, c: [
                project(3, 3 - r, 3 - c),
                project(3, 3 - r, 3 - c - 1),
                project(3, 3 - r - 1, 3 - c - 1),
                project(3, 3 - r - 1, 3 - c),
            ],
            darken=50,
        )

        # Draw move indicator arrow
        if self._highlight_face and self._highlight_direction:
            self._draw_arrow(painter, cx, cy)

        painter.end()

    def _draw_face(
        self,
        painter: QPainter,
        face: str,
        corner_fn,
        darken: int = 0,
    ) -> None:
        """Draw a 3x3 face using the corner function for projection."""
        if self._cube is None:
            return

        for row in range(3):
            for col in range(3):
                index = row * 3 + col
                color_key = self._cube.get_sticker(face, index)
                color = QColor(FACE_COLORS.get(color_key, "#888888"))
                if darken > 0:
                    color = color.darker(100 + darken)

                corners = corner_fn(row, col)
                polygon = QPolygonF(corners)

                # Highlight
                is_highlighted = (face == self._highlight_face)
                if is_highlighted:
                    color = color.lighter(140)

                painter.setBrush(QBrush(color))
                painter.setPen(QPen(QColor("#11111b"), 1.2))
                painter.drawPolygon(polygon)

    def _draw_arrow(self, painter: QPainter, cx: float, cy: float) -> None:
        """Draw a rotation arrow indicating the move direction."""
        face = self._highlight_face
        direction = self._highlight_direction

        if not face or not direction:
            return

        painter.setPen(QPen(QColor("#f9e2af"), 3))
        painter.setBrush(QBrush(QColor("#f9e2af")))

        font = QFont("Segoe UI", 11, QFont.Weight.Bold)
        painter.setFont(font)

        # Position and draw arrow symbol based on face
        arrow_map = {
            ("U", "cw"): "↻",
            ("U", "ccw"): "↺",
            ("U", "180"): "↻↻",
            ("D", "cw"): "↻",
            ("D", "ccw"): "↺",
            ("D", "180"): "↻↻",
            ("F", "cw"): "↻",
            ("F", "ccw"): "↺",
            ("F", "180"): "↻↻",
            ("B", "cw"): "↻",
            ("B", "ccw"): "↺",
            ("B", "180"): "↻↻",
            ("R", "cw"): "↻",
            ("R", "ccw"): "↺",
            ("R", "180"): "↻↻",
            ("L", "cw"): "↻",
            ("L", "ccw"): "↺",
            ("L", "180"): "↻↻",
        }

        symbol = arrow_map.get((face, direction), "↻")

        # Position arrow near the highlighted face
        positions = {
            "U": QPointF(cx, cy - 100),
            "F": QPointF(cx - 60, cy + 60),
            "R": QPointF(cx + 60, cy + 60),
            "D": QPointF(cx, cy + 100),
            "L": QPointF(cx - 100, cy),
            "B": QPointF(cx + 100, cy - 40),
        }

        pos = positions.get(face, QPointF(cx, cy - 100))
        font.setPointSize(22)
        painter.setFont(font)
        painter.drawText(
            QRectF(pos.x() - 30, pos.y() - 15, 60, 30),
            Qt.AlignmentFlag.AlignCenter,
            symbol,
        )
