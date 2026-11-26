# Post-production for the LetBetAfrika trophy render (portrait 5:6 canvas):
#   light burst out of the cup (behind the trophy), bloom on highlights, star glints,
#   everything that is light fades out before the image edges (no hard lines on the page).
# usage: python3 post.py render.png '<info json from render.js>' outdir
import sys, json, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, info, out = sys.argv[1], json.loads(sys.argv[2]), sys.argv[3]
random.seed(7)
W, H = 1000, 1200
im = Image.open(src).convert('RGBA')
bbox = im.getbbox()
th = bbox[3] - bbox[1]
k = (H * 0.66) / th                                   # trophy height = 66% of the canvas
crop = im.crop(bbox)
tw, tht = round(crop.width * k), round(crop.height * k)
crop = crop.convert('RGBa').resize((tw, tht), Image.LANCZOS).convert('RGBA')
ox, oy = (W - tw) // 2, H - tht - round(H * 0.03)
P = lambda p: ((p[0] - bbox[0]) * k + ox, (p[1] - bbox[1]) * k + oy)
mx, my = P(info['mouth']); rl, rr = P(info['rimL']), P(info['rimR']); ptop = P(info['ptop'])[1]
rimw = (rr[0] - rl[0]) / 2

def arr(img):  # straight RGBA -> premultiplied float
    a = np.asarray(img, dtype=np.float32) / 255.0
    a[..., :3] *= a[..., 3:4]
    return a

trophy = np.zeros((H, W, 4), np.float32)
trophy[oy:oy + tht, ox:ox + tw] = arr(crop)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
dx, dy = xx - mx, yy - my
dist = np.hypot(dx, dy)
sm = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))
edge = sm(0, 0.16, np.minimum(xx / W, 1 - xx / W)) * sm(0, 0.10, yy / H) * sm(0, 0.10, 1 - yy / H)

# ---------- light burst: rays fanning upward out of the cup ----------
phi = np.degrees(np.arctan2(dy, dx))                 # -90 = straight up
N = 40
reach = my * 0.97
rays = np.zeros((H, W), np.float32)
for i in range(N):
    th0 = -90 + (i / (N - 1) - 0.5) * 144 + random.uniform(-2.0, 2.0)
    up = math.cos(math.radians(th0 + 90))
    half = random.uniform(0.6, 2.0) * (0.75 + 0.45 * up)                 # angular half-width (deg)
    L = reach * random.uniform(0.55, 1.0) * (0.5 + 0.5 * up)
    b = random.uniform(0.40, 1.0) * (0.40 + 0.60 * up)
    d = (phi - th0 + 180) % 360 - 180
    ang = np.exp(-(d / half) ** 2)
    along = np.clip(1 - dist / L, 0, 1) ** 1.25                          # each ray tapers out smoothly
    rays += b * ang * along
haze = np.asarray(Image.fromarray(np.uint8(np.clip(rays, 0, 1) * 255)).filter(ImageFilter.GaussianBlur(14)), np.float32) / 255.0
rays = np.clip(rays, 0, 1.4) * 0.9 + haze * 0.55
ex = dx / (rimw * 0.95); ey = dy / (rimw * 0.42)
core = np.exp(-(ex ** 2 + ey ** 2) * 1.6)
halo = np.exp(-(dist / (rimw * 1.35)) ** 2) * 0.5 + np.exp(-(dist / (rimw * 2.4)) ** 2) * 0.16
light = np.clip(rays + core * 1.1 + halo, 0, None) * edge
t = np.clip(dist / (H * 0.40), 0, 1)[..., None]
warmA, warmB = np.array([1.0, 0.97, 0.86]), np.array([1.0, 0.74, 0.28])
lcol = (warmA * (1 - t) + warmB * t) * light[..., None]

def add_light(base, rgb):
    c = base[..., :3] + rgb
    a = np.clip(np.maximum(base[..., 3], c.max(axis=2)), 0, 1)
    return np.concatenate([np.minimum(c, a[..., None]), a[..., None]], axis=2)

img = add_light(np.zeros((H, W, 4), np.float32), lcol)
img = trophy + img * (1 - trophy[..., 3:4])

# ---------- bloom from the trophy's own highlights (not on the plinth wordmark) ----------
ta = np.clip(trophy[..., 3:4], 1e-6, 1)
straight = trophy[..., :3] / ta
lum = (straight * [0.2126, 0.7152, 0.0722]).sum(axis=2) * trophy[..., 3]
bright = np.clip((lum - 0.80) / 0.20, 0, 1)[..., None] * straight * trophy[..., 3:4]
bright[int(ptop) - 6:] = 0
bimg = Image.fromarray(np.uint8(np.clip(bright, 0, 1) * 255), 'RGB')
b1 = np.asarray(bimg.filter(ImageFilter.GaussianBlur(5)), np.float32) / 255.0
b2 = np.asarray(bimg.filter(ImageFilter.GaussianBlur(22)), np.float32) / 255.0
img = add_light(img, (b1 * 0.55 + b2 * 0.55) * edge[..., None])

# ---------- star glints ----------
def star(cx, cy, size, inten):
    ddx, ddy = xx - cx, yy - cy
    r = np.hypot(ddx, ddy) + 1e-3
    arms = (np.exp(-(ddy / (size * 0.03)) ** 2) * np.exp(-(np.abs(ddx) / (size * 0.55)) ** 1.6) +
            np.exp(-(ddx / (size * 0.03)) ** 2) * np.exp(-(np.abs(ddy) / (size * 0.55)) ** 1.6))
    diag = (np.exp(-((ddx - ddy) / (size * 0.05)) ** 2) + np.exp(-((ddx + ddy) / (size * 0.05)) ** 2)) * np.exp(-(r / (size * 0.45)) ** 1.3) * 0.35
    glow = np.exp(-(r / (size * 0.12)) ** 2)
    return (arms + diag + glow) * inten

gl = lum.copy(); gl[int(ptop) - 30:] = 0
pool = np.abs(dy) < rimw * 0.5
gl[pool] *= (np.abs(dx[pool]) > rimw * 1.05)
picks = []
for idx in np.argsort(gl.ravel())[::-1][:40000]:
    y0, x0 = divmod(int(idx), W)
    if gl[y0, x0] < 0.85: break
    if all((x0 - px) ** 2 + (y0 - py) ** 2 > (W * 0.16) ** 2 for px, py in picks): picks.append((x0, y0))
    if len(picks) >= 3: break
glint = np.zeros((H, W), np.float32)
for i, (px, py) in enumerate(picks):
    glint += star(px, py, W * (0.085 - i * 0.012), 0.75 - i * 0.12)
for (fx, fy, s, it) in [(-0.27, -0.13, 0.045, 0.6), (0.25, -0.18, 0.038, 0.55), (0.05, -0.27, 0.032, 0.45)]:
    glint += star(mx + fx * W, my + fy * W, W * s, it)
img = add_light(img, (np.clip(glint, 0, 3) * edge)[..., None] * np.array([1.0, 0.95, 0.80]))

# ---------- export ----------
a = np.clip(img[..., 3:4], 0, 1)
rgb = np.where(a > 1e-4, img[..., :3] / np.maximum(a, 1e-4), 0)
outimg = Image.fromarray(np.uint8(np.clip(np.concatenate([rgb, a], axis=2), 0, 1) * 255 + 0.5), 'RGBA')
outimg.save(f'{out}/trophy-full.png')
big = outimg.convert('RGBa').resize((900, 1080), Image.LANCZOS).convert('RGBA')
big.save(f'{out}/trophy.webp', 'WEBP', quality=84, alpha_quality=80, method=6)
outimg.convert('RGBa').resize((600, 720), Image.LANCZOS).convert('RGBA').save(f'{out}/trophy-720.webp', 'WEBP', quality=84, alpha_quality=80, method=6)
bg = Image.new('RGBA', (W, H), (11, 12, 15, 255)); bg.alpha_composite(outimg); bg.convert('RGB').save(f'{out}/trophy-on-dark.jpg', quality=90)
print('mouth', round(mx), round(my), 'glints', picks, 'edge alpha max', float(a[0].max()), float(a[:, 0].max()), float(a[:, -1].max()))
