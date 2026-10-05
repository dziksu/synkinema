"""Restore the host environment when a frozen helper starts native programs."""

import os
import sys


def external_environment():
    env = {key: value for key, value in os.environ.items() if not key.startswith("_PYI_")}
    if getattr(sys, "frozen", False):
        for key in ("LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH"):
            if key + "_ORIG" in env:
                env[key] = env.pop(key + "_ORIG")
            else:
                env.pop(key, None)
        env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    return env
