"""
Run once: python generate_icons.py
Generates static/icons/icon-192.png and icon-512.png.
Output is gitignored — run locally after cloning.
"""
import os
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    raise SystemExit("pip install Pillow")

OUT = Path(__file__).parent / "static" / "icons"
OUT.mkdir(parents=True, exist_ok=True)


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (15, 23, 42, 255))
    draw = ImageDraw.Draw(img)
    s = size

    # Background circle
    margin = s * 0.08
    draw.ellipse([margin, margin, s - margin, s - margin], fill=(30, 41, 59, 255))

    # Waveform bars (3 vertical lines)
    bar_w = max(2, s // 24)
    cx = s / 2
    heights = [s * 0.28, s * 0.44, s * 0.28]
    offsets = [-s * 0.14, 0, s * 0.14]
    color = (165, 180, 252, 255)  # indigo-300

    for h, dx in zip(heights, offsets):
        x = cx + dx - bar_w / 2
        y0 = s / 2 - h / 2
        y1 = s / 2 + h / 2
        r = bar_w // 2
        draw.rounded_rectangle([x, y0, x + bar_w, y1], radius=r, fill=color)

    return img


for size in (192, 512):
    icon = make_icon(size)
    path = OUT / f"icon-{size}.png"
    icon.save(path, "PNG")
    print(f"Saved {path}")

print("Icons generated.")
