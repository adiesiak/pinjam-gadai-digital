from lihat_gambar import baca

for path in [
    "public/banner-promo/tenor-7-bunga-15-desktop.png",
    "public/banner-promo/tenor-7-bunga-15-mobile.png",
]:
    w, h, bpp, rows = baca(path)
    print(path)
    for x, y in [
        (w // 2, h // 2),
        (int(w * 0.83), int(h * 0.49)),
        (int(w * 0.83), int(h * 0.40)),
        (int(w * 0.83), int(h * 0.55)),
        (int(w * 0.83), int(h * 0.25)),
        (int(w * 0.83), int(h * 0.75)),
    ]:
        i = x * bpp
        print(f"  {x:4},{y:4}: {rows[y][i]:3} {rows[y][i+1]:3} {rows[y][i+2]:3}")
