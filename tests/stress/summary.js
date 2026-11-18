// Prints one line per run dir: captures uploaded, per-capture time, paths used.
// Pass/fail on *content* still needs eyes on each sheet.png (truth vs captured).
const fs = require('fs');
const path = require('path');
const out = process.argv[2];
const rows = [];
for (const name of fs.readdirSync(out).sort()) {
  const f = path.join(out, name, 'results.json');
  if (!fs.existsSync(f)) { if (fs.statSync(path.join(out, name)).isDirectory()) rows.push(`${name.padEnd(16)} NO RESULTS (crashed, see ${name}.stdout)`); continue; }
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  const up = r.filter(x => x.upload).length;
  const ms = r.filter(x => x.ms).map(x => x.ms);
  const kinds = [...new Set(r.flatMap(x => (x.renders || []).map(k => `${k.kind}:${k.status || k.err || ''}`)))].join(' ');
  const flags = [
    r.some(x => x.error) && 'NO-CARD',
    r.some(x => x.syAfterSubmit != null && Math.abs(x.syAfterSubmit - x.sy) > 50) && 'scrolled-after-submit',
  ].filter(Boolean).join(' ');
  rows.push(`${name.padEnd(16)} uploads ${up}/${r.length}  ${ms.length ? `max ${(Math.max(...ms) / 1000).toFixed(1)}s` : ''}  ${kinds} ${flags}`);
}
console.log(`\n${out}\n${rows.join('\n')}\nsheets: ${out}/*/sheet.png`);
