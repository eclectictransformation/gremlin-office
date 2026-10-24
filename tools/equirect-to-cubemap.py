#!/usr/bin/env python3
"""Turn ONE painted equirectangular panorama (2:1, e.g. 4096x2048 from Moth) into the six
cube faces the office uses, so the drawn room can be swapped for a painting.

  python3 tools/equirect-to-cubemap.py moth-office-pano.jpg [face_px=1024]

Writes assets/room/pano-{front,right,back,left,floor,ceiling}.jpg. Then in office-data.json set
  room.faces.front = "assets/room/pano-front.jpg"  (and the other five).
Conventions: the centre column of the panorama (yaw 0) becomes the desk wall ("front"),
yaw 90 = right of centre ("right"/gallery). Hotspot yaw/pitch values stay valid, so
re-place eggs on the painting with the D key (it shows yaw/pitch under the cursor).
Needs: pip install pillow numpy
"""
import sys, pathlib
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
FACES = {  # n (toward face centre), r (face +x), d (face +y); CSS axes, y down, front = -z
    "front": ((0, 0, -1), (1, 0, 0), (0, 1, 0)), "right": ((1, 0, 0), (0, 0, 1), (0, 1, 0)),
    "back": ((0, 0, 1), (-1, 0, 0), (0, 1, 0)), "left": ((-1, 0, 0), (0, 0, -1), (0, 1, 0)),
    "floor": ((0, 1, 0), (1, 0, 0), (0, 0, 1)), "ceiling": ((0, -1, 0), (1, 0, 0), (0, 0, -1)),
}

def main(src, size=1024):
    pano = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    H, W = pano.shape[:2]
    t = (np.arange(size) + 0.5) / size * 2 - 1
    u, v = np.meshgrid(t, t)
    for name, (n, r, d) in FACES.items():
        n, r, d = map(np.array, (n, r, d))
        vec = n[None, None, :] + u[..., None] * r + v[..., None] * d
        x, y, z = vec[..., 0], vec[..., 1], vec[..., 2]
        yaw = np.arctan2(x, -z)                       # 0 at front, +90deg to the right
        pitch = np.arctan2(-y, np.hypot(x, z))        # up is positive
        px = ((yaw / (2 * np.pi) + 0.5) % 1.0) * (W - 1)
        py = (0.5 - pitch / np.pi) * (H - 1)
        x0, y0 = np.floor(px).astype(int), np.floor(py).astype(int)
        x1, y1 = (x0 + 1) % W, np.clip(y0 + 1, 0, H - 1)
        fx, fy = (px - x0)[..., None], (py - y0)[..., None]
        out = (pano[y0, x0] * (1 - fx) * (1 - fy) + pano[y0, x1] * fx * (1 - fy) +
               pano[y1, x0] * (1 - fx) * fy + pano[y1, x1] * fx * fy)
        dst = ROOT / "assets" / "room" / f"pano-{name}.jpg"
        Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(dst, quality=82, optimize=True, progressive=True)
        print("wrote", dst.relative_to(ROOT))

if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1024)
