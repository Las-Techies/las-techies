from PIL import Image

BASE = "/Users/robregon/.cursor/projects/Users-robregon-las-techies/assets"
OUT = "/Users/robregon/las-techies/frontend/src/assets"

# (source filename, output name, vertical top fraction for the square crop)
JOBS = [
    ("Frida_headshot-3880a561-12b6-47a1-8694-b229ccd615b1.png", "team-frida.png", 0.20),
    ("esme_headshot-015f0a03-6328-4a71-9008-b0d5425cd81e.png", "team-esme.png", 0.22),
    ("melanie_headshot-2303bb10-bd23-4d9c-8521-25daf6409564.png", "team-melanie.png", 0.20),
    ("IMG_7226-8f67ded3-4a84-4227-a101-491ea0cd8d0e.png", "team-reyna.png", 0.22),
]


def square_face(src, out, top_frac):
    img = Image.open(src).convert("RGB")
    w, h = img.size
    side = w  # portraits are taller than wide; crop a width-sized square
    top = int(top_frac * h)
    if top + side > h:
        top = h - side
    if top < 0:
        top = 0
    crop = img.crop((0, top, w, top + side))
    crop.save(out)
    print(out.split("/")[-1], f"src={w}x{h}", "->", crop.size)


for fname, outname, tf in JOBS:
    square_face(f"{BASE}/{fname}", f"{OUT}/{outname}", tf)

print("DONE")
