import sys, glob, os, re
from PIL import Image, ImageDraw
run = sys.argv[1]
truths = sorted(glob.glob(f'{run}/truth-*.png'), key=lambda f: int(re.search(r'truth-(\d+)', f).group(1)))
ups = sorted(glob.glob(f'{run}/upload-*'), key=lambda f: int(re.search(r'upload-(\d+)', f).group(1)))
W = 480
rows = []
for t, u in zip(truths, ups):
    a = Image.open(t).convert('RGB'); b = Image.open(u).convert('RGB')
    a = a.resize((W, int(W*a.size[1]/a.size[0]))); b = b.resize((W, int(W*b.size[1]/b.size[0])))
    h = max(a.size[1], b.size[1]); row = Image.new('RGB', (W*2+10, h+18), 'white'); row.paste(a, (0, 18)); row.paste(b, (W+10, 18))
    ImageDraw.Draw(row).text((4, 3), f'TRUTH {os.path.basename(t)}   |   CAPTURED {os.path.basename(u)}', fill='black'); rows.append(row)
sheet = Image.new('RGB', (W*2+10, sum(r.size[1]+6 for r in rows)), 'gray'); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.size[1]+6
out = sys.argv[2] if len(sys.argv) > 2 else f'{run}/sheet.png'; sheet.save(out); print(out)
