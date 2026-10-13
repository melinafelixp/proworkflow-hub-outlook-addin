"""Draws the ProWorkflow Hub ribbon icons. Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

PRIMARY = (0, 60, 70, 255)  # #003c46
SECONDARY = (0, 175, 175, 255)  # #00afaf
WHITE = (255, 255, 255, 255)
SCALE = 8  # draw large, then downsample for clean edges


def icon(size: int) -> Image.Image:
    n = size * SCALE
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.2), fill=PRIMARY)
    # Three stacked bars of decreasing width: many emails folded into one conversation.
    left = n * 0.22
    bar = n * 0.13
    gap = n * 0.085
    top = (n - (3 * bar + 2 * gap)) / 2
    for i, width in enumerate((0.56, 0.44, 0.30)):
        y = top + i * (bar + gap)
        # The last, shortest bar carries the secondary brand color.
        d.rounded_rectangle([left, y, left + n * width, y + bar], radius=bar / 2, fill=SECONDARY if i == 2 else WHITE)
    return img.resize((size, size), Image.LANCZOS)


for s in (16, 32, 64, 80, 128):
    icon(s).save(f"assets/icon-{s}.png")
print("icons written")
