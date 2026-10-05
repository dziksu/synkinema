"""Publishing cannot mix native artifacts from different versions or commits."""

import hashlib
import importlib.util
import json
from pathlib import Path

import pytest
from packaging.requirements import Requirement

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("local_assets", ROOT / "scripts/package_local_assets.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def native_assets(directory, version="1.2.3", commit="a" * 40):
    for target in module.TARGETS:
        name = "synkinema-local-" + target
        binary = name.encode()
        digest = hashlib.sha256(binary).hexdigest()
        (directory / name).write_bytes(binary)
        (directory / f"{name}.sha256").write_text(f"{digest}  {name}\n")
        (directory / f"{name}.json").write_text(
            json.dumps(
                {
                    "version": version,
                    "repository": "dziksu/synkinema",
                    "commit": commit,
                    "artifact": name,
                    "sha256": digest,
                }
            )
        )
    (directory / "synkinema-local-install.sh").write_text(
        (ROOT / "scripts/local-install.sh")
        .read_text()
        .replace("__SYNKINEMA_VERSION__", version)
        .replace("__SYNKINEMA_REPOSITORY__", "dziksu/synkinema")
    )


def test_assembly_verifies_all_platforms_and_metadata(tmp_path):
    native_assets(tmp_path)
    module.assemble(tmp_path, "1.2.3", "dziksu/synkinema", "a" * 40)
    assert len((tmp_path / "SHA256SUMS").read_text().splitlines()) == 4
    assert json.loads((tmp_path / "local-helper.json").read_text())["commit"] == "a" * 40
    with pytest.raises(ValueError, match="identity"):
        module.assemble(tmp_path, "1.2.4", "dziksu/synkinema", "a" * 40)
    with pytest.raises(ValueError, match="identity"):
        module.assemble(tmp_path, "1.2.3", "dziksu/synkinema", "b" * 40)
    (tmp_path / "synkinema-local-linux-x64").write_bytes(b"tampered")
    with pytest.raises(ValueError, match="checksum"):
        module.assemble(tmp_path, "1.2.3", "dziksu/synkinema", "a" * 40)


def test_assembly_rejects_missing_binary_or_wrong_installer(tmp_path):
    native_assets(tmp_path)
    (tmp_path / "synkinema-local-install.sh").write_text("__SYNKINEMA_VERSION__")
    with pytest.raises(ValueError, match="Installer"):
        module.assemble(tmp_path, "1.2.3", "dziksu/synkinema", "a" * 40)
    (tmp_path / "synkinema-local-darwin-x64").unlink()
    with pytest.raises(FileNotFoundError):
        module.assemble(tmp_path, "1.2.3", "dziksu/synkinema", "a" * 40)


def test_helper_dependency_versions_match_engine_lock():
    def pinned(path):
        result = {}
        for line in path.read_text().splitlines():
            if not line or line.startswith("#"):
                continue
            requirement = Requirement(line)
            result[requirement.name.lower().replace("_", "-")] = str(requirement.specifier)
        return result

    engine, helper = pinned(ROOT / "requirements.txt"), pinned(ROOT / "requirements-local.txt")
    for name in engine.keys() & helper.keys():
        assert engine[name] == helper[name], name
    assert all(version.startswith("==") for version in helper.values())
