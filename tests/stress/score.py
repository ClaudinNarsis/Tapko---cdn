"""Auto-scorer: per comment, compare truth vs upload on an 8x5 tile grid (luminance, comment card/pin and
the widget button masked, 2px border cropped). A tile is bad when its mean luminance differs by >20 grey
levels after removing the global offset (the truth has the widget's comment-mode tint) or its contrast
(std) differs by more than 2x. Comment FAILS when >= FAIL_TILES tiles are bad.
Usage: python3 score.py <run-dir> [fail-tiles]   Calibrated on hosted-115900, see TEST_CASES.md.
A coarse flag, not a verdict: small misses (a single missing 3D object) can slip through; eyeball sheet.png."""
import sys, glob, json
import numpy as np
from PIL import Image

W, GX, GY = 160, 8, 5
FAIL_TILES = int(sys.argv[2]) if len(sys.argv) > 2 else 7

def bad_tiles(truth, upload, click, css_w):
    a = Image.open(truth).convert('L'); b = Image.open(upload).convert('L').resize(a.size)
    h = round(W * a.size[1] / a.size[0])
    A = np.asarray(a.resize((W, h), Image.BOX), float); B = np.asarray(b.resize((W, h), Image.BOX), float)
    s = W / css_w; keep = np.ones((h, W), bool); cx, cy = click
    keep[max(0, int((cy - 20) * s)):int((cy + 210) * s), max(0, int((cx - 20) * s)):int((cx + 330) * s)] = False  # pin + card
    keep[int(h - 70 * s):, int(W - 260 * s):] = False                                                              # View All Feedback
    keep[:2] = keep[-2:] = False; keep[:, :2] = keep[:, -2:] = False                                                 # widget border
    th, tw = h // GY, W // GX; t = []
    for j in range(GY):
        for i in range(GX):
            sl = (slice(j * th, (j + 1) * th), slice(i * tw, (i + 1) * tw)); m = keep[sl]
            if m.mean() >= 0.6: x, y = A[sl][m], B[sl][m]; t.append((x.mean(), y.mean(), x.std(), y.std()))
    t = np.array(t); off = np.median(t[:, 1] - t[:, 0])
    bad = (np.abs(t[:, 1] - t[:, 0] - off) > 20) | (np.abs(np.log((t[:, 3] + 4) / (t[:, 2] + 4))) > 0.7)
    return int(bad.sum()), len(t)

def main():
    run = sys.argv[1]; res = json.load(open(f'{run}/results.json')); ok = 0
    for r in res:
        t = glob.glob(f'{run}/truth-{r["i"]}-*.png')
        if not t or not r.get('upload'): print(f'  #{r["i"]} NO UPLOAD FAIL'); continue
        css_w = next((k['w'] for k in r.get('renders', []) if k.get('w')), Image.open(t[0]).size[0])
        n, tot = bad_tiles(t[0], f'{run}/{r["upload"]}', r.get('click', [0, 0]), css_w)
        p = n < FAIL_TILES; ok += p
        print(f'  #{r["i"]} bad tiles {n}/{tot} {"PASS" if p else "FAIL"}')
    print(f'SCORE {ok}/{len(res)}')

if __name__ == '__main__': main()
