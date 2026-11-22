/* Крайние случаи: битые и старые сохранения, события под меню и под рекламой, очень большие числа, покупки магазина. */
const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(process.argv[2]);
const KEY = 'zero-to-millionaire-v2';
let failed = 0, passed = 0;
const ok = (name, cond, extra) => { if (cond) passed++; else { failed++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); } };
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const open = async (vp, save) => {
    const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 844 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(file);
    if (save !== undefined) {
      await p.evaluate(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem = () => {}; }, [KEY, save]);
      await p.reload();
    }
    await p.waitForSelector('#menuPlay', { state: 'visible' });
    return p;
  };
  const st = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.z2m.state())));
  const junk = (p) => p.evaluate(() => (document.body.innerText.match(/.{0,20}(undefined|NaN|\[object|Infinity).{0,20}/) || [''])[0]);
  const force = (p, q) => p.evaluate((arr) => { const q = arr.slice(); const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); }, q);

  /* 1. Битые сохранения: игра стартует чисто и идёт */
  const good = await (async () => { const p = await open(); await p.click('#menuPlay'); await p.waitForTimeout(500); await p.click('#modalBtn'); await p.evaluate(() => window.z2m.skip(30)); const raw = await p.evaluate((k) => localStorage.getItem(k), KEY); await p.close(); return JSON.parse(raw); })();
  const mut = (fn) => { const c = JSON.parse(JSON.stringify(good)); fn(c); return JSON.stringify(c); };
  const broken = {
    'не JSON': 'это не json {{{',
    'пустой объект': '{}',
    'null внутри': '{"S":null,"M":null}',
    'массив': '[1,2,3]',
    'мусор в настройках': mut((c) => { c.M = { auto: 'yes', speed: 99, log: 'x', tab: 'zzz', goals: 'no', pts: 'много', perks: [1, 2], best: 'never', sound: 1 }; }),
    'мусор в ленте': mut((c) => { c.M.log = [null, 5, { a: 'x', text: 3 }, { a: 20, text: 'ок', delta: 'NaN', tone: 'good' }, { a: 21, text: 'норм', delta: 5, tone: 'good' }]; }),
    'нет колоды': mut((c) => { delete c.S.deck; }),
    'колода из строк': mut((c) => { c.S.deck.work = '6'; }),
    'карт меньше минимума': mut((c) => { c.S.deck.bill = 0; }),
    'деньги строкой': mut((c) => { c.S.money = '100'; }),
    'здоровье 500': mut((c) => { c.S.health = 500; }),
    'месяц минус': mut((c) => { c.S.month = -5; }),
    'месяц за концом жизни': mut((c) => { c.S.month = 99999; }),
    'неизвестная развилка': mut((c) => { c.S.fork = 'nope'; }),
    'неизвестная черта': mut((c) => { c.S.trait = 'nope'; }),
    'черты мусором': mut((c) => { c.S.traitOptions = ['nope', 5]; }),
    'фокус мусором': mut((c) => { c.S.focus = 'bill'; }),
    'статус мусором': mut((c) => { c.S.status = 'dead'; }),
    'битая запись об опыте': mut((c) => { c.S.status = 'lost'; c.S.month = 564; c.S.paid = true; }),
    'миллион без снимка': mut((c) => { c.S.wonAt = 100; c.S.won = null; }),
    'версия из будущего': mut((c) => { c.S.v = 99; }),
    'улучшение выше максимума': mut((c) => { c.S.up.mult = 9; }),
    'покупки и тема мусором': mut((c) => { c.M.owned = { noads: true }; c.M.theme = { x: 1 }; }),
    'наследие мусором': mut((c) => { c.S.perks = { cash: 'x' }; c.M.perks = { cash: 99, nope: 3, genes: -4 }; }),
    'очень много денег': mut((c) => { c.S.money = 987654321012; c.S.peak = c.S.money; c.S.wonAt = 20; c.S.won = { reels4: false, assets: 0, debt: false, low: false, deck: 21, gold: 0 }; c.S.asked = true; }),
    'глубокий долг': mut((c) => { c.S.money = -98765432; c.S.health = 0; }),
  };
  for (const [name, raw] of Object.entries(broken)) {
    const before = errors.length;
    const p = await open(null, raw);
    await p.click('#menuPlay'); await p.waitForTimeout(400);
    for (let i = 0; i < 3; i++) { if (await p.locator('#modalBtn').isVisible()) { await p.waitForTimeout(400); await p.click('#modalBtn'); await p.waitForTimeout(300); } }
    if (await p.locator('#traitLay').isVisible()) { await p.waitForTimeout(400); await p.locator('#traitOpts .opt').first().click(); }
    await p.evaluate(() => { if (!document.getElementById('forkLay').hidden) document.getElementById('forkB').click(); });
    for (const t of ['deck', 'log', 'goals', 'shop']) await p.click('#tabBtn-' + t);
    const m0 = (await st(p)).month;
    await p.evaluate(() => { const s = window.z2m.state(); if (s.status === 'playing' && !s.fork && !s.traitOptions) window.z2m.skip(3); });
    const s = await st(p), j = await junk(p);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(`битое сохранение «${name}»: игра работает`, errors.length === before && !j && over <= 0 && (s.month > m0 || s.status !== 'playing' || s.fork), JSON.stringify({ err: errors.slice(before, before + 2), j, over, month: s.month, status: s.status }));
    await p.close();
  }

  /* 2. Сохранения прошлых версий */
  const olds = {
    v3: { v: 3, money: 9000, month: 80, job: 3, skill: 30, health: 60, network: 4, home: 2, assets: 2, finlit: 1, courses: 9, charge: 4, xp: { work: 30, study: 10, health: 0, network: 0 }, reels4: false, focus: 'work', fork: null, lastFork: 'blog', ms: 1, legacy: 2, life: 2, status: 'playing', peak: 9000, wonAt: null, earned: 20000 },
    v4: { v: 4, money: 40000, month: 200, job: 5, skill: 80, health: 44, network: 9, home: 3, assets: 4, deck: { work: 11, study: 5, health: 3, network: 2, chance: 6, coin: 4, bill: 3 }, bought: { study: 2, health: 0, network: 0, chance: 0 }, billsCut: 1, cut: 0, charge: 10, xp: { work: 80, study: 30, health: 2, network: 1 }, reels4: true, focus: 'study', fork: 'overtime', lastForks: ['blog', '!kitten'], ms: 3, trait: 'lucky', traitOptions: null, flags: { debt: true, low: true, yes: 4 }, legacy: 5, life: 3, status: 'playing', peak: 41000, wonAt: null, earned: 90000 },
    v5won: { v: 5, money: 1200000, month: 300, job: 8, skill: 200, health: 70, network: 12, home: 4, assets: 6, deck: { work: 14, study: 6, health: 3, network: 2, chance: 9, coin: 6, bill: 1 }, bought: { study: 3, health: 0, network: 0, chance: 0 }, billsCut: 3, cut: 0, charge: 0, xp: { work: 90, study: 80, health: 2, network: 1 }, reels4: true, up: { mult: 2, star: 1, insure: 0, coach: 1 }, focus: 'work', fork: null, lastForks: [], ms: 6, trait: null, traitOptions: null, flags: { debt: false, low: false, yes: 2, gold: 1 }, legacy: 7, life: 4, status: 'won', peak: 1200000, wonAt: 300, earned: 2000000 },
  };
  for (const [name, S] of Object.entries(olds)) {
    const before = errors.length;
    const p = await open(null, JSON.stringify({ S, M: { seenHelp: true, auto: false, goals: ['m50'], best: 400 }, t: Date.now() }));
    const menu = await p.textContent('#menuSave');
    await p.click('#menuPlay'); await p.waitForTimeout(500);
    const s = await st(p);
    const pts = await p.textContent('#ptsLine');
    ok(`сохранение ${name}: перенесено без потерь`, errors.length === before && s.v === 7 && s.money === S.money && s.life === S.life && s.job === S.job && s.deck.wild === 0 && s.perks.genes === 0 && new RegExp('Жизнь ' + S.life).test(menu) && !(await junk(p)), JSON.stringify({ v: s.v, money: s.money, pts, err: errors.slice(before) }));
    if (name === 'v4') ok('сохранение v4: развилка на месте, три варианта', await p.locator('#forkLay').isVisible() && (await p.locator('#forkLay .opt:visible').count()) === 3);
    if (name === 'v5won') ok('сохранение v5 с победой: окно конца жизни, старый опыт стал очками', /^Миллион в/.test(await p.textContent('#modalTitle')) && /опыт: (\d+)$/.test(pts) && Number(pts.match(/(\d+)$/)[1]) >= 7 + 2, pts);
    await p.close();
  }

  /* 3. Миллион от выбора в развилке */
  let p = await open();
  await p.click('#menuPlay'); await p.waitForTimeout(500); await p.click('#modalBtn'); await p.click('#autoBtn');
  await p.evaluate(() => { const s = window.z2m.state(); s.money = 999900; s.fork = 'overtime'; s.month = 100; });
  await p.reload(); await p.click('#menuPlay'); await p.waitForTimeout(500);
  await p.click('#forkA'); await p.waitForTimeout(900);
  ok('миллион от развилки: окно миллиона открылось', (await p.textContent('#modalTitle')) === 'Первый миллион!' && (await st(p)).wonAt === 100 && (await st(p)).status === 'playing', await p.textContent('#modalTitle'));
  await p.waitForTimeout(450); await p.click('#modalBtn');
  ok('после миллиона прогноз считает до следующей ступени', /\$5 млн|к 65/.test(await p.textContent('#forecast')) && !/миллион в/.test(await p.textContent('#forecast')), await p.textContent('#forecast'));

  /* 4. Меню открыто во время спина, который открывает развилку */
  await p.evaluate(() => { const s = window.z2m.state(); s.deck = { work: 6, study: 3, health: 3, network: 2, chance: 3, coin: 0, bill: 4, wild: 0 }; s.ms = 6; s.focus = 'work'; s.lastForks = []; window.z2m.refresh(); });
  await force(p, [0.8, 0.8, 0.1]);
  await p.click('#spinBtn');
  await p.click('#menuBtn');
  await p.waitForTimeout(1200);
  ok('меню поверх спина: развилка ждёт, окна под меню нет', await p.locator('#menuLay').isVisible() && !(await p.locator('#forkLay').isVisible()) && !!(await st(p)).fork);
  await p.click('#menuPlay'); await p.waitForTimeout(400);
  ok('после «Продолжить» развилка открылась', await p.locator('#forkLay').isVisible());
  await p.waitForTimeout(400); await p.click('#forkB');

  /* 5. «Удачный год»: пока идёт реклама, спин открыл развилку. Бонус всё равно выдан. */
  await p.evaluate(() => { const s = window.z2m.state(); s.boost = 0; s.boostAt = 0; s.lastForks = []; window.z2m.adMs = 1500; window.z2m.refresh(); });
  await force(p, [0.8, 0.8, 0.1]);
  await p.click('#spinBtn');
  await p.evaluate(() => document.querySelector('li[data-kind="boost"] .btn-buy').click());
  const adShown = await p.locator('#adLay').isVisible();
  await p.waitForTimeout(2100);
  let s = await st(p);
  ok('реклама досмотрена при открывшейся развилке: бонус выдан', adShown && s.boost === 12 && !!s.fork && await p.locator('#forkLay').isVisible(), JSON.stringify({ adShown, boost: s.boost, fork: s.fork }));
  await p.waitForTimeout(400); await p.click('#forkB');
  await p.evaluate(() => { window.z2m.adMs = null; });

  /* 6. Конец жизни под открытым меню: опыт начисляется один раз */
  await p.evaluate(() => { const t = window.z2m.state(); t.fork = null; t.month = 47 * 12 - 1; window.z2m.refresh(); });
  await force(p, [0.1, 0.5, 0.6]);
  await p.click('#spinBtn');
  await p.click('#menuBtn');
  await p.waitForTimeout(1200);
  const metaOf = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k)).M, KEY);
  ok('жизнь кончилась под меню: окна нет, опыт ещё не начислен', (await st(p)).status === 'won' && !(await p.locator('#overlay').isVisible()) && !(await st(p)).paid && /жизнь окончена/.test(await p.textContent('#menuSave')), await p.textContent('#menuSave'));
  await p.click('#menuPlay'); await p.waitForTimeout(500);
  const pts1 = (await metaOf()).pts, paid = (await st(p)).paid;
  ok('после «Продолжить» окно конца жизни и опыт', /^Миллион в/.test(await p.textContent('#modalTitle')) && paid && pts1 === paid.pts, JSON.stringify(paid));
  await p.reload(); await p.click('#menuPlay'); await p.waitForTimeout(500);
  ok('перезагрузка на окне конца жизни опыт не удваивает', (await metaOf()).pts === pts1);
  await p.close();

  /* 7. Очень большие числа помещаются в шапку на маленьком телефоне */
  p = await open({ width: 360, height: 640 });
  await p.click('#menuPlay'); await p.waitForTimeout(500); await p.click('#modalBtn'); await p.click('#autoBtn');
  await p.evaluate(() => { const s = window.z2m.state(); Object.assign(s, { money: 123456789, peak: 123456789, job: 9, skill: 999, network: 140, assets: 7, home: 5, wonAt: 200, asked: true, month: 400, boost: 5 }); s.won = { reels4: false, assets: 0, debt: false, low: false, deck: 21, gold: 0 }; s.deck.coin = 7; window.z2m.refresh(); });
  await p.waitForTimeout(700);
  const big = await p.evaluate(() => ({
    over: document.documentElement.scrollWidth - innerWidth,
    line: document.querySelector('.money-line').scrollWidth - document.querySelector('.money-line').clientWidth,
    moneyRight: Math.round(document.getElementById('money').getBoundingClientRect().right), goalLeft: Math.round(document.getElementById('goalText').getBoundingClientRect().left), goalRight: Math.round(document.getElementById('goalText').getBoundingClientRect().right),
    chips: Array.from(document.querySelectorAll('.chips dd')).filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
    hud: Math.round(document.querySelector('.hud').getBoundingClientRect().height),
  }));
  ok('сто миллионов на телефоне 360: деньги и подпись не наезжают, плашки целые', big.over <= 0 && big.line <= 0 && big.moneyRight <= big.goalLeft && big.goalRight <= 360 && big.chips.length === 0, JSON.stringify(big));
  /* конец жизни с десятью новыми целями на маленьком телефоне: кнопки окна должны быть на виду без прокрутки */
  await p.evaluate(() => { const s = window.z2m.state(); Object.assign(s, { money: 1200000, peak: 1200000, month: 30, wonAt: null, won: null, asked: false, boost: 0, assets: 0, reels4: false }); s.deck.coin = 0; s.flags = { debt: false, low: false, yes: 0, gold: 0, sets: [], quad: false }; window.z2m.skip(1); });
  await p.waitForTimeout(900); await p.click('#modalAlt'); await p.waitForTimeout(600);
  const endm = await p.evaluate(() => { const hit = (id) => { const b = document.getElementById(id), r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= innerHeight && !!t && (t === b || b.contains(t)); }; return { goals: document.querySelectorAll('#modalBody .goals li').length, btn: hit('modalBtn'), alt: hit('modalAlt'), bodyScrolls: document.getElementById('modalBody').scrollHeight > document.getElementById('modalBody').clientHeight }; });
  ok('длинное окно конца жизни на телефоне 360: обе кнопки видны и нажимаются', endm.goals >= 9 && endm.btn && endm.alt, JSON.stringify(endm));
  await p.click('#modalBtn'); await p.waitForTimeout(500);
  await p.locator('#traitOpts .opt').first().click(); await p.waitForTimeout(300);
  await p.evaluate(() => { const s = window.z2m.state(); s.money = -98765432; s.health = 0; window.z2m.refresh(); });
  await p.waitForTimeout(700);
  const debt = await p.evaluate(() => ({ line: document.querySelector('.money-line').scrollWidth - document.querySelector('.money-line').clientWidth, text: document.getElementById('money').textContent, fc: document.getElementById('forecast').textContent }));
  ok('глубокий долг и нулевое здоровье: текст без мусора', debt.line <= 0 && /−/.test(debt.text) && !(await junk(p)), JSON.stringify(debt));
  await p.close();

  /* 8. Магазин: купленное живёт в метаданных; битые и старые сохранения ничего не ломают и ничего не дарят */
  const shopSeen = async (M) => {
    const p = await open(null, mut((c) => { c.M = Object.assign({ seenHelp: true, auto: false }, M); }));
    await p.click('#menuStore'); await p.waitForTimeout(200);
    const r = await p.evaluate(() => ({
      buy: Array.from(document.querySelectorAll('[data-buy]')).map((b) => b.dataset.buy).sort().join(','),
      theme: document.documentElement.dataset.theme || 'base',
      thanks: !document.getElementById('menuThanks').hidden,
    }));
    await p.click('#storeClose');
    await p.click('#menuPlay'); await p.waitForTimeout(300);
    await p.evaluate(() => { const s = window.z2m.state(); if (s.status === 'playing' && !s.fork && !s.traitOptions) window.z2m.skip(2); });
    r.junk = await junk(p);
    await p.close();
    return r;
  };
  const ALL = 'noads,thanks,theme-bill,theme-dusk';
  const metaCases = [
    ['старое сохранение без покупок', {}, ALL, 'base', false],
    ['покупки строкой', { owned: 'noads', theme: 'dusk' }, ALL, 'base', false],
    ['покупки объектом', { owned: { noads: true, thanks: 1 } }, ALL, 'base', false],
    ['покупки мусором', { owned: [5, null, 'zzz', { id: 'noads' }], theme: 7 }, ALL, 'base', false],
    ['тема без покупки темы', { owned: ['noads'], theme: 'dusk' }, 'thanks,theme-bill,theme-dusk', 'base', false],
    ['неизвестная тема', { owned: ['theme-bill', 'theme-dusk'], theme: 'gold' }, 'noads,thanks', 'base', false],
    ['повторы и чужие id', { owned: ['thanks', 'thanks', 'theme-dusk', 'vip'], theme: 'dusk' }, 'noads,theme-bill', 'dusk', true],
  ];
  for (const [name, M, buy, th, thanks] of metaCases) {
    const before = errors.length;
    const r = await shopSeen(M);
    ok(`магазин, сохранение «${name}»: купленное прочитано честно`, errors.length === before && r.buy === buy && r.theme === th && r.thanks === thanks && !r.junk, JSON.stringify(r));
  }

  /* 9. Магазин открыт во время спина, который открывает развилку: развилка ждёт, окна под магазином нет */
  p = await open();
  await p.click('#menuPlay'); await p.waitForTimeout(500); await p.click('#modalBtn'); await p.click('#autoBtn');
  await p.evaluate(() => { const s = window.z2m.state(); s.deck = { work: 6, study: 3, health: 3, network: 2, chance: 3, coin: 0, bill: 4, wild: 0 }; s.ms = 6; s.focus = 'work'; s.lastForks = []; s.month = 60; window.z2m.refresh(); });
  await force(p, [0.8, 0.8, 0.1]);
  await p.click('#spinBtn');
  await p.click('#storeBtn');
  await p.waitForTimeout(1200);
  ok('магазин поверх спина: развилка ждёт, окна под магазином нет', await p.locator('#storeLay').isVisible() && !(await p.locator('#forkLay').isVisible()) && !!(await st(p)).fork);
  await p.click('#storeClose'); await p.waitForTimeout(400);
  ok('после закрытия магазина развилка открылась', await p.locator('#forkLay').isVisible() && !(await p.locator('#storeLay').isVisible()));
  await p.close();

  console.log(`проверок пройдено ${passed}, упало ${failed}; ошибок в консоли ${errors.length}`, errors.slice(0, 3));
  await browser.close();
})();
