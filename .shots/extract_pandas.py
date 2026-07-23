from PIL import Image
from rembg import remove

LOGIN = "/Users/robregon/.cursor/projects/Users-robregon-las-techies/assets/v3_login-74589352-00ee-4e31-bb57-6fbcd2ddf921.png"
HOME = "/Users/robregon/.cursor/projects/Users-robregon-las-techies/assets/v3_new_hire_home-a33dd994-eaaf-4edd-9607-2d96cf9ae5a9.png"
OUT_DIR = "/Users/robregon/las-techies/frontend/src/assets"


def crop_frac(img, fx1, fy1, fx2, fy2):
    w, h = img.size
    return img.crop((int(fx1 * w), int(fy1 * h), int(fx2 * w), int(fy2 * h)))


def autocrop_alpha(img, pad=12):
    bbox = img.getbbox()
    if not bbox:
        return img
    x1, y1, x2, y2 = bbox
    w, h = img.size
    x1 = max(0, x1 - pad)
    y1 = max(0, y1 - pad)
    x2 = min(w, x2 + pad)
    y2 = min(h, y2 + pad)
    return img.crop((x1, y1, x2, y2))


def process(src, box, out_name):
    img = Image.open(src).convert("RGBA")
    print(out_name, "source size", img.size)
    cropped = crop_frac(img, *box)
    cut = remove(cropped)
    cut = autocrop_alpha(cut)
    out_path = f"{OUT_DIR}/{out_name}"
    cut.save(out_path)
    print("saved", out_path, cut.size)


# Login: floating wizard panda + staff (left-center, above the wordmark)
process(LOGIN, (0.085, 0.05, 0.48, 0.74), "panda-login.png")

# Home: waving upper-body wizard panda (right side, above the cards)
process(HOME, (0.58, 0.12, 0.995, 0.49), "panda-home.png")

print("DONE")
