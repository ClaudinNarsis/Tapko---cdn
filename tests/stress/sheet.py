import sys, glob, os, re, json
from PIL import Image, ImageDraw
run = sys.argv[1]
truths = sorted(glob.glob(f'{run}/truth-*.png'), key=lambda f: int(re.search(r'truth-(\d+)', f).group(1)))
res = {r['i']: r.get('upload') for r in json.load(open(f'{run}/results.json'))}  # pair by comment index, not order
W = 480
rows = []
for t in truths:
    up = res.get(int(re.search(r'truth-(\d+)', t).group(1)))
    a = Image.open(t).convert('RGB')
    b = Image.open(f'{run}/{up}').convert('RGB') if up and os.path.exists(f'{run}/{up}') else Image.new('RGB', a.size, (200, 40, 40))
    if not up: ImageDraw.Draw(b).text((20, 20), 'NO UPLOAD', fill='white')
    a = a.resize((W, int(W*a.size[1]/a.size[0]))); b = b.resize((W, int(W*b.size[1]/b.size[0])))
    h = max(a.size[1], b.size[1]); row = Image.new('RGB', (W*2+10, h+18), 'white'); row.paste(a, (0, 18)); row.paste(b, (W+10, 18))
    ImageDraw.Draw(row).text((4, 3), f'TRUTH {os.path.basename(t)}   |   CAPTURED {up or 'NO UPLOAD'}', fill='black'); rows.append(row)
sheet = Image.new('RGB', (W*2+10, sum(r.size[1]+6 for r in rows)), 'gray'); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.size[1]+6
out = sys.argv[2] if len(sys.argv) > 2 else f'{run}/sheet.png'; sheet.save(out); print(out)
