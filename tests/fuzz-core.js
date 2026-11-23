/* Случайные жизни на чистой логике: любые действия в любом порядке, после каждого шага проверяются инварианты. */
const Core = require('../src/core.js');
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const bad = {};
const note = (k, d) => { if (!bad[k]) { bad[k] = { n: 0, d }; } bad[k].n += 1; };
const KINDS = ['job', 'gym', 'home', 'asset', 'reel', 'add:study', 'add:health', 'add:network', 'add:chance', 'add:wild', 'add:work', 'add:coin', 'add:bill', 'cut:study', 'cut:health', 'cut:network', 'cut:chance', 'cut:bill', 'cut:work', 'cut:coin', 'cut:wild', 'up:mult', 'up:star', 'up:insure', 'up:coach', 'up:nope', 'nope', ''];
function check(s, where) {
  const fin = (v) => typeof v === 'number' && isFinite(v);
  for (const k of ['money', 'month', 'job', 'skill', 'health', 'network', 'home', 'assets', 'charge', 'boost', 'boostAt', 'ms', 'peak', 'earned', 'ads', 'starAt', 'saleAt']) if (!fin(s[k])) note('не число: ' + k, where);
  if (s.health < 0 || s.health > 100) note('здоровье вне 0..100', where + ' ' + s.health);
  if (s.skill < 0 || s.network < 0) note('навык или связи ниже нуля', where);
  for (const k of Core.SYMBOLS) { if (!Number.isInteger(s.deck[k]) || s.deck[k] < Core.MIN_CARDS[k]) note('карты ниже минимума: ' + k, where + ' ' + s.deck[k]); }
  if (s.charge > Core.chargeMax(s) || s.charge < 0) note('заряд звезды вне границ', where);
  if (!Number.isInteger(s.ads) || s.ads < 0 || s.ads > Core.AD_LIMIT) note('счётчик рекламы вне 0..лимита', where + ' ' + s.ads);
  if (typeof s.sale !== 'boolean' || typeof s.trait4 !== 'boolean') note('флаги бонусов не логические', where);
  if (s.traitOptions && new Set(s.traitOptions).size !== s.traitOptions.length) note('черты повторяются', where);
  if (s.sc !== Core.SC_BASE && !Core.SC_IDS.includes(s.sc)) note('неизвестный сценарий', where + ' ' + s.sc);
  if (s.scOptions && s.status === 'playing' && s.month > 0 && !Core.SCENARIOS[s.sc]) note('выбор старта посреди жизни', where);
  if (s.month > Core.TOTAL) note('месяц больше конца жизни', where);
  if (s.status === 'playing' && s.month >= Core.TOTAL) note('жизнь не закончилась в 65', where);
  if (s.status !== 'playing' && s.fork) note('развилка после конца жизни', where);
  if (s.wonAt != null && !s.won) note('нет снимка миллиона', where);
  if (s.status === 'lost' && s.wonAt != null) note('проигрыш с миллионом', where);
  if ('_gold' in s) note('утёк служебный флаг _gold', where);
  if (s.job < 0 || s.job >= Core.JOBS.length || s.home < 0 || s.home >= Core.HOMES.length || s.assets > Core.ASSETS.length) note('индекс вне списка', where);
  if (s.status === 'playing') {
    const o = Core.odds(s);
    const sum = Core.SYMBOLS.reduce((a, k) => a + o[k].p, 0);
    if (Math.abs(sum - 1) > 1e-9) note('шансы символов не дают 1', where + ' ' + sum);
    if (!(o.any >= 0 && o.any <= 1 + 1e-9)) note('шанс события вне 0..1', where + ' ' + o.any);
    for (const k of Core.SYMBOLS) for (const f of ['pair', 'triple', 'quad']) if (!(o[k][f] >= 0 && o[k][f] <= 1)) note('шанс комбинации вне 0..1', where);
    if (!fin(Core.expected(s))) note('средний доход не число', where);
    if (!fin(Core.salary(s)) || !fin(Core.passive(s)) || Core.salary(s) < 0) note('зарплата или пассив сломаны', where);
    for (const kind of KINDS) { const c = Core.costOf(s, kind); if (c != null && (!fin(c) || c < 0)) note('цена сломана: ' + kind, where + ' ' + c); }
    /* скидка за рекламу: только на покупки вкладки, не выше обычной цены и не ниже нуля */
    const t = JSON.parse(JSON.stringify(s)); t.sale = !t.sale;
    for (const kind of KINDS) {
      const a = Core.costOf(s, kind), b = Core.costOf(t, kind), on = s.sale ? a : b, off = s.sale ? b : a;
      if ((on == null) !== (off == null)) note('скидка меняет доступность: ' + kind, where);
      else if (on != null && (on < 0 || on > off || (!Core.onSale(kind) && on !== off))) note('скидка считает не так: ' + kind, where + ` ${on}/${off}`);
    }
  }
  const txt = JSON.stringify(s);
  if (/null/.test(JSON.stringify([s.money, s.health, s.skill]))) note('NaN в сохранении', where);
  const back = JSON.parse(txt);
  if (JSON.stringify(back) !== txt) note('сохранение не восстанавливается', where);
}
/* автопокупки: та же act() по тем же ценам; в минус не уводят, колоду, фокус, звезду, рекламу и развилки не трогают */
let autoLives = 0, autoBought = 0;
function autoCheck(s, rules, where) {
  const t = JSON.parse(JSON.stringify(s)), m0 = s.money;
  const got = Core.autoBuy(s, rules);
  if (!Array.isArray(got)) { note('автопокупки вернули не список', where); return; }
  autoBought += got.length;
  if ((t.fork || t.traitOptions || t.status !== 'playing' || !rules.on) && got.length) note('автопокупка не вовремя', where);
  if (m0 >= 0 && s.money < 0) note('автопокупки увели деньги в минус', where + ` ${m0}->${s.money}`);
  for (const k of ['focus', 'ads', 'boost', 'boostAt', 'starAt', 'saleAt', 'sale', 'perks', 'fork', 'traitOptions', 'trait', 'trait4', 'month', 'skill', 'network']) if (JSON.stringify(t[k]) !== JSON.stringify(s[k])) note('автопокупки тронули ' + k, where);
  for (const b of got) {
    if (b.kind !== 'job' && !Core.AUTO_KINDS.includes(b.kind)) note('автопокупка вне списка: ' + b.kind, where);
    if (b.kind !== 'job' && t.sale) note('автопокупка потратила скидку', where);
    if (b.kind !== 'job' && !rules.kinds[b.kind]) note('автопокупка без правила: ' + b.kind, where);
    if (b.kind === 'job' && !rules.job) note('повышение без правила', where);
    const c = b.kind === 'job' ? 0 : Core.costOf(t, b.kind);
    if (c !== b.cost || (b.kind !== 'job' && t.money < c * rules.reserve)) note('автопокупка не по цене или без запаса: ' + b.kind, where + ` ${t.money}/${c}/${b.cost}`);
    if (!Core.act(t, b.kind)) note('ручная покупка того же не прошла: ' + b.kind, where);
  }
  if (JSON.stringify(t) !== JSON.stringify(s)) note('автопокупки не равны тем же ручным покупкам', where);
}
let scLives = 0;
let lives = 0, steps = 0, forks = 0, golds = 0, won = 0, lost = 0, retired = 0, maxMoney = 0;
const N = +process.argv[2] || 1500;
for (let i = 0; i < N; i++) {
  const rng = mulberry(77 + i);
  const perks = {}; for (const id of Core.PERK_IDS) if (rng() < 0.4) perks[id] = Math.floor(rng() * 8) - 1;
  /* половина жизней с купленными сценариями старта: выбор не меняет колоду и шансы, до выбора всё заперто */
  const scs = rng() < 0.5 ? Core.SC_IDS.filter(() => rng() < 0.6) : null;
  let s = Core.newState(rng() < 0.5 ? perks : null, 1 + Math.floor(rng() * 3), rng, scs);
  check(s, 'старт');
  if (s.scOptions) {
    scLives++;
    const t = JSON.parse(JSON.stringify(s));
    if (Core.spin(t, rng) || Core.act(t, 'gym') || Core.canCharge(t) || Core.startBoost(t) || (t.traitOptions && Core.pickTrait(t, t.traitOptions[0])) || Core.pickScenario(t, 'zzz')) note('до выбора старта что-то сработало', JSON.stringify(t.scOptions));
    const deck = JSON.stringify(s.deck), odds = JSON.stringify(Core.odds(s));
    const id = s.scOptions[Math.floor(rng() * s.scOptions.length)];
    if (!Core.pickScenario(s, id) || s.scOptions || Core.pickScenario(s, id)) note('выбор старта не сработал или повторился', id);
    if (JSON.stringify(s.deck) !== deck || JSON.stringify(Core.odds(s)) !== odds) note('сценарий изменил колоду или шансы', id);
    if (s.sc !== id || (Core.SCENARIOS[id] && Core.age(s) !== Core.SCENARIOS[id].age)) note('сценарий применён не так', id);
    check(s, 'старт: ' + id);
  } else if (scs && scs.length) note('купленные сценарии не предложены', scs.join());
  const style = Math.floor(rng() * 4);
  const rules = rng() < 0.4 ? Core.normAuto({ on: rng() < 0.9, reserve: Core.AUTO_RESERVES[Math.floor(rng() * Core.AUTO_RESERVES.length)], job: rng() < 0.5, kinds: Object.fromEntries(Core.AUTO_KINDS.map((k) => [k, rng() < 0.6])) }) : null;
  if (rules) autoLives++; /* 0 случайный, 1 жадный покупатель, 2 должник, 3 почти ничего не делает */
  let guard = 0;
  while (s.status === 'playing' && guard++ < 5000) {
    try {
      if (s.traitOptions) { if (rng() < 0.4) { const n = s.traitOptions.length, had = s.trait4, a0 = s.ads; const ok = Core.extraTrait(s, rng); if (ok !== (!had && s.traitOptions.length === n + 1 && s.ads === a0 + 1)) note('четвёртая черта сработала не так', 'жизнь ' + s.life); if (Core.extraTrait(s, rng)) note('четвёртая черта дважды', ''); } if (rng() < 0.2) Core.pickTrait(s, 'nope'); if (rng() < 0.2) Core.spin(s, rng); Core.pickTrait(s, s.traitOptions[Math.floor(rng() * s.traitOptions.length)]); check(s, 'черта'); continue; }
      if (s.fork) {
        forks++;
        const f = Core.fork(s);
        if (!f || /undefined|NaN/.test(JSON.stringify(f))) note('плохой текст развилки', s.fork);
        if (rng() < 0.1) Core.act(s, 'asset');
        if (rng() < 0.1) Core.spin(s, rng);
        const pick = rng() < 0.35 ? 'gold' : rng() < 0.6 ? 0 : 1;
        if (pick === 'gold') golds++;
        const r = Core.choose(s, pick, rng) || Core.choose(s, 0, rng) || Core.choose(s, 1, rng);
        if (!r) note('развилку нельзя закрыть', f.id);
        else if (/undefined|NaN/.test(JSON.stringify(r))) note('плохой итог развилки', f.id);
        check(s, 'развилка ' + f.id);
        continue;
      }
      const acts = style === 3 ? 0 : style === 1 ? 6 : Math.floor(rng() * 4);
      for (let a = 0; a < acts; a++) { Core.act(s, KINDS[Math.floor(rng() * KINDS.length)]); }
      if (style === 2 && rng() < 0.3) s.money -= Math.round(rng() * 5000);
      /* богатые жизни: так проверяются поздние состояния, все улучшения и миллионы */
      if (process.argv.includes('--rich') && rng() < 0.05) { s.money += Math.round(rng() * 400000); s.skill += Math.floor(rng() * 40); }
      if (rng() < 0.3) Core.setFocus(s, ['work', 'study', 'health', 'network', 'chance', 'nope'][Math.floor(rng() * 6)]);
      /* бонусы за рекламу в случайном порядке; лимит проверяет check() */
      const a0 = s.ads;
      if (rng() < 0.2) Core.startBoost(s);
      if (rng() < 0.2) { const c0 = s.charge; if (Core.chargeStar(s) && (s.charge !== Core.chargeMax(s) || c0 >= Core.chargeMax(s))) note('звезда заряжена не так', String(c0)); }
      if (rng() < 0.2) Core.startSale(s);
      if (s.ads - a0 > 3 || (a0 >= Core.AD_LIMIT && s.ads !== a0)) note('бонус прошёл мимо лимита', `${a0}->${s.ads}`);
      if (rng() < 0.01) s.ads = Core.AD_LIMIT - 1;
      if (s.wonAt != null && rng() < 0.01) { Core.retire(s); retired++; check(s, 'пенсия'); continue; }
      const charged = Core.canCharge(s) && rng() < 0.5 ? ['work', 'study', 'health', 'network', 'chance'][Math.floor(rng() * 5)] : null;
      const res = Core.spin(s, rng, rng() < 0.15 ? { auto: true } : charged ? { charged } : null);
      if (!res && !(charged === 'chance')) note('спин не сработал', 'месяц ' + s.month);
      if (!res && charged === 'chance') Core.spin(s, rng);
      if (res && /undefined|NaN/.test(JSON.stringify(res))) note('плохой итог спина', JSON.stringify(res).slice(0, 120));
      steps++;
      check(s, 'спин');
      if (rules) { autoCheck(s, rules, 'автопокупки, месяц ' + s.month); check(s, 'автопокупки'); }
      if (rng() < 0.002) { s = Core.migrate(JSON.parse(JSON.stringify(s))); check(s, 'пересохранение'); }
    } catch (e) { note('исключение: ' + e.message, (e.stack || '').split('\n')[1]); break; }
  }
  if (guard >= 5000) note('жизнь не заканчивается', 'стиль ' + style);
  lives++; maxMoney = Math.max(maxMoney, s.peak);
  if (s.status === 'won') won++; else if (s.status === 'lost') lost++;
  try { const g = Core.goalsMet(s), p = Core.lifePoints(s); if (!Array.isArray(g) || !(p >= 1 && p <= 5)) note('цели или опыт сломаны', String(p)); } catch (e) { note('исключение в целях: ' + e.message, ''); }
}
console.log(`жизней с автопокупками ${autoLives}, автопокупок ${autoBought}; со сценарием старта ${scLives}`);
console.log(`жизней ${lives}, спинов ${steps}, развилок ${forks} (золотых ${golds}), миллион ${won}, проигрыш ${lost}, пенсий ${retired}, максимум денег $${Math.round(maxMoney / 1e6)} млн`);
const keys = Object.keys(bad);
console.log(keys.length ? 'ПРОБЛЕМЫ:\n' + keys.map((k) => `  ${bad[k].n}×  ${k}  [${bad[k].d}]`).join('\n') : 'нарушений нет');
