from __future__ import annotations

import sys
from PIL import Image

ALPHA_THRESHOLD = 12


def get_alpha_bounds(image: Image.Image) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    width, height = alpha.size
    data = alpha.load()

    min_x = width
    min_y = height
    max_x = -1
    max_y = -1

    for y in range(height):
        for x in range(width):
            if data[x, y] > ALPHA_THRESHOLD:
                if x < min_x:
                    min_x = x
                if y < min_y:
                    min_y = y
                if x > max_x:
                    max_x = x
                if y > max_y:
                    max_y = y

    if max_x < min_x or max_y < min_y:
        return None
    return (min_x, min_y, max_x + 1, max_y + 1)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: crop_world_cup.py <input> <output>", file=sys.stderr)
        return 1

    input_path, output_path = sys.argv[1], sys.argv[2]

    with Image.open(input_path) as image:
        working = image.convert("RGBA")
        bounds = get_alpha_bounds(working)
        if bounds:
            left, top, right, bottom = bounds
            trimmed = working.crop((left, top, right, bottom))
        else:
            trimmed = working

        width, height = trimmed.size
        cropped_height = min(height, 540)
        cropped = trimmed.crop((0, 0, width, cropped_height))

        target_height = 300
        resized_width = max(1, round(cropped.width * (target_height / cropped.height)))
        resized = cropped.resize((resized_width, target_height), Image.LANCZOS)
        resized.save(output_path, "WEBP", quality=100, method=6)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
