import sys
import io
import json
import os
import traceback

from rembg import remove, new_session
from PIL import Image, ImageOps


def _new_session():
    return new_session(os.getenv("REMBG_MODEL", "u2net_human_seg"))


def _prepare_input(data: bytes, max_input_size: int):
    if max_input_size <= 0:
        return data

    image = Image.open(io.BytesIO(data))
    image = ImageOps.exif_transpose(image)
    image.load()
    if max(image.size) > max_input_size:
        resampling = getattr(Image, "Resampling", Image).LANCZOS
        image.thumbnail((max_input_size, max_input_size), resampling)
    return image


def _remove_bytes(
    data: bytes,
    session,
    alpha_matting: bool,
    max_input_size: int = 0,
):
    fg = int(os.getenv("REMBG_FOREGROUND", "240"))
    bg = int(os.getenv("REMBG_BACKGROUND", "10"))
    erode = int(os.getenv("REMBG_ERODE", "10"))
    prepared = _prepare_input(data, max_input_size)
    try:
        return remove(
            prepared,
            session=session,
            alpha_matting=alpha_matting,
            alpha_matting_foreground_threshold=fg,
            alpha_matting_background_threshold=bg,
            alpha_matting_erode_size=erode,
        )
    except Exception:
        if isinstance(prepared, Image.Image):
            raise
        img = Image.open(io.BytesIO(data))
        return remove(
            img,
            session=session,
            alpha_matting=alpha_matting,
            alpha_matting_foreground_threshold=fg,
            alpha_matting_background_threshold=bg,
            alpha_matting_erode_size=erode,
        )


def _write_output(output, output_path: str):
    if isinstance(output, bytes):
        with open(output_path, "wb") as file:
            file.write(output)
        return
    output.save(output_path, "PNG")


def worker_main() -> int:
    model = os.getenv("REMBG_MODEL", "u2net_human_seg")
    session = _new_session()
    print(json.dumps({"type": "ready", "model": model}), flush=True)

    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line)
            request_id = str(request["id"])
            input_path = str(request["inputPath"])
            output_path = str(request["outputPath"])
            alpha_matting = bool(request.get("alphaMatting", False))
            max_input_size = max(0, int(request.get("maxInputSize", 0)))

            with open(input_path, "rb") as file:
                data = file.read()
            output = _remove_bytes(data, session, alpha_matting, max_input_size)
            _write_output(output, output_path)
            print(json.dumps({"id": request_id, "ok": True}), flush=True)
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            print(
                json.dumps({
                    "id": request_id,
                    "ok": False,
                    "error": f"{type(error).__name__}: {error}",
                }),
                flush=True,
            )
    return 0


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--worker":
        return worker_main()

    if len(sys.argv) != 3:
        print("Usage: rembg_remove.py <input> <output>", file=sys.stderr)
        return 2

    in_path = sys.argv[1]
    out_path = sys.argv[2]

    with open(in_path, "rb") as f:
        data = f.read()

    session = _new_session()
    alpha_matting = os.getenv("REMBG_ALPHA_MATTING", "1") != "0"
    max_input_size = max(0, int(os.getenv("REMBG_MAX_INPUT_SIZE", "0")))
    out = _remove_bytes(data, session, alpha_matting, max_input_size)
    _write_output(out, out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
