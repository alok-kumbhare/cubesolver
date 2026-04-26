"""Dark theme and styling constants for the Rubik's Cube Solver."""

from typing import Dict

# Face colors mapping (standard Rubik's Cube color scheme)
FACE_COLORS: Dict[str, str] = {
    "U": "#FFFFFF",  # White  (Up)
    "D": "#FFFF00",  # Yellow (Down)
    "F": "#00AA00",  # Green  (Front)
    "B": "#0000FF",  # Blue   (Back)
    "L": "#FF8800",  # Orange (Left)
    "R": "#FF0000",  # Red    (Right)
}

COLOR_NAMES: Dict[str, str] = {
    "U": "White",
    "D": "Yellow",
    "F": "Green",
    "B": "Blue",
    "L": "Orange",
    "R": "Red",
}

# Color picker palette order
PALETTE_ORDER = ["U", "R", "F", "D", "L", "B"]

# ── Kid-friendly constants ─────────────────────────────────────────

# Emoji for each face color (kid-mode palette and instructions)
# Uses distinct shapes/symbols so Yellow vs Orange is unambiguous
COLOR_EMOJI: Dict[str, str] = {
    "U": "⬜",   # White  — square
    "D": "💛",   # Yellow — heart (distinct from orange)
    "F": "🟩",   # Green  — square
    "B": "🟦",   # Blue   — square
    "L": "🔶",   # Orange — diamond (distinct from yellow)
    "R": "❤️",   # Red    — heart
}

# Simple face names for kids
KID_FACE_NAMES: Dict[str, str] = {
    "U": "TOP",
    "D": "BOTTOM",
    "F": "FRONT",
    "B": "BACK",
    "R": "RIGHT",
    "L": "LEFT",
}

# Kid-friendly direction words
KID_DIRECTION: Dict[str, str] = {
    "cw": "this way ➡️",
    "ccw": "this way ⬅️",
    "180": "all the way around 🔄",
}

# Face guide order for kid step-by-step input
KID_FACE_GUIDE_ORDER = ["U", "F", "R", "D", "L", "B"]

# Kid-friendly face guide prompts (with hold instructions)
KID_FACE_GUIDE_PROMPTS: Dict[str, str] = {
    "U": "☝️ Keep 🟦 Blue on top",
    "F": "☝️ Keep ⬜ White on top",
    "R": "☝️ Keep ⬜ White on top",
    "D": "☝️ Keep 🟩 Green on top",
    "L": "☝️ Keep ⬜ White on top",
    "B": "Last one! ☝️ Keep ⬜ White on top",
}

# Physical cube holding orientation for each face move
# "facing" = the face looking at you, "above" = the face on top
KID_HOLD_ORIENTATION: Dict[str, Dict[str, str]] = {
    "U": {"facing": "U", "above": "B"},
    "D": {"facing": "D", "above": "F"},
    "F": {"facing": "F", "above": "U"},
    "B": {"facing": "B", "above": "U"},
    "R": {"facing": "R", "above": "U"},
    "L": {"facing": "L", "above": "U"},
}

# Dark theme stylesheet
DARK_THEME = """
QMainWindow {
    background-color: #1e1e2e;
}
QWidget {
    background-color: #1e1e2e;
    color: #cdd6f4;
    font-family: 'Segoe UI', sans-serif;
    font-size: 13px;
}
QPushButton {
    background-color: #313244;
    color: #cdd6f4;
    border: 1px solid #45475a;
    border-radius: 6px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: bold;
}
QPushButton:hover {
    background-color: #45475a;
    border-color: #89b4fa;
}
QPushButton:pressed {
    background-color: #585b70;
}
QPushButton:disabled {
    background-color: #1e1e2e;
    color: #585b70;
    border-color: #313244;
}
QPushButton#solveButton {
    background-color: #89b4fa;
    color: #1e1e2e;
    font-size: 15px;
    padding: 10px 24px;
}
QPushButton#solveButton:hover {
    background-color: #b4d0fb;
}
QPushButton#solveButton:disabled {
    background-color: #45475a;
    color: #585b70;
}
QPushButton#resetButton {
    background-color: #f38ba8;
    color: #1e1e2e;
}
QPushButton#resetButton:hover {
    background-color: #f5a0b8;
}
QLabel {
    color: #cdd6f4;
    background-color: transparent;
}
QLabel#title {
    font-size: 22px;
    font-weight: bold;
    color: #89b4fa;
}
QLabel#subtitle {
    font-size: 13px;
    color: #a6adc8;
}
QLabel#stepLabel {
    font-size: 16px;
    font-weight: bold;
    color: #f9e2af;
}
QLabel#moveNotation {
    font-size: 20px;
    font-weight: bold;
    color: #a6e3a1;
    font-family: 'Consolas', 'Courier New', monospace;
}
QLabel#statusLabel {
    font-size: 12px;
    color: #a6adc8;
    padding: 4px;
}
QFrame#separator {
    background-color: #45475a;
    max-height: 1px;
}
QScrollArea {
    border: none;
    background-color: transparent;
}
QGroupBox {
    border: 1px solid #45475a;
    border-radius: 8px;
    margin-top: 12px;
    padding-top: 18px;
    font-weight: bold;
    color: #89b4fa;
}
QGroupBox::title {
    subcontrol-origin: margin;
    left: 12px;
    padding: 0 6px;
}
"""
