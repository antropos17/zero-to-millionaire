/* Диагностика целей по возрасту: те же жизни и боты, что в tools/sim.js (его текст загружается без изменений
   поведения, отрезается только запуск отчёта), но по каждой жизни печатается возраст миллиона и что сделала реклама.
   Пример: ONLY=smart+ad N=600 node tools/goal-diag.js
   Переменные sim.js работают (L, LIFE, STAY, SC, NO, RESERVE ...). Свои:
   SEED=<сдвиг зёрен>  жизни берут зёрна 1000+SEED+i (как в sim-variant.js)
   FROM=<i> N=<сколько> диапазон жизней (для параллельных кусков)
   ADOFF=boost,sale,star,trait,gold  бот с рекламой не видит эти бонусы (gold — золотые варианты развилок)
   TRAITFIX=1          черта выбирается из трёх показанных, даже если реклама добавила четвёртую
                       (четвёртая черта считается в лимит, но не используется)
   JSON=1              по строке JSON на жизнь вместо сводки
   Свой бот unicorn: smart с рекламой, но фокус и звезда всегда на Учёбе, пока есть следующая должность,
   и докупает карты Учёбы (запускать со STAY=1: играет до 65).
   В сводке: доля по каждой цели, деньги/навык/должность в 35 и 40 лет (медиана и лучшие 5%), должность и жильё в конце. */
const fs = require('fs'), path = require('path'), Module = require('module');
const Core = require('../src/core.js');
const E = process.env;

const off = new Set((E.ADOFF || '').split(',').filter(Boolean));
for (const a of off) {
  const f = { boost: 'boostReady', sale: 'saleReady', star: 'starReady', trait: 'extraTrait', gold: null }[a];
  if (f === undefined) throw new Error('нет бонуса ' + a);
  if (f) Core[f] = () => false;
}
if (off.has('gold')) {
  const fork = Core.fork;
  Core.fork = (s) => { const f = fork(s); if (f && f.gold) f.gold = Object.assign({}, f.gold, { enabled: false }); return f; };
}
let traitShown = null;
if (E.TRAITFIX) {
  const ex = Core.extraTrait, pick = Core.pickTrait;
  Core.extraTrait = (s, rng) => { traitShown = s.traitOptions.slice(); return ex(s, rng); };
  Core.pickTrait = (s, id) => {
    if (traitShown && !traitShown.includes(id)) {
      const order = ['scholar', 'financier', 'workaholic', 'frugal', 'heir', 'athlete', 'lucky', 'social'];
      id = order.find((t) => traitShown.includes(t)) || traitShown[0];
    }
    traitShown = null; return pick(s, id);
  };
}

const file = path.join(__dirname, 'sim.js');
let src = fs.readFileSync(file, 'utf8');
const cut = src.indexOf('/* проверка формул шансов');
if (cut < 0) throw new Error('sim.js изменился: блок проверок не найден');
src = src.slice(0, cut) + '\nmodule.exports = { run, policies };\n';
const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(__dirname);
m._compile(src, file);
const { run, policies } = m.exports;
policies.unicorn = Object.assign({}, policies.smart, {
  ads: true,
  turn(s) {
    policies.smart.turn(s);
    Core.setFocus(s, Core.nextJob(s) ? 'study' : 'work');
    for (let g = 0; g < 5 && Core.nextJob(s); g++) { const c = Core.costOf(s, 'add:study'); if (c == null || s.money < c * 1.5 || !Core.act(s, 'add:study')) break; }
  },
  charge: (s) => (s.health < 45 ? 'health' : Core.nextJob(s) ? 'study' : 'work'),
});
/* снимок жизни в 35 и 40 лет (после спина, которым закончился 34-й / 39-й год) */
const SNAP = { 35: (35 - Core.START_AGE) * Core.YEAR, 40: (40 - Core.START_AGE) * Core.YEAR };
const spin = Core.spin;
Core.spin = (s, ...a) => { const r = spin(s, ...a); for (const k in SNAP) if (s.month === SNAP[k]) (s._snap = s._snap || {})[k] = { money: Math.round(s.money), skill: s.skill, job: s.job, home: s.home }; return r; };

const name = E.ONLY || 'smart', legacy = +E.L || 0, life = +E.LIFE || (legacy ? 2 : 1), n = +E.N || 600, from = +E.FROM || 0, seed0 = 1000 + (+E.SEED || 0);
if (!policies[name]) throw new Error('нет бота ' + name);
const rows = [];
for (let i = from; i < from + n; i++) {
  const s = run(name, legacy, seed0 + i, life);
  const r = { i, won: s.wonAt != null ? +(Core.START_AGE + s.wonAt / Core.YEAR).toFixed(2) : null, money: Math.round(s.money), peak: Math.round(s.peak), job: s.job, home: s.home, skill: s.skill,
    trait: s.trait, ads: s.ads, gold: s.flags.gold, end: Core.age(s), snap: s._snap || {}, goals: Core.goalsMet(s) };
  rows.push(r);
  if (E.JSON) console.log(JSON.stringify(r));
}
if (!E.JSON) {
  const qs = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) * p)] : NaN; };
  const ages = rows.filter((r) => r.won != null).map((r) => r.won);
  const q = (p) => (ages.length ? qs(ages, p).toFixed(1) : '-');
  const pct = (f) => Math.round(100 * rows.filter(f).length / rows.length);
  const hist = {}; ages.forEach((a) => { const k = Math.floor(a); hist[k] = (hist[k] || 0) + 1; });
  console.log(`${name} L=${legacy} LIFE=${life} N=${n} SEED=${E.SEED || 0} STAY=${E.STAY || '-'} SPEND=${E.SPEND || '-'} ADOFF=${E.ADOFF || '-'}  побед ${pct((r) => r.won != null)}%  возраст миллиона p1/p5/p10/med/p90 ${q(0.01)}/${q(0.05)}/${q(0.1)}/${q(0.5)}/${q(0.9)}`);
  console.log('  миллион по годам:', Object.keys(hist).map((k) => `${k}:${hist[k]}`).join(' '));
  console.log('  цели, %:', Core.GOALS.map((g) => `${g.id} ${pct((r) => r.goals.includes(g.id))}`).join('  '));
  for (const a of [35, 40]) {
    const sn = rows.map((r) => r.snap[a]).filter(Boolean);
    if (sn.length) console.log(`  в ${a}: деньги med/p95/max $${qs(sn.map((x) => x.money), 0.5)}/${qs(sn.map((x) => x.money), 0.95)}/${qs(sn.map((x) => x.money), 1)}  навык med/p95 ${qs(sn.map((x) => x.skill), 0.5)}/${qs(sn.map((x) => x.skill), 0.95)}  должность med/max ${qs(sn.map((x) => x.job), 0.5)}/${qs(sn.map((x) => x.job), 1)}`);
  }
  const cnt = (k) => { const h = {}; rows.forEach((r) => { h[r[k]] = (h[r[k]] || 0) + 1; }); return Object.keys(h).map((x) => `${x}:${h[x]}`).join(' '); };
  console.log(`  в конце: должность ${cnt('job')} | жильё ${cnt('home')} | навык med/p95/max ${qs(rows.map((r) => r.skill), 0.5)}/${qs(rows.map((r) => r.skill), 0.95)}/${qs(rows.map((r) => r.skill), 1)} | пик денег med/p95 $${qs(rows.map((r) => r.peak), 0.5)}/${qs(rows.map((r) => r.peak), 0.95)} | конец жизни med ${qs(rows.map((r) => r.end), 0.5)}`);
  if (rows.some((r) => r.trait)) console.log('  черты:', cnt('trait'));
}
