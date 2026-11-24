/* Подбор чисел рекламных бонусов: core.js с подменёнными константами кладётся в кэш require,
   дальше обычный tools/sim-variant.js (все его переменные работают).
   Пример: AD=16 GOALS=1 ONLY=smart+ad L=0 LIFE=1 N=600 node tools/sim-consts.js
   AD=лимит STARR=отдых звезды SALEC=скидка SALER=отдых скидки

   Рычаги трудности (docs/BALANCE-REPORT.md, «Рычаги трудности»). Без переменной ничего не меняется.
   END=<возраст>        конец жизни вместо 65
   BILLN=<карт>         карт Счетов в стартовой колоде (сейчас 4)
   BILLP=<пара>,<тройка> сколько зарплат забирают пара и тройка Счетов (сейчас 1,4)
   HD=<×>               здоровье падает быстрее во столько раз
   GYM=<×>              спортзал дороже во столько раз
   HF=<0>,<до25>,<до50> множитель зарплаты при здоровье 0, ниже 25, ниже 50 (сейчас 0,0.5,0.75)
   UPKH=<%>             квартплата: в месяц столько процентов цены текущего жилья
   UPKJ=<×>             расходы должности: в месяц (оклад должности − оклад первой) × столько
   INFL=<доля>          деньги на счёте дешевеют: в конце месяца минус эта доля положительного остатка
   CRASH=<шанс>,<мес>,<глубина>  обвал рынка: каждый месяц с этим шансом на столько месяцев доход активов
                        (и Монеты) × (1 − глубина); глубина больше 1 — активы приносят убыток
   JSK=<k>              навык для должности i растёт на k·i/9 (верхние должности труднее, нижние как были)
   JPAY=<k>             оклад должности i меньше на k·i/9 (кривая зарплат положе сверху)
   FORKLOSS=<×>         денежные потери в развилках больше во столько раз
   Правки другой ветки (balance-proposals): HF0=<множитель при здоровье 0>, STUDY0=<карт Учёбы>,
   GOLDL=<удача золота>, BOOSTR=<отдых Удачного года>; THEIRS=1 — все четыре сразу (0.25, 4, 35, 36).
   Ослабление рекламы: BOOSTLEN=<месяцев Удачного года> (сейчас 12), BOOSTK=<множитель доходов> (сейчас 2).
   STAR0=<месяц> — первая «Зарядить звезду» доступна не раньше этого месяца жизни (сейчас 0).
   ADOFF=boost,sale,star,trait — бот не видит эти рекламные бонусы (раздельный вклад каждого).
   Стартовые деньги сценариев: SCMONEY=loan:-6000,flat:-3000,late:15000 (сейчас -12000, -12000, 15000).
   SCSET=flat.skill:60,loan.health:70 — любое число сценария (age, money, skill, health, network, home, job). */
const fs = require('fs'), path = require('path'), Module = require('module');
const W = path.join(__dirname, '..');
const file = path.join(W, 'src', 'core.js');
const E = process.env;
if (E.THEIRS) { E.HF0 = E.HF0 || '0.25'; E.STUDY0 = E.STUDY0 || '4'; E.GOLDL = E.GOLDL || '35'; E.BOOSTR = E.BOOSTR || '36'; }
let src = fs.readFileSync(file, 'utf8');
const sub = (re, val) => { if (val == null || val === '') return; if (!re.test(src)) throw new Error('нет ' + re); src = src.replace(re, val); };
sub(/const AD_LIMIT = \d+;/, E.AD && `const AD_LIMIT = ${E.AD};`);
sub(/const STAR_REST = \d+;/, E.STARR && `const STAR_REST = ${E.STARR};`);
sub(/const SALE_CUT = [\d.]+, SALE_REST = \d+;/, (E.SALEC || E.SALER) && `const SALE_CUT = ${E.SALEC || 0.2}, SALE_REST = ${E.SALER || 24};`);

sub(/ads: 0, starAt: 0,/, E.STAR0 && `ads: 0, starAt: ${+E.STAR0},`);
sub(/s\.starAt = 0; s\.saleAt = 0;/, E.STAR0 && `s.starAt = ${+E.STAR0}; s.saleAt = 0;`);
/* рычаги трудности */
const nums = (v) => v.split(',').map(Number);
sub(/const END_AGE = \d+;/, E.END && `const END_AGE = ${+E.END};`);
sub(/(const START_DECK = \{[^}]*bill: )\d+/, E.BILLN && `$1${+E.BILLN}`);
sub(/(const START_DECK = \{[^}]*study: )\d+/, E.STUDY0 && `$1${+E.STUDY0}`);
sub(/billPair: \d+, billTriple: \d+/, E.BILLP && `billPair: ${nums(E.BILLP)[0]}, billTriple: ${nums(E.BILLP)[1]}`);
sub(/return base \* \(1 - 0\.1 \* s\.home\)/, E.HD && `return ${+E.HD} * base * (1 - 0.1 * s.home)`);
sub(/Math\.round\(baseSalary\(s\) \* 0\.2\)/, E.GYM && `Math.round(baseSalary(s) * 0.2 * ${+E.GYM})`);
if (E.HF || E.HF0) {
  const [z, a, b] = E.HF ? nums(E.HF) : [+E.HF0, 0.5, 0.75];
  sub(/if \(s\.health <= 0\) return 0;\s*if \(s\.health < 25\) return 0\.5;\s*if \(s\.health < 50\) return 0\.75;/,
    `if (s.health <= 0) return ${z};\n    if (s.health < 25) return ${a};\n    if (s.health < 50) return ${b};`);
}
sub(/const GOLD_LUCK = \d+;/, E.GOLDL && `const GOLD_LUCK = ${+E.GOLDL};`);
sub(/BOOST_LEN = 12, BOOST_REST = \d+;/, (E.BOOSTR || E.BOOSTLEN) && `BOOST_LEN = ${+E.BOOSTLEN || 12}, BOOST_REST = ${+E.BOOSTR || 36};`);
sub(/const k = s\.boost > 0 \? 2 : 1;/, E.BOOSTK && `const k = s.boost > 0 ? ${+E.BOOSTK} : 1;`);
if (E.UPKH || E.UPKJ || E.INFL || E.CRASH) {
  /* расходы в месяц и обвал рынка вставляются в resolve: там, где приходят зарплата и доход активов */
  const [cp, cl, cd] = E.CRASH ? nums(E.CRASH) : [0, 0, 0];
  const upk = `Math.round(${+E.UPKH || 0} / 100 * HOMES[s.home].cost + ${+E.UPKJ || 0} * (JOBS[s.job].pay - JOBS[0].pay))`;
  const crash = E.CRASH ? `if (!s._cr && rng() < ${cp}) s._cr = ${cl}; const _cf = s._cr ? 1 - ${cd} : 1; if (s._cr) s._cr -= 1;` : 'const _cf = 1;';
  sub(/const inc = passive\(s\) \* k;/, `${crash} const inc = Math.round(passive(s) * k * _cf);`);
  sub(/s\.money \+= pay \+ inc;/, `s.money += pay + inc - ${upk};`);
  if (E.INFL) sub(/s\.health = Math\.max\(0, s\.health - healthDecay\(s\)\);/, `if (s.money > 0) s.money -= Math.round(s.money * ${+E.INFL});\n    s.health = Math.max(0, s.health - healthDecay(s));`);
}
sub(/if \(isGold\) s\.flags\.gold \+= 1;\n    const delta = s\.money - before;/, E.FORKLOSS && `if (isGold) s.flags.gold += 1;\n    if (s.money < before) s.money = Math.round(before + (s.money - before) * ${+E.FORKLOSS});\n    const delta = s.money - before;`);

const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
m._compile(src, file); m.loaded = true;
require.cache[file] = m;
/* таблицы должностей меняются уже в загруженном модуле: Core.JOBS — те же объекты */
const Core = m.exports;
if (E.JSK) Core.JOBS.forEach((j, i) => { j.skill = Math.round(j.skill * (1 + +E.JSK * i / 9)); });
if (E.SCMONEY) E.SCMONEY.split(',').forEach((kv) => { const [id, v] = kv.split(':'); if (!Core.SCENARIOS[id]) throw new Error('нет сценария ' + id); Core.SCENARIOS[id].money = +v; });
if (E.SCSET) E.SCSET.split(',').forEach((kv) => { const [k, v] = kv.split(':'), [id, f] = k.split('.'); if (!Core.SCENARIOS[id] || !(f in Core.SCENARIOS[id])) throw new Error('нет ' + k); Core.SCENARIOS[id][f] = +v; });
if (E.ADOFF) for (const a of E.ADOFF.split(',')) {
  const f = { boost: 'boostReady', sale: 'saleReady', star: 'starReady', trait: 'extraTrait' }[a];
  if (!f || !Core[f]) throw new Error('нет бонуса ' + a);
  Core[f] = () => false;
}
if (E.JPAY) Core.JOBS.forEach((j, i) => { j.pay = Math.round(j.pay * (1 - +E.JPAY * i / 9)); });
console.log(`# AD=${E.AD || '-'} STARR=${E.STARR || '-'} SALEC=${E.SALEC || '-'} SALER=${E.SALER || '-'} (- = как в core.js)`);
const LEVERS = ['END', 'BILLN', 'BILLP', 'HD', 'GYM', 'HF', 'UPKH', 'UPKJ', 'INFL', 'CRASH', 'JSK', 'JPAY', 'FORKLOSS', 'HF0', 'STUDY0', 'GOLDL', 'BOOSTR', 'BOOSTLEN', 'BOOSTK', 'SCMONEY', 'ADOFF', 'STAR0', 'SCSET'].filter((k) => E[k]);
if (LEVERS.length) console.log('# рычаги: ' + LEVERS.map((k) => `${k}=${E[k]}`).join(' '));
require(path.join(W, 'tools', 'sim-variant.js'));
