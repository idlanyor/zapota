"""Remove an image background: image bytes on stdin -> RGBA PNG on stdout.

Run with the rembg virtualenv (see src/commands/sticker/removebg.js), e.g.
    /root/rembg/venv/bin/python scripts/rembg_remove.py u2net 4 < in.jpg > out.png
argv: model name (default u2net), CPU threads (default 4).
"""
import io
import sys

import onnxruntime as ort
from rembg import new_session, remove


def main() -> None:
    model = sys.argv[1] if len(sys.argv) > 1 else "u2net"
    threads = int(sys.argv[2]) if len(sys.argv) > 2 else 4

    # Explicit thread counts: inside LXC onnxruntime's default thread
    # affinity fails noisily, and capping threads leaves CPU for the bot.
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = threads
    opts.inter_op_num_threads = 1
    ort.set_default_logger_severity(3)

    session = new_session(model, sess_opts=opts)
    data = sys.stdin.buffer.read()
    if not data:
        sys.exit("no input")
    out = remove(data, session=session)
    sys.stdout.buffer.write(out if isinstance(out, bytes) else _png(out))


def _png(image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, "PNG")
    return buf.getvalue()


if __name__ == "__main__":
    main()
