"""Build the current platform's self-contained helper without editing source versions."""

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version")
    parser.add_argument("--repository", default="dziksu/synkinema")
    parser.add_argument("--commit", default="local")
    parser.add_argument("--output", type=Path, default=ROOT / "dist/local-helper")
    args = parser.parse_args()
    init = (ROOT / "apps/server/synkinema/__init__.py").read_text()
    source_version = re.search(r'__version__ = "([0-9.]+)"', init).group(1)
    version = args.version or source_version
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        parser.error("Use a stable product version")
    if not re.fullmatch(r"[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+", args.repository):
        parser.error("Use an owner/repository identity")
    system = {"Darwin": "darwin", "Linux": "linux"}.get(platform.system())
    arch = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "x64", "AMD64": "x64"}.get(platform.machine())
    if not system or not arch:
        parser.error("Build natively on macOS/Linux arm64/x64")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    artifact = f"synkinema-local-{system}-{arch}"
    with tempfile.TemporaryDirectory(prefix="synkinema-local-build-") as temporary:
        stage = Path(temporary)
        package = stage / "src/synkinema"
        shutil.copytree(ROOT / "apps/server/synkinema", package, ignore=shutil.ignore_patterns("__pycache__"))
        (package / "__init__.py").write_text(f'__version__ = "{version}"\n')
        launcher = package / "local_launcher.py"
        launcher.write_text(
            launcher.read_text().replace("ghcr.io/dziksu/synkinema:", f"ghcr.io/{args.repository.lower()}:")
        )
        command = [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--onefile",
            "--noupx",
            "--name",
            artifact,
            "--distpath",
            str(output),
            "--workpath",
            str(stage / "work"),
            "--specpath",
            str(stage),
            "--paths",
            str(package.parent),
            "--copy-metadata",
            "mcp",
            "--copy-metadata",
            "uvicorn",
        ]
        # The host owns only chat. Rendering/speech/database-domain modules remain in Docker.
        for module in (
            "synkinema.app",
            "synkinema.service",
            "synkinema.storage",
            "synkinema.agent_reference",
            "numpy",
            "PIL",
            "av",
            "faster_whisper",
            "supertonic",
            "onnxruntime",
            "tkinter",
            "pytest",
        ):
            command.extend(["--exclude-module", module])
        subprocess.run(
            [*command, str(ROOT / "scripts/local_entry.py")],
            check=True,
            cwd=stage,
            env={**os.environ, "PYINSTALLER_CONFIG_DIR": str(stage / "cache")},
        )
    binary = output / artifact
    binary.chmod(0o755)
    digest = hashlib.sha256(binary.read_bytes()).hexdigest()
    # Each matrix job contributes one manifest; the publisher merges all four.
    (output / f"{artifact}.sha256").write_text(f"{digest}  {artifact}\n")
    (output / f"{artifact}.json").write_text(
        json.dumps(
            {
                "version": version,
                "repository": args.repository,
                "commit": args.commit,
                "artifact": artifact,
                "sha256": digest,
            }
        )
        + "\n"
    )
    (output / "SHA256SUMS").write_text(f"{digest}  {artifact}\n")
    installer = (
        (ROOT / "scripts/local-install.sh")
        .read_text()
        .replace("__SYNKINEMA_VERSION__", version)
        .replace("__SYNKINEMA_REPOSITORY__", args.repository)
    )
    (output / "synkinema-local-install.sh").write_text(installer)
    (output / "synkinema-local-install.sh").chmod(0o755)
    # Confirm that the standalone runtime works from outside the checkout.
    env = {key: value for key, value in os.environ.items() if key not in ("PYTHONPATH", "PYTHONHOME")}
    with tempfile.TemporaryDirectory(prefix="synkinema-local-startup-") as directory:
        subprocess.run([str(binary), "--version"], cwd=directory, env=env, check=True)
        subprocess.run([str(binary), "--help"], cwd=directory, env=env, check=True, stdout=subprocess.DEVNULL)
    print(f"Built {binary} ({version}, SHA-256 {digest})")


if __name__ == "__main__":
    main()
