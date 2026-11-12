"""Draws the Piano Path app icon (piano keys on a dark tile) as SVG and PNG."""
import os
from PIL import Image, ImageDraw

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(HERE, exist_ok=True)

BG, WHITE, BLACK, BRASS = "#14161B", "#F4F2EC", "#14161B", "#DDAA4A"


def shapes(s):
    """Return (rects) in a 0..s coordinate space: background, keys, brass bar."""
    pad = s * 0.2
    w = s - 2 * pad
    top = s * 0.3
    bottom = s * 0.78
    kw = w / 4
    out = [("bg", 0, 0, s, s)]
    for i in range(4):
        out.append(("white", pad + i * kw + s * 0.008, top, pad + (i + 1) * kw - s * 0.008, bottom))
    bh = (bottom - top) * 0.6
    for i in (1, 2, 3):
        cx = pad + i * kw
        out.append(("black", cx - kw * 0.3, top, cx + kw * 0.3, top + bh))
    out.append(("brass", pad, s * 0.2, s - pad, s * 0.245))
    return out


COL = {"bg": BG, "white": WHITE, "black": BLACK, "brass": BRASS}

svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">']
for kind, x1, y1, x2, y2 in shapes(512):
    r = 112 if kind == "bg" else 6
    svg.append(f'<rect x="{x1:.1f}" y="{y1:.1f}" width="{x2 - x1:.1f}" height="{y2 - y1:.1f}" rx="{r}" fill="{COL[kind]}"/>')
svg.append("</svg>")
with open(os.path.join(HERE, "icon.svg"), "w", encoding="utf-8") as f:
    f.write("\n".join(svg))

for size in (192, 512):
    img = Image.new("RGBA", (size, size), BG)
    d = ImageDraw.Draw(img)
    for kind, x1, y1, x2, y2 in shapes(size):
        if kind == "bg":
            continue
        d.rounded_rectangle([x1, y1, x2, y2], radius=max(2, size * 0.012), fill=COL[kind])
    img.save(os.path.join(HERE, f"icon-{size}.png"))
print("icons written")
