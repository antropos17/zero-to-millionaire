/* Проверка, что трудные цели вообще достижимы */
const Core = require('../src/core.js');
if (process.env.T) {
  const [ts, sg, sb, ps, as, cp] = process.env.T.split(',').map(Number);
  Core.JOBS.forEach((j) => { j.skill = Math.round(j.skill * ts); j.pay = Math.round(j.pay * (ps || 1)); });
  Core.CARD_GROW.study = sg; Core.CARD_BASE.study = sb;
  Core.ASSETS.forEach((a) => { a.income = Math.round(a.income * (as || 1)); });
  if (cp) { Core.PAY.coinPair *= cp; Core.PAY.coinTriple *= cp; }
}
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function life(seed, shop, extra) {
  const rng = mulberry(seed), s = Core.newState(0, 1, rng);
  while (s.status === 'playing') {
    while (Core.act(s, 'job'));
    if (s.health < 55) Core.act(s, 'gym');
    const nj = Core.nextJob(s);
    Core.setFocus(s, nj ? 'study' : 'work');
    if (extra) extra(s);
    const o = shop.map((k) => [k, Core.costOf(s, k)]).filter((x) => x[1] != null && s.money >= x[1] * 2).sort((a, b) => a[1] - b[1]);
    if (o.length && s.money < 600000) Core.act(s, o[0][0]);
    Core.spin(s, rng, Core.canCharge(s) ? { charged: s.focus } : null);
    if (s.fork) Core.choose(s, 1, rng);
  }
  return s;
}
function rep(name, shop, extra) {
  const hit = {}; let wins = 0; const ages = [];
  for (let i = 0; i < 200; i++) { const s = life(i + 1, shop, extra); if (s.status === 'won') { wins++; ages.push(Core.age(s)); } Core.goalsMet(s).forEach((g) => { hit[g] = (hit[g] || 0) + 1; }); }
  ages.sort((a, b) => a - b);
  console.log(name, 'побед', wins / 2 + '%', 'возраст med', ages[Math.floor(ages.length / 2)], JSON.stringify(hit));
}
rep('без инвестиций', ['home', 'reel', 'add:study', 'cut:bill']);
rep('без барабана  ', ['home', 'asset', 'add:study', 'cut:bill']);
rep('тонкая колода ', ['home', 'reel', 'cut:bill', 'cut:chance', 'cut:health', 'cut:network'], (s) => { if (!Core.nextJob(s)) Core.act(s, 'cut:study'); });
rep('три уровня    ', ['home', 'asset', 'reel', 'add:study', 'add:network', 'cut:bill'], (s) => { if (Core.level(s, 'study') === 3 && Core.level(s, 'network') < 3) Core.setFocus(s, 'network'); else if (Core.level(s, 'network') === 3 && Core.level(s, 'work') < 3) Core.setFocus(s, 'work'); });
rep('всё подряд    ', ['home', 'asset', 'reel', 'add:study', 'cut:bill']);
rep('без учёбы-карт', ['home', 'asset', 'reel', 'cut:bill']);
rep('без дома      ', ['asset', 'reel', 'add:study', 'cut:bill']);
rep('с множителем  ', ['home', 'asset', 'reel', 'add:study', 'cut:bill', 'up:mult']);
rep('все улучшения ', ['home', 'asset', 'reel', 'add:study', 'cut:bill', 'up:mult', 'up:star', 'up:insure', 'up:coach']);
