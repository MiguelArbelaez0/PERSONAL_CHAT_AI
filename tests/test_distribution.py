"""Distribution must never select private/local state or overwrite a release."""
import zipfile
import pytest
from tools.build_distribution import DISTRIBUTION_DOCS, ROOT_FILES, build, distribution_files


def fixture_tree(tmp_path):
    root = tmp_path / "source"
    root.mkdir()
    for name in ROOT_FILES:
        (root / name).write_text("synthetic example", encoding="utf-8")
    for folder in ("backend", "extension", "knowledge", "docs"):
        (root / folder).mkdir()
    for name in ("backend/main.py", "extension/content.js", "knowledge/perfil.md"):
        (root / name).write_text("synthetic", encoding="utf-8")
    (root / "extension/manifest.json").write_text('{"manifest_version":3,"version":"1.2.0"}', encoding="utf-8")
    for name in DISTRIBUTION_DOCS:
        (root / "docs" / name).write_text("synthetic public documentation", encoding="utf-8")
    for name in (".env", "data/memory.sqlite3", "knowledge/local/perfil.md", "backend/__pycache__/cache.pyc", "docs/private.json", "docs/PROFILE_LOADING_2026_10_22.md"):
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("PRIVATE_SENTINEL", encoding="utf-8")
    return root


def test_archive_allowlist_excludes_local_data_and_preserves_previous_release(tmp_path):
    root = fixture_tree(tmp_path)
    output = tmp_path / "distribution" / "PERSONAL_CHAT_AI_v1.2.0.zip"
    report = build(root, output)
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert all(name.startswith("PERSONAL_CHAT_AI_v1.2.0/") for name in archive.namelist())
        assert all(b"PRIVATE_SENTINEL" not in archive.read(name) for name in archive.namelist())
        assert not any("PROFILE_LOADING" in name or "RC1_REAL_CASES" in name for name in archive.namelist())
        assert len(archive.namelist()) == len(report["files"])
    original = output.read_bytes()
    with pytest.raises(FileExistsError):
        build(root, output)
    assert output.read_bytes() == original


def test_distribution_rejects_output_inside_repository(tmp_path):
    root = fixture_tree(tmp_path)
    with pytest.raises(ValueError, match="outside"):
        build(root, root / "release.zip")


def test_distribution_requires_every_essential_source(tmp_path):
    root = fixture_tree(tmp_path)
    (root / "requirements.txt").unlink()
    with pytest.raises(ValueError, match="missing"):
        distribution_files(root)
