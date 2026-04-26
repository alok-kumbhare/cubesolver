"""Interactive 2D cube net widget for color input."""

from __future__ import annotations

from typing import Optional

from PyQt6.QtCore import Qt, pyqtSignal, QRectF
from PyQt6.QtGui import QColor, QPainter, QPen, QBrush, QMouseEvent, QFont
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLabel, QSizePolicy

from styles import FACE_COLORS, COLOR_NAMES, PALETTE_ORDER
from cube_model import CubeModel


class CubeNetWidget(QWidget):
    """Displays an interactive 2D unfolded cube net for color input.

    The net layout is:
            [U]
        [L] [F] [R] [B]
            [D]
    """

    cubeChanged = pyqtSignal()  # Emitted whenever a sticker changes

    # Cell size in pixels
    CELL_SIZE = 42
    CELL_GAP = 2
    MARGIN = 10

    def __init__(self, cube: CubeModel, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.cube = cube
        self.selected_color: str = "R"  # Current paint color

        # Face positions in the net grid (column, row) — each face is 3x3
        # Grid is 4 faces wide, 3 faces tall
        self._face_positions = {
            "U": (1, 0),
            "L": (0, 1),
            "F": (1, 1),
            "R": (2, 1),
            "B": (3, 1),
            "D": (1, 2),
        }

        total_w = self.MARGIN * 2 + 4 * 3 * (self.CELL_SIZE + self.CELL_GAP)
        total_h = self.MARGIN * 2 + 3 * 3 * (self.CELL_SIZE + self.CELL_GAP)
        self.setMinimumSize(total_w, total_h)
        self.setMaximumSize(total_w + 20, total_h + 20)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.setMouseTracking(True)

        self._hover_cell: Optional[tuple[str, int]] = None

    def set_color(self, color_key: str) -> None:
        """Set the active painting color."""
        self.selected_color = color_key
        self.update()

    def _cell_rect(self, face: str, index: int) -> QRectF:
        """Return the rectangle for a sticker cell."""
        fx, fy = self._face_positions[face]
        row, col = divmod(index, 3)
        # Swap row and col since index is row-major
        row, col = index // 3, index % 3
        x = self.MARGIN + (fx * 3 + col) * (self.CELL_SIZE + self.CELL_GAP)
        y = self.MARGIN + (fy * 3 + row) * (self.CELL_SIZE + self.CELL_GAP)
        return QRectF(x, y, self.CELL_SIZE, self.CELL_SIZE)

    def _hit_test(self, x: float, y: float) -> Optional[tuple[str, int]]:
        """Return (face, index) if the point hits a sticker cell, else None."""
        for face in self._face_positions:
            for i in range(9):
                rect = self._cell_rect(face, i)
                if rect.contains(x, y):
                    return (face, i)
        return None

    def paintEvent(self, event) -> None:  # type: ignore[override]
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Draw each face
        for face in self._face_positions:
            for i in range(9):
                rect = self._cell_rect(face, i)
                color_key = self.cube.get_sticker(face, i)
                color = QColor(FACE_COLORS.get(color_key, "#888888"))

                # Hover highlight
                if self._hover_cell == (face, i):
                    color = color.lighter(130)

                painter.setBrush(QBrush(color))

                # Border
                is_center = (i == 4)
                if is_center:
                    pen = QPen(QColor("#cdd6f4"), 2.5)
                else:
                    pen = QPen(QColor("#11111b"), 1.5)
                painter.setPen(pen)

                painter.drawRoundedRect(rect, 4, 4)

                # Draw face label on center cell
                if is_center:
                    painter.setPen(QPen(QColor("#11111b")))
                    font = QFont("Segoe UI", 11, QFont.Weight.Bold)
                    painter.setFont(font)
                    painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, face)

        # Draw face labels above/beside each face
        painter.setPen(QPen(QColor("#6c7086")))
        font = QFont("Segoe UI", 9)
        painter.setFont(font)
        for face, (fx, fy) in self._face_positions.items():
            label_x = self.MARGIN + fx * 3 * (self.CELL_SIZE + self.CELL_GAP)
            label_y = self.MARGIN + fy * 3 * (self.CELL_SIZE + self.CELL_GAP) - 4
            if label_y > self.MARGIN:
                painter.drawText(int(label_x), int(label_y), COLOR_NAMES.get(face, face))

        painter.end()

    def mousePressEvent(self, event: QMouseEvent) -> None:  # type: ignore[override]
        if event.button() == Qt.MouseButton.LeftButton:
            pos = event.position()
            hit = self._hit_test(pos.x(), pos.y())
            if hit:
                face, index = hit
                # Don't allow changing center stickers
                if index == 4:
                    return
                self.cube.set_sticker(face, index, self.selected_color)
                self.cubeChanged.emit()
                self.update()

    def mouseMoveEvent(self, event: QMouseEvent) -> None:  # type: ignore[override]
        pos = event.position()
        hit = self._hit_test(pos.x(), pos.y())
        if hit != self._hover_cell:
            self._hover_cell = hit
            self.update()

    def leaveEvent(self, event) -> None:  # type: ignore[override]
        self._hover_cell = None
        self.update()


class ColorPaletteWidget(QWidget):
    """Color selector palette for painting cube stickers."""

    colorSelected = pyqtSignal(str)  # Emits color key

    SWATCH_SIZE = 36

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._selected: str = "R"
        self.setMinimumHeight(self.SWATCH_SIZE + 30)
        self.setMaximumHeight(self.SWATCH_SIZE + 30)
        self.setMouseTracking(True)
        self._hover_index: int = -1

    def _swatch_rect(self, index: int) -> QRectF:
        total_width = len(PALETTE_ORDER) * (self.SWATCH_SIZE + 8) - 8
        start_x = (self.width() - total_width) / 2
        x = start_x + index * (self.SWATCH_SIZE + 8)
        y = 4.0
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
                pen = QPen(QColor("#cdd6f4"), 3)
            else:
                pen = QPen(QColor("#45475a"), 1.5)
            painter.setPen(pen)
            painter.drawRoundedRect(rect, 6, 6)

            # Label
            painter.setPen(QPen(QColor("#11111b")))
            font = QFont("Segoe UI", 8, QFont.Weight.Bold)
            painter.setFont(font)
            painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, COLOR_NAMES[key])

        painter.end()

    def mousePressEvent(self, event: QMouseEvent) -> None:  # type: ignore[override]
        if event.button() == Qt.MouseButton.LeftButton:
            pos = event.position()
            for i, key in enumerate(PALETTE_ORDER):
                if self._swatch_rect(i).contains(pos.x(), pos.y()):
                    self._selected = key
                    self.colorSelected.emit(key)
                    self.update()
                    break

    def mouseMoveEvent(self, event: QMouseEvent) -> None:  # type: ignore[override]
        pos = event.position()
        self._hover_index = -1
        for i, key in enumerate(PALETTE_ORDER):
            if self._swatch_rect(i).contains(pos.x(), pos.y()):
                self._hover_index = i
                break
        self.update()

    def leaveEvent(self, event) -> None:  # type: ignore[override]
        self._hover_index = -1
        self.update()
