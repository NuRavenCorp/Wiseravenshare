"""
chat/state.py — shared mutable state for the chat layer.

Populated during app lifespan startup; read by the router via late import.
"""
from __future__ import annotations

_chat_state: dict = {}
