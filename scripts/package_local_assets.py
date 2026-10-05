"""Verify all four native builds before assembling the installer's release manifest."""

import argparse
import hashlib
import json
from pathlib import Path

TARGETS = ("darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64")


def assemble(directory, version, repository, commit):
    checksums = []
    for target in TARGETS:
        name = f"synkinema-local-{target}"
        metadata = json.loads((directory / f"{name}.json").read_text())
        digest = hashlib.sha256((directory / name).read_bytes()).hexdigest()
        expected = {
            "version": version,
            "repository": repository,
            "commit": commit,
            "artifact": name,
            "sha256": digest,
        }
        if metadata != expected or (directory / f"{name}.sha256").read_text() != f"{digest}  {name}\n":
            raise ValueError(f"Release identity/checksum mismatch for {name}")
        checksums.append(f"{digest}  {name}\n")
    installer = (directory / "synkinema-local-install.sh").read_text()
    if (
        f"https://github.com/{repository}/releases/download/v" not in installer
        or f"SYNKINEMA_VERSION:-{version}" not in installer
        or "__SYNKINEMA_" in installer
    ):
        raise ValueError("Installer does not match the native builds")
    (directory / "SHA256SUMS").write_text("".join(checksums))
    (directory / "local-helper.json").write_text(
        json.dumps(
            {"version": version, "commit": commit, "repository": repository, "targets": TARGETS}, indent=2
        )
        + "\n"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--commit", required=True)
    args = parser.parse_args()
    assemble(args.directory, args.version, args.repository, args.commit)


if __name__ == "__main__":
    main()
