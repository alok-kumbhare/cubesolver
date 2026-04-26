"""Step-by-step instruction viewer widget."""

from __future__ import annotations

from typing import List, Optional

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QScrollArea, QFrame, QSizePolicy,
)

from cube_model import CubeModel
from move_parser import SolveStep
from widgets.cube_3d_widget import Cube3DWidget


class StepViewerWidget(QWidget):
    """Displays the step-by-step solution with 3D cube visualization."""

    stepChanged = pyqtSignal(int)  # Emits current step index

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._steps: List[SolveStep] = []
        self._states: List[CubeModel] = []
        self._current_step: int = 0

        self._setup_ui()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setSpacing(12)

        # Title
        title = QLabel("Solution Steps")
        title.setObjectName("title")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(title)

        # 3D Cube visualization
        self._cube_3d = Cube3DWidget()
        cube_container = QHBoxLayout()
        cube_container.addStretch()
        cube_container.addWidget(self._cube_3d)
        cube_container.addStretch()
        layout.addLayout(cube_container)

        # Step info
        self._step_label = QLabel("No solution yet")
        self._step_label.setObjectName("stepLabel")
        self._step_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self._step_label)

        # Move notation display
        self._move_label = QLabel("")
        self._move_label.setObjectName("moveNotation")
        self._move_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self._move_label)

        # Description
        self._desc_label = QLabel("")
        self._desc_label.setObjectName("subtitle")
        self._desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._desc_label.setWordWrap(True)
        layout.addWidget(self._desc_label)

        # Full solution display
        self._full_solution_label = QLabel("")
        self._full_solution_label.setObjectName("subtitle")
        self._full_solution_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._full_solution_label.setWordWrap(True)
        layout.addWidget(self._full_solution_label)

        # Separator
        sep = QFrame()
        sep.setObjectName("separator")
        sep.setFrameShape(QFrame.Shape.HLine)
        layout.addWidget(sep)

        # Navigation buttons
        nav_layout = QHBoxLayout()
        nav_layout.setSpacing(10)

        self._btn_first = QPushButton("⏮ First")
        self._btn_prev = QPushButton("◀ Prev")
        self._btn_next = QPushButton("Next ▶")
        self._btn_last = QPushButton("Last ⏭")

        for btn in [self._btn_first, self._btn_prev, self._btn_next, self._btn_last]:
            btn.setMinimumWidth(80)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)

        self._btn_first.clicked.connect(self._go_first)
        self._btn_prev.clicked.connect(self._go_prev)
        self._btn_next.clicked.connect(self._go_next)
        self._btn_last.clicked.connect(self._go_last)

        nav_layout.addStretch()
        nav_layout.addWidget(self._btn_first)
        nav_layout.addWidget(self._btn_prev)
        nav_layout.addWidget(self._btn_next)
        nav_layout.addWidget(self._btn_last)
        nav_layout.addStretch()
        layout.addLayout(nav_layout)

        # Step list (scrollable)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll_content = QWidget()
        self._step_list_layout = QVBoxLayout(scroll_content)
        self._step_list_layout.setSpacing(4)
        self._step_list_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        scroll.setWidget(scroll_content)
        layout.addWidget(scroll, stretch=1)

        self._update_buttons()

    def set_solution(
        self, steps: List[SolveStep], states: List[CubeModel]
    ) -> None:
        """Load a new solution to display."""
        self._steps = steps
        self._states = states
        self._current_step = 0

        # Build full solution text
        if steps:
            moves = " ".join(s.move_notation for s in steps)
            self._full_solution_label.setText(f"Full solution: {moves}")
        else:
            self._full_solution_label.setText("")

        # Populate step list
        self._clear_step_list()
        for step in steps:
            lbl = QLabel(
                f"  {step.step_number}. {step.move_notation}  —  {step.description}"
            )
            lbl.setObjectName("subtitle")
            lbl.setStyleSheet("padding: 2px 8px;")
            self._step_list_layout.addWidget(lbl)

        self._update_display()

    def clear(self) -> None:
        """Clear the solution display."""
        self._steps = []
        self._states = []
        self._current_step = 0
        self._step_label.setText("No solution yet")
        self._move_label.setText("")
        self._desc_label.setText("")
        self._full_solution_label.setText("")
        self._cube_3d.set_cube(CubeModel())
        self._cube_3d.clear_highlight()
        self._clear_step_list()
        self._update_buttons()

    def _clear_step_list(self) -> None:
        while self._step_list_layout.count():
            item = self._step_list_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

    def _update_display(self) -> None:
        if not self._steps:
            self._step_label.setText("Cube is already solved! 🎉")
            self._move_label.setText("")
            self._desc_label.setText("")
            self._cube_3d.clear_highlight()
            self._update_buttons()
            return

        idx = self._current_step

        if idx == 0:
            # Show initial state
            self._step_label.setText("Initial State")
            self._move_label.setText("—")
            self._desc_label.setText("This is your cube before solving.")
            self._cube_3d.clear_highlight()
        else:
            step = self._steps[idx - 1]
            self._step_label.setText(
                f"Step {step.step_number} of {step.total_steps}"
            )
            self._move_label.setText(step.move_notation)
            self._desc_label.setText(step.description)
            self._cube_3d.set_highlight(step.face, step.direction)

        if idx < len(self._states):
            self._cube_3d.set_cube(self._states[idx])

        # Highlight current step in list
        for i in range(self._step_list_layout.count()):
            item = self._step_list_layout.itemAt(i)
            if item and item.widget():
                w = item.widget()
                if i == idx - 1:
                    w.setStyleSheet(
                        "padding: 2px 8px; background-color: #313244; "
                        "border-radius: 4px; color: #f9e2af; font-weight: bold;"
                    )
                else:
                    w.setStyleSheet("padding: 2px 8px;")

        self._update_buttons()
        self.stepChanged.emit(idx)

    def _update_buttons(self) -> None:
        has_steps = len(self._steps) > 0
        total = len(self._states) - 1 if self._states else 0
        self._btn_first.setEnabled(has_steps and self._current_step > 0)
        self._btn_prev.setEnabled(has_steps and self._current_step > 0)
        self._btn_next.setEnabled(has_steps and self._current_step < total)
        self._btn_last.setEnabled(has_steps and self._current_step < total)

    def _go_first(self) -> None:
        self._current_step = 0
        self._update_display()

    def _go_prev(self) -> None:
        if self._current_step > 0:
            self._current_step -= 1
            self._update_display()

    def _go_next(self) -> None:
        total = len(self._states) - 1 if self._states else 0
        if self._current_step < total:
            self._current_step += 1
            self._update_display()

    def _go_last(self) -> None:
        total = len(self._states) - 1 if self._states else 0
        self._current_step = total
        self._update_display()
