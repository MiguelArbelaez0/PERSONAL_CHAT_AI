from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules


spec_dir = Path(SPECPATH).resolve()
project_root = spec_dir.parents[1]

analysis = Analysis(
    [str(project_root / "backend" / "__main__.py")],
    pathex=[str(project_root)],
    binaries=[],
    datas=collect_data_files("certifi"),
    hiddenimports=collect_submodules("backend") + collect_submodules("uvicorn"),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "tests"],
    noarchive=False,
    optimize=1,
)
archive = PYZ(analysis.pure)

executable = EXE(
    archive,
    analysis.scripts,
    [],
    name="personal-chat-ai-backend",
    exclude_binaries=True,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
)

COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    name="personal-chat-ai-backend",
)
