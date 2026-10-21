"""Cuts Jingle's garden sprites out by difference (see garden.py):
  python garden_sprite.py DIR [cold_scarf,awake_scarf]   reads DIR/garden_crop_empty.png and DIR/garden_jingle_<pose>_full|matte.png
                                -> DIR/garden_jingle_<pose>.png  Jingle alone (his own matte), animated by the TV
                                -> DIR/garden_ground_<pose>.png  what he does to the ledge (contact shadow, dent
                                   in the snow): every other pixel that changed, feathered and faded to zero at
                                   the edge of the box. It stays still while he hops, so it never shows a seam."""
import sys

import numpy as np
from PIL import Image, ImageFilter

D = sys.argv[1]
empty = np.asarray(Image.open(f"{D}/garden_crop_empty.png").convert("RGB")).astype(np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


POSES = sys.argv[2].split(",") if len(sys.argv) > 2 else ["sleep", "cold", "awake"]
for pose in POSES:
    full = Image.open(f"{D}/garden_jingle_{pose}_full.png").convert("RGB")
    matte = np.asarray(Image.open(f"{D}/garden_jingle_{pose}_matte.png"))[..., 3].astype(np.float32) / 255
    diff = np.abs(np.asarray(full).astype(np.float32) - empty).max(axis=2)
    diff = np.asarray(Image.fromarray(diff.astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)
    a = np.maximum(matte, smoothstep(3, 14, diff))
    # soften the shadow edge, never Jingle himself
    soft = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))).astype(np.float32) / 255
    a = np.maximum(matte, soft)
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    edge = np.minimum.reduce([xx, yy, w - 1 - xx, h - 1 - yy]).astype(np.float32)
    a *= smoothstep(4, 60, edge)
    rgb = np.asarray(full)
    ground = a * (1 - matte)
    for name, al in (("jingle", matte), ("ground", ground)):
        out = np.dstack([rgb, (al * 255).round().astype(np.uint8)])
        # the TV draws them at 478 px: ship 512 px, with fully transparent pixels zeroed so they compress
        im = np.array(Image.fromarray(out, "RGBA").resize((512, 512), Image.LANCZOS))
        im[im[..., 3] == 0, :3] = 0
        Image.fromarray(im, "RGBA").save(f"{D}/garden_{name}_{pose}.png", optimize=True)
    print("SPRITE", pose, round(float((ground > 0.02).mean()), 3), flush=True)
