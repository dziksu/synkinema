"""Stamp a release image's Python version; never commit the build-time mutation."""

import argparse
import re
from pathlib import Path


def stamp(root: Path, version: str):
    if not re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", version):
        raise ValueError("A stable semantic version is required")
    path = root / "apps/server/synkinema/__init__.py"
    value, count = re.subn(
        r'^__version__ = "[^"\n]+"$', f'__version__ = "{version}"', path.read_text(), flags=re.MULTILINE
    )
    if count != 1:
        raise ValueError("Expected one canonical Python version")
    path.write_text(value)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    stamp(args.root, args.version)
