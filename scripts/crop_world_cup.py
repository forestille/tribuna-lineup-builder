from __future__ import annotations

import sys
from PIL import Image


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: crop_world_cup.py <input> <output>", file=sys.stderr)
        return 1

    input_path, output_path = sys.argv[1], sys.argv[2]

    with Image.open(input_path) as image:
      width, height = image.size
      crop_height = max(1, int(height * 0.42))
      cropped = image.crop((0, 0, width, crop_height))
      cropped.save(output_path, "PNG")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
