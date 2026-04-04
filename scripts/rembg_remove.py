import sys
import io
import os

from rembg import remove, new_session
from PIL import Image


def _remove_bytes(data: bytes) -> bytes:
    model = os.getenv("REMBG_MODEL", "u2net_human_seg")
    try:
        session = new_session(model)
    except Exception:
        session = None
    alpha_matting = os.getenv("REMBG_ALPHA_MATTING", "1") != "0"
    fg = int(os.getenv("REMBG_FOREGROUND", "240"))
    bg = int(os.getenv("REMBG_BACKGROUND", "10"))
    erode = int(os.getenv("REMBG_ERODE", "10"))
    try:
        return remove(
            data,
            session=session,
            alpha_matting=alpha_matting,
            alpha_matting_foreground_threshold=fg,
            alpha_matting_background_threshold=bg,
            alpha_matting_erode_size=erode,
        )
    except Exception:
        # Try PIL decoding and remove on image object
        img = Image.open(io.BytesIO(data))
        return remove(
            img,
            session=session,
            alpha_matting=alpha_matting,
            alpha_matting_foreground_threshold=fg,
            alpha_matting_background_threshold=bg,
            alpha_matting_erode_size=erode,
        )


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: rembg_remove.py <input> <output>", file=sys.stderr)
        return 2

    in_path = sys.argv[1]
    out_path = sys.argv[2]

    with open(in_path, "rb") as f:
        data = f.read()

    out = _remove_bytes(data)

    if isinstance(out, bytes):
        with open(out_path, "wb") as f:
            f.write(out)
        return 0

    # Fallback: assume PIL Image
    out.save(out_path, "PNG")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
