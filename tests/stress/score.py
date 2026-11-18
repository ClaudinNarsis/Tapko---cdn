"""Auto-scorer: SSIM of truth vs upload per comment, comment card/pin and widget button masked.
Usage: python3 score.py <run-dir> [threshold]   (prints per-comment score, PASS/FAIL, total; exit 0)
Eyeball sheet.png for the final call; this only flags obvious misses."""
import sys, glob, json, os, re
import numpy as np
from PIL import Image

W = 120          # compare at this width (coarse: ignores grain, ~tint)
FAIL_BELOW = 0.30   # blank / black / wrong section. Calibrated on hosted-115900 (TEST_CASES.md)
PASS_AT = 0.70      # between = CHECK (eyeball sheet.png): partial misses (a missing WebGL object) live here

def box(a, k):
    p = np.pad(a, ((k // 2,) * 2, (k // 2,) * 2), mode='edge')
    c = np.cumsum(np.cumsum(p, 0), 1); c = np.pad(c, ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k])[:a.shape[0], :a.shape[1]] / (k * k)

def ssim_map(a, b, k=5):
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    ma, mb = box(a, k), box(b, k)
    va, vb, cov = box(a * a, k) - ma ** 2, box(b * b, k) - mb ** 2, box(a * b, k) - ma * mb
    return ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma ** 2 + mb ** 2 + c1) * (va + vb + c2))

def score(truth, upload, click, css_w):
    a = Image.open(truth).convert('L'); b = Image.open(upload).convert('L')
    h = round(W * a.size[1] / a.size[0])
    a = np.asarray(a.resize((W, h), Image.LANCZOS), 'float64'); b = np.asarray(b.resize((W, h), Image.LANCZOS), 'float64')
    s = W / css_w; keep = np.ones((h, W), bool)
    def mask(x0, y0, x1, y1): keep[max(0, int(y0 * s)):max(0, int(y1 * s)), max(0, int(x0 * s)):max(0, int(x1 * s))] = False
    cx, cy = click
    mask(cx - 20, cy - 20, cx + 330, cy + 210)           # pin + comment card
    mask(css_w - 260, h / s - 70, css_w, h / s)          # View All Feedback button
    m = ssim_map(a, b)
    return float(m[keep].mean())

def main():
    run = sys.argv[1]; res = json.load(open(f'{run}/results.json')); n = {'PASS': 0, 'CHECK': 0, 'FAIL': 0}
    for r in res:
        t = glob.glob(f'{run}/truth-{r["i"]}-*.png')
        if not t or not r.get('upload'): n['FAIL'] += 1; print(f'  #{r["i"]} NO UPLOAD FAIL'); continue
        css_w = next((k['w'] for k in r.get('renders', []) if k.get('w')), Image.open(t[0]).size[0])
        sc = score(t[0], f'{run}/{r["upload"]}', r.get('click', [0, 0]), css_w)
        v = 'PASS' if sc >= PASS_AT else 'FAIL' if sc < FAIL_BELOW else 'CHECK'; n[v] += 1
        print(f'  #{r["i"]} {sc:.2f} {v}')
    print(f'SCORE pass {n["PASS"]} / check {n["CHECK"]} / fail {n["FAIL"]} of {len(res)}')
    return n

if __name__ == '__main__': main()
