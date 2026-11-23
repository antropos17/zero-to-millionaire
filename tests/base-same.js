/* Стандартный старт до и после правки: одна и та же жизнь при одной очереди случайностей совпадает до поля.
   node tests/base-same.js <git-ref> [жизней]  — сравнивает src/core.js из рабочей папки с src/core.js из git-ref.
   Жизни идут на чистой логике: случайные покупки, фокус, звезда, развилки, черты. Вторая проверка: игрок с купленными
   сценариями, выбравший «Обычный старт», живёт ту же жизнь. Поля версии и сценария (v, sc, scOptions) не сравниваются. */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const ref = process.argv[2];
if (!ref) { console.log('нужен git-ref старой версии, например: node tests/base-same.js main'); process.exit(2); }
const N = +process.argv[3] || 200;
const root = path.join(__dirname, '..');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'z2m-')), 'core.js');
fs.writeFileSync(tmp, execFileSync('git', ['show', ref + ':src/core.js'], { cwd: root }));
const Old = require(tmp), New = require(path.join(root, 'src/core.js'));
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const KINDS = ['job', 'gym', 'home', 'asset', 'reel', 'add:study', 'add:chance', 'cut:bill', 'up:mult', 'up:star', 'up:insure', 'up:coach'];
const strip = (s) => { const t = JSON.parse(JSON.stringify(s)); delete t.v; delete t.sc; delete t.scOptions; return JSON.stringify(t); };
/* одна жизнь; owned — купленные сценарии (в новой версии), выбирается «Обычный старт» */
function life(Core, seed, owned) {
  const rng = mulberry(seed), trail = [];
  const perks = {}; for (const id of Core.PERK_IDS) if (rng() < 0.4) perks[id] = Math.floor(rng() * 4);
  const s = owned ? Core.newState(perks, 1 + (seed % 3), rng, owned) : Core.newState(perks, 1 + (seed % 3), rng);
  if (s.scOptions) Core.pickScenario(s, 'base');
  trail.push(strip(s));
  let guard = 0;
  while (s.status === 'playing' && guard++ < 1200) {
    if (s.traitOptions) Core.pickTrait(s, s.traitOptions[Math.floor(rng() * s.traitOptions.length)]);
    if (s.fork) { const pick = rng() < 0.3 ? 'gold' : rng() < 0.5 ? 0 : 1; Core.choose(s, pick, rng) || Core.choose(s, 0, rng); trail.push(strip(s)); continue; }
    for (let a = Math.floor(rng() * 3); a > 0; a--) Core.act(s, KINDS[Math.floor(rng() * KINDS.length)]);
    if (rng() < 0.2) Core.setFocus(s, ['work', 'study', 'health', 'network', 'chance'][Math.floor(rng() * 5)]);
    if (rng() < 0.05) Core.startBoost(s);
    if (s.wonAt != null && rng() < 0.02) { Core.retire(s); trail.push(strip(s)); break; }
    const charged = Core.canCharge(s) && rng() < 0.3 ? ['work', 'study', 'health'][Math.floor(rng() * 3)] : null;
    Core.spin(s, rng, charged ? { charged } : null);
    trail.push(strip(s));
  }
  return trail;
}
let bad = 0, steps = 0, badOwned = 0;
for (let i = 0; i < N; i++) {
  const a = life(Old, 500 + i), b = life(New, 500 + i), c = life(New, 500 + i, New.SC_IDS);
  steps += a.length;
  const d = a.findIndex((x, k) => x !== b[k]);
  if (d !== -1 || a.length !== b.length) { if (!bad++) console.log(`жизнь ${i}: расхождение на шаге ${d}`); }
  const e = a.findIndex((x, k) => x !== c[k]);
  if (e !== -1 || a.length !== c.length) { if (!badOwned++) console.log(`жизнь ${i} со сценариями: расхождение на шаге ${e}`); }
}
console.log(`жизней ${N}, шагов ${steps}: до и после правки различаются ${bad}, «Обычный старт» владельца сценариев отличается ${badOwned}`);
process.exit(bad || badOwned ? 1 : 0);
