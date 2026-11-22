/* Обёртка над tools/sim.js для отчёта о балансе. sim.js не меняется: его текст
   загружается, в нём подменяются две строки, и он запускается как обычно.

   SEED=<число>  сдвиг зёрен: жизни берут зёрна 1000+SEED+i вместо 1000+i
                 (в sim.js зёрна зашиты, повторный запуск даёт те же цифры)
   BLOCK=<покупка>  запрет покупки для ЛЮБОЙ стратегии: Core.costOf отвечает «нельзя».
                 В sim.js NO= работает только у smart и её вариантов, casual его не видит.
   CHECKS=1      только проверочные блоки sim.js (шансы, средний доход, развилки), без стратегий
   Остальные переменные (ONLY, N, L, STAY) как у sim.js. */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const Core = require('../src/core.js');

if (process.env.BLOCK) {
  const orig = Core.costOf, block = process.env.BLOCK;
  Core.costOf = (s, k) => (k === block ? null : orig(s, k));
}

const file = path.join(__dirname, 'sim.js');
let src = fs.readFileSync(file, 'utf8');
const seedLine = 'const s = run(name, legacy, 1000 + i, life);';
if (!src.includes(seedLine)) throw new Error('sim.js изменился: строка с зерном не найдена');
src = src.replace(seedLine, `const s = run(name, legacy, 1000 + ${+process.env.SEED || 0} + i, life);`);
/* Стратегии «отдых»: casual~N играет как casual только каждый N-й год жизни,
   остальные годы игра крутится сама (как afk: развилки проходят мимо, звезда и покупки не трогаются). */
const allgold = 'policies.allgold = Object.assign({}, policies.smart, { ads: true, fork: () => 0 });';
if (!src.includes(allgold)) throw new Error('sim.js изменился: строка allgold не найдена');
src = src.replace(allgold, allgold + `
for (const N of [2, 3, 4]) {
  const p = Object.assign({}, policies.casual, {
    turn(s) { this._away = Math.floor(s.month / 12) % N !== 0; if (!this._away) policies.casual.turn(s); },
    charge(s) { return this._away ? null : s.focus; },
  });
  Object.defineProperty(p, 'auto', { get() { return this._away; } });
  policies['casual~' + N] = p;
}
/* lazyfocus: как lazy (только повышения, ничего не покупает, от развилок отказывается),
   но держит фокус на Учёбе, пока есть следующая должность, потом на Работе */
/* Раздельный вклад двух видов рекламы у casual: только «Удачный год» или только золотые варианты */
policies['casual+boost'] = Object.assign({}, policies.casual, { turn(s) { policies.casual.turn(s); if (Core.boostReady(s)) Core.startBoost(s); } });
policies['casual+gold'] = Object.assign({}, policies.casual, { ads: true, turn(s) { policies.casual.turn(s); s.boostAt = Infinity; } });
policies.lazyfocus ={ turn(s) { promote(s); Core.setFocus(s, Core.nextJob(s) ? 'study' : 'work'); }, fork: () => 1 };`);
/* GOALS=1: печатать цели первой жизни (флаг --goals) у любой стратегии, а не только у casual и smart.
   Проценты в sim.js считаются делением на 6, поэтому верны только при N=600. */
if (process.env.GOALS) {
  const goalsCond = "(p === 'casual' || p === 'smart') && life === 1";
  if (!src.includes(goalsCond)) throw new Error('sim.js изменился: условие печати целей не найдено');
  src = src.replace(goalsCond, 'life === 1');
  if (!process.argv.includes('--goals')) process.argv.push('--goals');
}
if (process.env.CHECKS) {
  const loop = "for (const p of (process.env.ONLY ?";
  if (!src.includes(loop)) throw new Error('sim.js изменился: цикл стратегий не найден');
  src = src.replace(loop, 'if (false) ' + loop);
  delete process.env.ONLY;
}

const m = new Module(file, module);
m.filename = file;
m.paths = Module._nodeModulePaths(path.dirname(file));
m._compile(src, file);
