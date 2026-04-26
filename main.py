"""Rubik's Cube Solver — Main Application Entry Point."""

from __future__ import annotations

import sys

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont, QIcon
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QHBoxLayout, QVBoxLayout,
    QLabel, QPushButton, QMessageBox, QFrame, QSizePolicy, QGroupBox,
    QStackedWidget,
)

from cube_model import CubeModel
from solver import solve_cube, get_intermediate_states, SolverError
from styles import DARK_THEME
from widgets.cube_net_widget import CubeNetWidget, ColorPaletteWidget
from widgets.step_viewer_widget import StepViewerWidget
from widgets.kid_widgets import (
    KidColorPaletteWidget, KidCubeNetWidget, KidStepViewerWidget,
)


class MainWindow(QMainWindow):
    """Main application window for the Rubik's Cube Solver."""

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Rubik's Cube Solver")
        self.setMinimumSize(1100, 780)
        self.resize(1200, 820)

        self._cube = CubeModel()
        self._kid_mode = False
        self._setup_ui()

    def _setup_ui(self) -> None:
        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        root.setContentsMargins(16, 10, 16, 16)
        root.setSpacing(8)

        # ── Top bar: title + mode toggle ─────────────────────
        top_bar = QHBoxLayout()

        title = QLabel("🧊  Rubik's Cube Solver")
        title.setObjectName("title")
        top_bar.addWidget(title)

        top_bar.addStretch()

        self._mode_btn = QPushButton("🧒 Kid Mode")
        self._mode_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._mode_btn.setStyleSheet(
            "font-size: 15px; padding: 8px 18px; font-weight: bold; "
            "background-color: #cba6f7; color: #1e1e2e; border-radius: 8px;"
        )
        self._mode_btn.clicked.connect(self._toggle_mode)
        top_bar.addWidget(self._mode_btn)

        root.addLayout(top_bar)

        # ── Main content area ────────────────────────────────
        main_layout = QHBoxLayout()
        main_layout.setSpacing(16)

        # === Expert left panel ===
        self._expert_left = QWidget()
        expert_left_layout = QVBoxLayout(self._expert_left)
        expert_left_layout.setSpacing(12)

        subtitle = QLabel(
            "Click a color below, then click the stickers on the cube net."
        )
        subtitle.setObjectName("subtitle")
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        subtitle.setWordWrap(True)
        expert_left_layout.addWidget(subtitle)

        palette_group = QGroupBox("Select Color")
        palette_layout = QVBoxLayout()
        self._palette = ColorPaletteWidget()
        palette_layout.addWidget(self._palette)
        palette_group.setLayout(palette_layout)
        expert_left_layout.addWidget(palette_group)

        net_group = QGroupBox("Cube Configuration")
        net_layout = QVBoxLayout()
        self._cube_net = CubeNetWidget(self._cube)
        net_layout.addWidget(
            self._cube_net, alignment=Qt.AlignmentFlag.AlignCenter
        )
        hint = QLabel("Center stickers are fixed and define each face's color.")
        hint.setObjectName("subtitle")
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        net_layout.addWidget(hint)
        net_group.setLayout(net_layout)
        expert_left_layout.addWidget(net_group)

        expert_left_layout.addStretch()
        self._expert_left.setMaximumWidth(560)

        # === Kid left panel ===
        self._kid_left = QWidget()
        kid_left_layout = QVBoxLayout(self._kid_left)
        kid_left_layout.setSpacing(8)

        kid_subtitle = QLabel("Pick a color circle, then tap the squares! 🎨")
        kid_subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        kid_subtitle.setWordWrap(True)
        kid_subtitle.setStyleSheet(
            "font-size: 17px; color: #cdd6f4; font-weight: bold;"
        )
        kid_left_layout.addWidget(kid_subtitle)

        self._kid_palette = KidColorPaletteWidget()
        kid_left_layout.addWidget(self._kid_palette)

        self._kid_cube_net = KidCubeNetWidget(self._cube)
        kid_left_layout.addWidget(self._kid_cube_net)

        kid_left_layout.addStretch()
        self._kid_left.setMaximumWidth(560)

        # Left stacked widget (expert=0, kid=1)
        self._left_stack = QStackedWidget()
        self._left_stack.addWidget(self._expert_left)
        self._left_stack.addWidget(self._kid_left)
        self._left_stack.setSizePolicy(
            QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Preferred
        )
        self._left_stack.setMaximumWidth(560)

        # === Shared buttons + status ===
        btn_panel = QVBoxLayout()
        btn_row = QHBoxLayout()
        btn_row.setSpacing(12)

        self._reset_btn = QPushButton("🔄  Reset")
        self._reset_btn.setObjectName("resetButton")
        self._reset_btn.setCursor(Qt.CursorShape.PointingHandCursor)

        self._solve_btn = QPushButton("🔍  Solve Cube")
        self._solve_btn.setObjectName("solveButton")
        self._solve_btn.setCursor(Qt.CursorShape.PointingHandCursor)

        btn_row.addWidget(self._reset_btn)
        btn_row.addWidget(self._solve_btn)
        btn_panel.addLayout(btn_row)

        self._status_label = QLabel("Paint your cube, then press Solve!")
        self._status_label.setObjectName("statusLabel")
        self._status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        btn_panel.addWidget(self._status_label)

        # Left column = stacked panels + buttons
        left_column = QVBoxLayout()
        left_column.addWidget(self._left_stack)
        left_column.addLayout(btn_panel)

        left_container = QWidget()
        left_container.setLayout(left_column)
        left_container.setSizePolicy(
            QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Preferred
        )
        left_container.setMaximumWidth(580)

        # === Right panel (stacked: expert=0, kid=1) ===
        self._step_viewer = StepViewerWidget()
        self._kid_step_viewer = KidStepViewerWidget()

        self._right_stack = QStackedWidget()
        self._right_stack.addWidget(self._step_viewer)
        self._right_stack.addWidget(self._kid_step_viewer)

        # Separator
        separator = QFrame()
        separator.setFrameShape(QFrame.Shape.VLine)
        separator.setObjectName("separator")
        separator.setFixedWidth(1)

        main_layout.addWidget(left_container)
        main_layout.addWidget(separator)
        main_layout.addWidget(self._right_stack, stretch=1)

        root.addLayout(main_layout, stretch=1)

        # ── Connections ──────────────────────────────────────
        self._palette.colorSelected.connect(self._cube_net.set_color)
        self._kid_palette.colorSelected.connect(self._kid_cube_net.set_color)
        self._solve_btn.clicked.connect(self._on_solve)
        self._reset_btn.clicked.connect(self._on_reset)

    # ── Mode toggle ──────────────────────────────────────────
    def _toggle_mode(self) -> None:
        """Switch between Expert and Kid modes."""
        self._kid_mode = not self._kid_mode
        if self._kid_mode:
            self._left_stack.setCurrentIndex(1)
            self._right_stack.setCurrentIndex(1)
            self._mode_btn.setText("👤 Expert Mode")
            self._mode_btn.setStyleSheet(
                "font-size: 15px; padding: 8px 18px; font-weight: bold; "
                "background-color: #89b4fa; color: #1e1e2e; border-radius: 8px;"
            )
            self._solve_btn.setStyleSheet(
                "font-size: 20px; padding: 14px 28px; font-weight: bold; "
                "background-color: #a6e3a1; color: #1e1e2e; border-radius: 12px;"
            )
            self._reset_btn.setStyleSheet(
                "font-size: 20px; padding: 14px 28px; font-weight: bold; "
                "background-color: #f38ba8; color: #1e1e2e; border-radius: 12px;"
            )
            self._solve_btn.setText("✨ Solve It! ✨")
            self._reset_btn.setText("🔄 Start Over")
            self._status_label.setStyleSheet(
                "font-size: 16px; color: #a6adc8; font-weight: bold;"
            )
        else:
            self._left_stack.setCurrentIndex(0)
            self._right_stack.setCurrentIndex(0)
            self._mode_btn.setText("🧒 Kid Mode")
            self._mode_btn.setStyleSheet(
                "font-size: 15px; padding: 8px 18px; font-weight: bold; "
                "background-color: #cba6f7; color: #1e1e2e; border-radius: 8px;"
            )
            self._solve_btn.setStyleSheet("")
            self._solve_btn.setObjectName("solveButton")
            self._reset_btn.setStyleSheet("")
            self._reset_btn.setObjectName("resetButton")
            self._solve_btn.setText("🔍  Solve Cube")
            self._reset_btn.setText("🔄  Reset")
            self._status_label.setStyleSheet("")

    def _on_solve(self) -> None:
        """Validate and solve the cube."""
        self._status_label.setText("Solving... 🤔")
        self._status_label.setStyleSheet("color: #89b4fa; font-size: 16px;")
        QApplication.processEvents()

        try:
            steps = solve_cube(self._cube)
            states = get_intermediate_states(self._cube, steps)

            if not steps:
                self._status_label.setText("Already solved! ✅🎉")
                self._status_label.setStyleSheet("color: #a6e3a1;")
                self._step_viewer.clear()
                self._kid_step_viewer.clear()
            else:
                n = len(steps)
                self._status_label.setText(
                    f"Solved in {n} moves! Follow the steps! ✅"
                )
                self._status_label.setStyleSheet("color: #a6e3a1;")
                self._step_viewer.set_solution(steps, states)
                self._kid_step_viewer.set_solution(steps, states)

        except SolverError as e:
            self._status_label.setText(f"❌ {e}")
            self._status_label.setStyleSheet("color: #f38ba8;")
            QMessageBox.warning(self, "Oops!", str(e))

    def _on_reset(self) -> None:
        """Reset the cube to solved state."""
        self._cube.reset()
        self._cube_net.update()
        self._kid_cube_net._canvas.update()
        self._kid_cube_net._update_face_display()
        self._step_viewer.clear()
        self._kid_step_viewer.clear()
        if self._kid_mode:
            self._status_label.setText("Let's go! Paint your cube! 🎨")
        else:
            self._status_label.setText(
                "Cube reset. Paint your cube and press Solve!"
            )
        self._status_label.setStyleSheet("color: #a6adc8;")


def main() -> None:
    """Application entry point."""
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    app.setStyleSheet(DARK_THEME)

    window = MainWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
