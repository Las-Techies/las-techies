from PIL import Image

SHOT = "/Users/robregon/.cursor/projects/Users-robregon-las-techies/assets/Screenshot_2026-07-22_at_4.01.06_AM-8cd6ea65-6ed0-466e-88ec-e314d1e7c9a9.png"
OUT = "/Users/robregon/las-techies/frontend/src/assets"

img = Image.open(SHOT).convert("RGBA")
W, H = img.size
print("screenshot size", W, H)


def face(cx, cy, r, name):
    # cx, cy, r as fractions of width/height (r as fraction of width)
    x = cx * W
    y = cy * H
    rad = r * W
    box = (int(x - rad), int(y - rad), int(x + rad), int(y + rad))
    c = img.crop(box)
    c.save(f"{OUT}/{name}")
    print(name, c.size)


# Circle centers estimated from the 1024-wide slide (row of 4 headshots)
CY = 0.560
R = 0.055
face(0.319, CY, R, "team-frida.png")
face(0.452, CY, R, "team-esme.png")
face(0.586, CY, R, "team-reyna.png")
face(0.728, CY, R, "team-melanie.png")

print("DONE")
