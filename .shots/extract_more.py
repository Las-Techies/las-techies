from PIL import Image
from rembg import remove

BASE = "/Users/robregon/.cursor/projects/Users-robregon-las-techies/assets"
CONFIGURE = f"{BASE}/v3_manager_configure-5e5240b3-f331-4184-989a-c2a3cf5274eb.png"
RESULTS = f"{BASE}/v3_quiz_results-52c68795-2bb7-4de4-9735-ea3f645e1e4e.png"
TEAM = f"{BASE}/v3_meet_our_team-6eac034e-6faf-40f7-8af1-c28876e2db99.png"
OUT = "/Users/robregon/las-techies/frontend/src/assets"


def crop_frac(img, box):
    w, h = img.size
    fx1, fy1, fx2, fy2 = box
    return img.crop((int(fx1 * w), int(fy1 * h), int(fx2 * w), int(fy2 * h)))


def autocrop_alpha(img, pad=10):
    bbox = img.getbbox()
    if not bbox:
        return img
    x1, y1, x2, y2 = bbox
    w, h = img.size
    return img.crop((max(0, x1 - pad), max(0, y1 - pad), min(w, x2 + pad), min(h, y2 + pad)))


def panda(src, box, name):
    img = Image.open(src).convert("RGBA")
    cut = autocrop_alpha(remove(crop_frac(img, box)))
    cut.save(f"{OUT}/{name}")
    print("panda", name, cut.size)


def face(src, box, name):
    img = Image.open(src).convert("RGBA")
    c = crop_frac(img, box)
    # square it (center crop to shortest side) so it fills a circle cleanly
    w, h = c.size
    s = min(w, h)
    left = (w - s) // 2
    top = (h - s) // 2
    c = c.crop((left, top, left + s, top + s))
    c.save(f"{OUT}/{name}")
    print("face", name, c.size)


panda(CONFIGURE, (0.775, 0.10, 1.0, 0.45), "panda-peek.png")
panda(RESULTS, (0.505, 0.10, 0.805, 0.44), "panda-cheer.png")

face(TEAM, (0.06, 0.53, 0.225, 0.78), "team-ava.png")
face(TEAM, (0.285, 0.44, 0.47, 0.72), "team-maya.png")
face(TEAM, (0.775, 0.53, 0.94, 0.78), "team-nora.png")

print("DONE")
