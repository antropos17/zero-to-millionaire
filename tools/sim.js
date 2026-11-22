/* Симулятор баланса: прогоняет сотни жизней с разными стратегиями игрока. */
const Core = require('../src/core.js');

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* подбор баланса: T=порогиНавыка,ростУчёбы,ценаУчёбы,зарплаты,доходАктивов */
if (process.env.T) {
  const [ts, sg, sb, ps, as, cp] = process.env.T.split(',').map(Number);
  if (cp) { Core.PAY.coinPair *= cp; Core.PAY.coinTriple *= cp; }
  Core.JOBS.forEach((j) => { j.skill = Math.round(j.skill * ts); j.pay = Math.round(j.pay * (ps || 1)); });
  Core.CARD_GROW.study = sg; Core.CARD_BASE.study = sb;
  Core.ASSETS.forEach((a) => { a.income = Math.round(a.income * (as || 1)); });
}
const promote = (s) => { while (Core.act(s, 'job')); };
const SHOP = ['asset', 'home', 'reel', 'add:study', 'cut:bill', 'up:mult', 'up:star', 'up:insure', 'up:coach', 'add:wild'];

const policies = {
  /* Игрок ушёл: никто ничего не нажимает, развилки проходят мимо */
  afk: { auto: true, turn() {}, fork: () => 1 },

  /* Только бесплатные повышения, фокус не трогает, от развилок отказывается */
  lazy: { turn: promote, fork: () => 1 },

  /* Обычный человек: покупает самое дешёвое при двойном запасе, фокус меняет редко, звезду тратит на фокус */
  casual: {
    turn(s) {
      promote(s);
      if (s.health < 40) Core.act(s, 'gym');
      const nj = Core.nextJob(s);
      Core.setFocus(s, s.health < 35 ? 'health' : (nj && Core.age(s) < 40 ? 'study' : 'work'));
      if (s.money > Core.GOAL * 0.6) return;
      const opts = SHOP.filter((k) => k !== 'add:study' || (nj && s.bought.study < 6)).map((k) => [k, Core.costOf(s, k)])
        .filter((o) => o[1] != null && s.money >= o[1] * 2).sort((a, b) => a[1] - b[1]);
      if (opts.length) Core.act(s, opts[0][0]);
    },
    fork(s, f) { return ['overtime', 'sidejob', 'mentor', 'conference', 'hackathon', 'freecourse', 'nightshift', 'taxrefund', 'wedding', 'kitten', 'speaker', 'mentoring', 'heart', 'wallet'].includes(f.id) && f.options[0].enabled && s.health > 45 ? 0 : 1; },
    charge: (s) => s.focus,
    trait: (opts) => opts[0],
  },

  /* Покупает всё подряд, но фокус и звезду не трогает вообще */
  nofocus: {
    turn(s) {
      promote(s);
      if (s.health < 40) Core.act(s, 'gym');
      if (s.money > Core.GOAL * 0.6) return;
      const opts = SHOP.map((k) => [k, Core.costOf(s, k)]).filter((o) => o[1] != null && s.money >= o[1] * 2).sort((x, y) => x[1] - y[1]);
      if (opts.length) Core.act(s, opts[0][0]);
    },
    fork: () => 1,
  },

  /* Внимательный игрок: считает окупаемость, держит здоровье, собирает колоду под задачу */
  smart: {
    turn(s) {
      promote(s);
      if (s.health < 55) Core.act(s, 'gym');
      const nj = Core.nextJob(s);
      const studying = nj && Core.monthsLeft(s) > 120 && s.money < Core.GOAL * 0.5;
      Core.setFocus(s, studying ? 'study' : 'work');
      const left = Core.monthsLeft(s);
      for (let guard = 0; guard < 20; guard++) {
        if (s.money > Core.GOAL * 0.7) break;
        const ev = Core.expected(s), inc = ev - Core.passive(s);
        const gainOf = (kind) => { const t = JSON.parse(JSON.stringify(s)); return Core.act(t, kind) ? Core.expected(t) - ev : 0; };
        const opts = [];
        for (const k of ['asset', 'home', 'reel', 'cut:bill', 'up:mult', 'up:insure', 'up:star', 'up:coach', 'add:wild']) { if (process.env.NO === k) continue; const c = Core.costOf(s, k); if (c != null) opts.push({ k, cost: c, per: gainOf(k) + (k === 'reel' ? inc * 0.04 : k === 'up:mult' && studying ? inc * 0.03 : k === 'up:star' ? inc * 0.03 : k === 'up:coach' ? inc * 0.02 : 0) }); }
        if (studying) {
          const c = Core.costOf(s, 'add:study'), need = nj.skill - s.skill;
          const o = Core.odds(s), t = JSON.parse(JSON.stringify(s)); Core.act(t, 'add:study'); const o2 = Core.odds(t);
          const rate = (x) => x.study.pair + 4 * x.study.triple + 8 * x.study.quad;
          if (c != null && need > 0) opts.push({ k: 'add:study', cost: c, per: (rate(o2) - rate(o)) * inc * 0.012 * 40 });
        } else if (s.deck.study > 1 && !nj) { const c = Core.costOf(s, 'cut:study'); if (c != null) opts.push({ k: 'cut:study', cost: c, per: gainOf('cut:study') }); }
        const horizon = Math.min(left, 110);
        const good = opts.filter((o) => o.cost <= s.money && o.per * horizon > o.cost * 1.2).sort((a, b) => a.cost / a.per - b.cost / b.per);
        if (!good.length || !Core.act(s, good[0].k)) break;
      }
    },
    fork(s, f) {
      if (!f.options[0].enabled) return 1;
      const id = f.id, L = Core.luck(s);
      if (['lottery', 'scam', 'bet', 'gamerelease', 'earlyout', 'inheritance', 'mortgage', 'carrepair'].includes(id)) return id === 'carrepair' ? 0 : 1;
      if (id === 'startup') return L >= 5 ? 0 : 1;
      if (id === 'crypto') return L >= 12 ? 0 : 1;
      if (id === 'insider' || id === 'cafe') return L >= 8 ? 0 : 1;
      if (['overtime', 'sidejob', 'blog', 'nightshift', 'hackathon', 'freecourse', 'speaker', 'mentoring', 'taxrefund'].includes(id)) return s.health > 55 ? 0 : 1;
      if (['mentor', 'mba', 'sale90', 'vacancy'].includes(id)) return Core.nextJob(s) && Core.monthsLeft(s) > 100 ? 0 : 1;
      if (['conference', 'volunteer', 'reunion', 'podcast', 'college', 'roommate'].includes(id)) return s.network < Core.NET_CAP && Core.monthsLeft(s) > 100 ? 0 : 1;
      if (['marathon', 'burnout', 'doctor', 'heart', 'kitten', 'dacha', 'wedding', 'child', 'midlife', 'roadtrip'].includes(id)) return s.health < 75 || ['kitten', 'wedding', 'child', 'heart'].includes(id) ? 0 : 1;
      return id === 'wallet' || id === 'loan' ? 0 : 1;
    },
    charge(s) {
      if (s.health < 45) return 'health';
      return Core.nextJob(s) && Core.monthsLeft(s) > 120 && s.money < Core.GOAL * 0.5 ? 'study' : 'work';
    },
    trait: (opts) => ['scholar', 'financier', 'workaholic', 'frugal', 'heir', 'athlete', 'lucky', 'social'].find((t) => opts.includes(t)),
  },
};

/* те же игроки, но вместо обычного «да» всегда берут золотой вариант */
policies['casual+ad'] = Object.assign({}, policies.casual, { ads: true });
policies['smart+ad'] = Object.assign({}, policies.smart, { ads: true });
/* берёт золотой вариант в каждой развилке, где он есть */
policies.allgold = Object.assign({}, policies.smart, { ads: true, fork: () => 0 });

const PERK_SETS = { 0: {}, 1: { genes: 2, cash: 2, school: 1, tough: 1, sale: 1, ties: 1 }, 2: { cash: 4, genes: 5, tough: 3, ties: 3, school: 3, sale: 3, star: 1, traits: 2, joker: 1 } };
const STAY = !!process.env.STAY;
function run(name, legacy, seed, life) {
  const rng = mulberry(seed), p = policies[name];
  const s = Core.newState(PERK_SETS[legacy], life || 1, rng);
  if (s.traitOptions) Core.pickTrait(s, p.trait ? p.trait(s.traitOptions) : s.traitOptions[0]);
  let forks = 0, charges = 0;
  while (s.status === 'playing') {
    if (s.wonAt != null && !STAY) { Core.retire(s); break; }
    p.turn(s);
    if (p.ads && Core.boostReady(s)) Core.startBoost(s);
    const pick = p.charge && Core.canCharge(s) ? p.charge(s) : null;
    if (pick) charges++;
    Core.spin(s, rng, p.auto ? { auto: true } : pick ? { charged: pick } : null);
    if (s.fork) { forks++; const f = Core.fork(s), c = p.fork(s, f); if (!Core.choose(s, p.ads && c === 0 && f.gold && f.gold.enabled ? 'gold' : c, rng)) Core.choose(s, 1, rng); }
  }
  s._forks = forks; s._charges = charges;
  return s;
}

function report(name, legacy, life, n = +process.env.N || 600) {
  let wins = 0; const ages = [], finals = [], jobs = [], decks = [], peaks = []; let forks = 0, charges = 0, reel = 0; const goals = {};
  for (let i = 0; i < n; i++) {
    const s = run(name, legacy, 1000 + i, life);
    forks += s._forks; charges += s._charges; reel += s.reels4 ? 1 : 0;
    if (s.wonAt != null) { wins++; ages.push(Core.START_AGE + s.wonAt / Core.YEAR); } else finals.push(s.money);
    peaks.push(s.peak);
    jobs.push(s.job); decks.push(Core.deckSize(s));
    Core.goalsMet(s).forEach((g) => { goals[g] = (goals[g] || 0) + 1; });
  }
  const sort = (a) => a.sort((x, y) => x - y);
  sort(ages); sort(finals); sort(jobs); sort(decks); sort(peaks);
  const q = (a, p) => (a.length ? a[Math.floor((a.length - 1) * p)] : NaN);
  console.log(
    `${name.padEnd(9)} наследие=${legacy}  побед ${(100 * wins / n).toFixed(0).padStart(3)}%` +
    `  миллион p10/med/p90: ${q(ages, 0.1).toFixed(0)}/${q(ages, 0.5).toFixed(0)}/${q(ages, 0.9).toFixed(0)}` +
    `  проигравшие med: $${Math.round(q(finals, 0.5))}  должность: ${q(jobs, 0.5)}  развилок: ${(forks / n).toFixed(1)}  звёзд: ${(charges / n).toFixed(1)}  колода: ${q(decks, 0.5)}` + (STAY ? `  к 65: med $${(q(peaks, 0.5) / 1e6).toFixed(1)} млн, $5M ${Math.round(100 * peaks.filter((x) => x >= 5e6).length / n)}%, $25M ${Math.round(100 * peaks.filter((x) => x >= 2.5e7).length / n)}%, $100M ${Math.round(100 * peaks.filter((x) => x >= 1e8).length / n)}%` : '')
  );
  return goals;
}

function trace(name, legacy, seed) {
  const rng = mulberry(seed), p = policies[name];
  const s = Core.newState(PERK_SETS[legacy], 1, rng);
  const rows = [];
  while (s.status === 'playing') {
    p.turn(s);
    const pick = p.charge && Core.canCharge(s) ? p.charge(s) : null;
    Core.spin(s, rng, p.auto ? { auto: true } : pick ? { charged: pick } : null);
    if (s.fork) Core.choose(s, p.fork(s, Core.fork(s)), rng);
    if (s.month % 48 === 0) rows.push(`${Core.age(s)}: $${Math.round(s.money)} job${s.job} skill${s.skill} hp${Math.round(s.health)} net${s.network} home${s.home} assets${s.assets} 4б=${s.reels4 ? 1 : 0} колода ${Core.SYMBOLS.map((k) => s.deck[k]).join('/')} sal${Core.salary(s)} pas${Core.passive(s)} focus=${s.focus}`);
  }
  console.log(`--- ${name} опыт=${legacy} -> ${s.status} в ${Core.age(s)}`);
  console.log(rows.join('\n'));
}

/* проверка формул шансов честным перебором, в том числе с докупленными картами */
if (!process.env.ONLY) for (const [f, r4, extra] of [['work', false, 0], ['study', false, 4], ['work', true, 0], ['study', true, 4]]) {
  const s = Core.newState(); s.focus = f; s.reels4 = r4; s.deck.study += extra; s.deck.coin = 3;
  const o = Core.odds(s);
  let hit = 0; const N = 200000; const rr = mulberry(5);
  for (let i = 0; i < N; i++) { const e = Core.evaluate(s, Core.rollReels(s, rr)); if (e.combos.length || e.sets.length) hit++; }
  console.log(`фокус ${String(f).padEnd(5)} барабанов ${o.reels} карт ${Core.deckSize(s)}  любое событие ${(o.any * 100).toFixed(1)}% (перебор ${(100 * hit / N).toFixed(1)}%)`);
}
/* проверка формулы среднего дохода против честной симуляции */
if (!process.env.ONLY) {
  const s = Core.newState(); Object.assign(s, { job: 4, skill: 40, network: 10, home: 2, assets: 3, reels4: true }); s.deck.coin = 3; s.deck.work = 10; s.deck.wild = 1; s.up.mult = 2; s.up.insure = 1;
  const ev = Core.expected(s); let sum = 0; const N = 300000, rr = mulberry(9);
  for (let i = 0; i < N; i++) { const t = JSON.parse(JSON.stringify(s)); sum += Core.spin(t, rr, { auto: true }).delta; }
  console.log(`средний доход: формула ${ev.toFixed(1)}, симуляция ${(sum / N).toFixed(1)}`);
}
/* каждая развилка хотя бы иногда доступна и не роняет игру */
if (!process.env.ONLY) {
  const seen = {}; const rr = mulberry(3);
  for (let i = 0; i < 300; i++) { const s = run(i % 2 ? 'smart' : 'casual', 0, 5000 + i); s.lastForks.forEach(() => {}); }
  for (let a = 18; a < 65; a += 1) for (let k = 0; k < 40; k++) {
    const s = Core.newState(); Object.assign(s, { month: (a - 18) * 12, money: 20000 + k * 3000, job: Math.min(9, Math.floor((a - 18) / 4)), home: k % 5, network: k % 12, health: 40 + (k * 7) % 60, ms: 3 });
    for (const id of Core.FORK_IDS) if (Core.forkAllowed(s, id)) {
      seen[id] = (seen[id] || 0) + 1;
      for (const idx of [0, 1]) { const t = JSON.parse(JSON.stringify(s)); t.fork = id; const f = Core.fork(t); if (/undefined|NaN/.test(JSON.stringify(f))) console.log('ПЛОХОЙ ТЕКСТ', id, JSON.stringify(f)); Core.choose(t, idx, rr); if (!isFinite(t.money) || !isFinite(t.health)) console.log('ПЛОХОЕ СОСТОЯНИЕ', id); }
    }
  }
  const never = Core.FORK_IDS.filter((id) => !seen[id]);
  console.log(`развилок всего ${Core.FORK_IDS.length}, недоступных ни разу: ${never.length ? never.join(', ') : 'нет'}`);
}
for (const p of (process.env.ONLY ? [process.env.ONLY] : ['afk', 'lazy', 'nofocus', 'casual', 'smart', 'casual+ad', 'smart+ad', 'allgold'])) for (const [l, life] of p === 'afk' ? [[0, 1]] : (process.env.L ? [[+process.env.L, 2]] : [[0, 1], [1, 2], [2, 2]])) {
  const g = report(p, l, life);
  if (process.argv.includes('--goals') && (p === 'casual' || p === 'smart') && life === 1) console.log('   цели, % жизней:', Core.GOALS.map((x) => `${x.id} ${Math.round((g[x.id] || 0) / 6)}`).join('  '));
}
if (process.argv.includes('--trace')) { trace('smart', 0, 7); trace('casual', 0, 7); trace('lazy', 0, 7); }
