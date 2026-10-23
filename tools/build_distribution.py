"""Build an owner-review archive from an explicit source allowlist; never include local data."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT_FILES = ("README.md", "CHANGELOG.md", "RELEASE_NOTES.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "requirements.txt", "requirements-dev.txt", "constraints.txt", ".env.example", "INSTALAR_PERSONAL_CHAT_AI.bat", "INICIAR_PERSONAL_CHAT_AI.bat", "VERIFICAR_PERSONAL_CHAT_AI.bat")
ROOT_FOLDER = "PERSONAL_CHAT_AI_v1.1.0"


def distribution_files(root):
    files = [root / name for name in ROOT_FILES]
    for folder, pattern in (("backend", "*.py"), ("extension", "*.js"), ("extension", "*.css"), ("extension", "manifest.json"), ("knowledge", "*.md")):
        files.extend(sorted((root / folder).glob(pattern)))
    # Historical technical Markdown is safe reference material; raw traces and
    # the local profile investigation containing workstation paths stay private.
    files.extend(sorted(p for p in (root / "docs").rglob("*.md") if p.name != "PROFILE_LOADING_2026_10_22.md"))
    for path in files:
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError(f"Unsafe or missing distribution source: {path.name}")
    return sorted(set(files))


def build(root, output):
    root, output = root.resolve(), output.resolve()
    if output.is_relative_to(root):
        raise ValueError("Distribution must be outside the source repository")
    output.parent.mkdir(parents=True, exist_ok=True)
    inventory = []
    # Exclusive creation preserves every earlier package.
    with ZipFile(output, "x", compression=ZIP_DEFLATED) as archive:
        for path in distribution_files(root):
            data = path.read_bytes()
            name = f"{ROOT_FOLDER}/{path.relative_to(root).as_posix()}"
            archive.writestr(name, data)
            inventory.append({"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    with ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError("Archive integrity check failed")
        assert archive.namelist() == [item["path"] for item in inventory]
        for item in inventory:
            assert hashlib.sha256(archive.read(item["path"])).hexdigest() == item["sha256"]
    report = {"file": output.name, "bytes": output.stat().st_size, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "approval": "pending validation; MIT authorized", "files": inventory}
    output.with_suffix(".inventory.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = build(Path(__file__).resolve().parent.parent, args.output)
    print(json.dumps({k: v for k, v in result.items() if k != "files"}, indent=2))
