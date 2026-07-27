from __future__ import annotations

from pathlib import Path
import sys

from PIL import Image


def convert_world_cup_images(root: Path) -> int:
    if not root.exists():
        return 0

    for png_path in root.rglob("*.png"):
        webp_path = png_path.with_suffix(".webp")
        with Image.open(png_path) as image:
            image.save(webp_path, "WEBP", quality=100, method=6)
        png_path.unlink()

    return 0


def rewrite_world_cup_csvs(root: Path) -> int:
    teams_dir = root / "data" / "world-cup" / "teams"
    if not teams_dir.exists():
        return 0

    for csv_path in teams_dir.glob("*.csv"):
        content = csv_path.read_text(encoding="utf-8")
        updated = content.replace(".png", ".webp")
        if updated != content:
            csv_path.write_text(updated, encoding="utf-8")

    return 0


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: convert_world_cup_webp.py <repo-root>", file=sys.stderr)
        return 1

    repo_root = Path(sys.argv[1]).resolve()
    convert_world_cup_images(repo_root / "public" / "img" / "players-world-cup")
    rewrite_world_cup_csvs(repo_root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
