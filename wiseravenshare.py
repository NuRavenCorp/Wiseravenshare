"""
Compatibility shim for lowercase namespace imports.

Provides a virtual `wiseravenshare` package that aliases the tracked top-level
`server` package in this repository.
"""

import importlib
import pathlib
import sys

_server_pkg = importlib.import_module("server")

# Mark this module as package-like so submodule imports are valid.
__path__ = [str(pathlib.Path(__file__).parent.resolve())]

# Register alias mapping for nested imports:
#   wiseravenshare.server -> server
sys.modules.setdefault("wiseravenshare.server", _server_pkg)
