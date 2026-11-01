import struct
import zlib
import os


def baca(path):
    data = open(path, "rb").read()
    pos = 8
    idat = b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        ch = data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if typ == b"IHDR":
            w, h, bd, ct, _, _, _ = struct.unpack(">IIBBBBB", ch)
        elif typ == b"IDAT":
            idat += ch
        elif typ == b"IEND":
            break
    raw = zlib.decompress(idat)
    bpp = 3 if ct == 2 else 4
    stride = w * bpp
    rows = []
    prev = bytearray(stride)
    off = 0
    for _ in range(h):
        f = raw[off]
        off += 1
        cur = bytearray(raw[off:off + stride])
        off += stride
        if f == 1:
            for i in range(bpp, stride):
                cur[i] = (cur[i] + cur[i - bpp]) & 255
        elif f == 2:
            for i in range(stride):
                cur[i] = (cur[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = cur[i - bpp] if i >= bpp else 0
                cur[i] = (cur[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = cur[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa = abs(p - a)
                pb = abs(p - b)
                pc = abs(p - c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                cur[i] = (cur[i] + pr) & 255
        rows.append(cur)
        prev = cur
    return w, h, bpp, rows


def lihat(path, cols=100, baris=30):
    w, h, bpp, rows = baca(path)
    chars = " .:-=+*#%@"
    print("\n" + os.path.basename(path) + f" ({w}x{h})")
    for oy in range(baris):
        y0 = oy * h // baris
        y1 = max(y0 + 1, (oy + 1) * h // baris)
        line = []
        for ox in range(cols):
            x0 = ox * w // cols
            x1 = max(x0 + 1, (ox + 1) * w // cols)
            s = 0
            n = 0
            for y in range(y0, y1, max(1, (y1 - y0) // 3)):
                row = rows[y]
                for x in range(x0, x1, max(1, (x1 - x0) // 3)):
                    i = x * bpp
                    s += int(.2126 * row[i] + .7152 * row[i + 1] + .0722 * row[i + 2])
                    n += 1
            lum = s // max(1, n)
            idx = max(0, min(len(chars) - 1, (lum - 15) * len(chars) // 225))
            line.append(chars[idx])
        print("".join(line))


lihat("public/banner-promo/tenor-7-bunga-15-desktop.png", 100, 30)
lihat("public/banner-promo/tenor-7-bunga-15-mobile.png", 60, 50)
