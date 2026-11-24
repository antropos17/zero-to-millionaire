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
    'чужой сценарий': mut((c) => { c.S.sc = 'zzz'; }),
    'выбор старта без стандартного': mut((c) => { c.S.scOptions = ['loan']; }),
    'выбор старта с мусором': mut((c) => { c.S.scOptions = ['base', 'zzz']; }),
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
  /* v6 и v7: последние версии до лимита рекламы; в v7 золото уже взято дважды и идёт «Удачный год» */
  const v6 = { v: 6, money: 30000, month: 150, job: 4, skill: 60, health: 70, network: 8, home: 2, assets: 3, deck: { work: 10, study: 5, health: 3, network: 2, chance: 5, coin: 3, bill: 3, wild: 0 }, bought: { study: 2, health: 0, network: 0, chance: 0, wild: 0 }, billsCut: 1, cut: 0, charge: 3, xp: { work: 40, study: 20, health: 0, network: 0 }, reels4: false, up: { mult: 1, star: 0, insure: 1, coach: 0 }, boost: 0, boostAt: 40, focus: 'work', fork: null, lastForks: ['blog'], ms: 3, trait: 'frugal', traitOptions: null, flags: { debt: false, low: false, yes: 3, gold: 1, sets: ['intern'], quad: false }, perks: { cash: 1, genes: 0, tough: 0, ties: 0, school: 0, sale: 1, star: 0, traits: 0, joker: 0 }, life: 2, status: 'playing', peak: 30000, wonAt: null, won: null, earned: 60000 };
  olds.v6 = v6;
  olds.v7 = Object.assign(JSON.parse(JSON.stringify(v6)), { v: 7, boost: 5, boostAt: 180, flags: Object.assign({}, v6.flags, { gold: 2 }), story: [{ m: 20, k: 'job', i: 1 }, { m: 90, k: 'fork', t: 'Свадьба', pick: 'gold', d: 0 }] });
  /* v8: последняя версия до сценариев старта */
  olds.v8 = Object.assign(JSON.parse(JSON.stringify(olds.v7)), { v: 8, ads: 2, starAt: 0, saleAt: 0, sale: false, trait4: false });
  for (const [name, S] of Object.entries(olds)) {
    const before = errors.length;
    const p = await open(null, JSON.stringify({ S, M: { seenHelp: true, auto: false, goals: ['m50'], best: 400 }, t: Date.now() }));
    const menu = await p.textContent('#menuSave');
    await p.click('#menuPlay'); await p.waitForTimeout(500);
    const s = await st(p);
    const pts = await p.textContent('#ptsLine');
    ok(`сохранение ${name}: перенесено без потерь`, errors.length === before && s.v === 9 && s.sc === 'base' && s.scOptions === null && s.ads === Math.min(16, (S.flags && S.flags.gold) || 0) && s.sale === false && s.trait4 === false && s.money === S.money && s.life === S.life && s.job === S.job && s.deck.wild === 0 && s.perks.genes === 0 && new RegExp('Жизнь ' + S.life).test(menu) && !(await junk(p)), JSON.stringify({ v: s.v, money: s.money, pts, err: errors.slice(before) }));
    if (name === 'v6' || name === 'v7' || name === 'v8') {
      const head = await p.textContent('#adsHead');
      const rows = await p.evaluate(() => ['boost', 'ad-star', 'ad-sale'].map((k) => document.querySelector(`li[data-kind="${k}"] .btn-buy`).textContent).join(' | '));
      ok(`сохранение ${name}: черта, наследие и летопись на месте, бонусы считаются с уже взятого золота`, s.trait === 'frugal' && s.perks.sale === 1 && s.deck.work === 10 && (name === 'v6' ? s.story.length === 0 && s.boost === 0 : s.story.length === 2 && s.boost === 5 && s.boostAt === 180) && head === `Бонусы · ${S.flags.gold} из 16` && (name !== 'v6' ? /Идёт/.test(rows) : true), JSON.stringify({ head, rows, story: s.story.length }));
      /* скидка за рекламу перемножается с «Аскетом» и «Умением торговаться» */
      const c = await p.evaluate(() => { const t = JSON.parse(JSON.stringify(window.z2m.state())); const a = Core.costOf(t, 'home'); t.sale = true; return { a, b: Core.costOf(t, 'home'), list: Core.homeCost(t) }; });
      ok(`сохранение ${name}: скидка 20% поверх «Аскета» и перка`, c.a === Math.round(14000 * 0.85 * 0.95) && c.b === Math.round(c.a * 0.8) && c.list === c.a, JSON.stringify(c));
    }
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
  await p.evaluate(() => { const s = window.z2m.state(); s.deck = { work: 6, study: 4, health: 3, network: 2, chance: 3, coin: 0, bill: 4, wild: 0 }; s.ms = 6; s.focus = 'work'; s.lastForks = []; window.z2m.refresh(); });
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
  /* спин, начатый до выключения авто, мог открыть развилку: её окно легло бы поверх окна миллиона. Дожидаемся его и отказываемся */
  await p.waitForTimeout(1500);
  if (await p.locator('#forkLay').isVisible()) { await p.click('#forkB'); await p.waitForTimeout(500); }
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
    r.look = await p.evaluate(() => { const L = window.z2m.meta().look; return [L.theme, L.hero, L.home, L.epitaph].join(','); });
    r.hasTheme = await p.evaluate(() => 'theme' in window.z2m.meta());
    await p.click('#menuPlay'); await p.waitForTimeout(300);
    r.scene = await p.evaluate(() => ({ hero: /#FF5A7A|#6B3F22/.test(document.getElementById('charBody').innerHTML), home: document.querySelector('#home > g').innerHTML.length }));
    await p.evaluate(() => { const s = window.z2m.state(); if (s.status === 'playing' && !s.fork && !s.traitOptions) window.z2m.skip(2); });
    r.junk = await junk(p);
    await p.close();
    return r;
  };
  const IDS = ['noads', 'speed8', 'autobuy', 'sc-loan', 'sc-late', 'sc-flat', 'theme-bill', 'theme-dusk', 'hero-street', 'hero-curls', 'home-terra', 'home-nord', 'epitaph-paper', 'epitaph-postcard', 'thanks'];
  const but = (...x) => IDS.filter((id) => !x.includes(id)).sort().join(',');
  const ALL = but();
  const B = 'base,base,base,base';
  const metaCases = [
    ['старое сохранение без покупок', {}, ALL, B, false],
    ['покупки строкой', { owned: 'noads', theme: 'dusk' }, ALL, B, false],
    ['покупки объектом', { owned: { noads: true, thanks: 1 } }, ALL, B, false],
    ['покупки мусором', { owned: [5, null, 'zzz', { id: 'noads' }], theme: 7 }, ALL, B, false],
    ['тема без покупки темы', { owned: ['noads'], theme: 'dusk' }, but('noads'), B, false],
    ['неизвестная тема', { owned: ['theme-bill', 'theme-dusk'], theme: 'gold' }, but('theme-bill', 'theme-dusk'), B, false],
    ['повторы и чужие id, старое поле темы', { owned: ['thanks', 'thanks', 'theme-dusk', 'vip'], theme: 'dusk' }, but('thanks', 'theme-dusk'), 'dusk,base,base,base', true],
    ['старое сохранение с темой и без нового поля', { owned: ['theme-bill', 'hero-street'], theme: 'bill' }, but('theme-bill', 'hero-street'), 'bill,base,base,base', false],
    ['выбор мусором', { owned: IDS, look: 'street' }, '', B, true],
    ['выбор: мусор в полях', { owned: IDS, look: { theme: 5, hero: ['street'], home: { nord: 1 }, epitaph: 'gold', extra: 'x' } }, '', B, true],
    ['выбран, но не куплен', { owned: ['hero-street', 'home-terra'], look: { theme: 'dusk', hero: 'curls', home: 'terra', epitaph: 'paper' } }, but('hero-street', 'home-terra'), 'base,base,terra,base', false],
    ['новое поле важнее старого', { owned: ['theme-bill', 'theme-dusk'], theme: 'dusk', look: { theme: 'bill' } }, but('theme-bill', 'theme-dusk'), 'bill,base,base,base', false],
    ['всё куплено и выбрано', { owned: IDS, look: { theme: 'dusk', hero: 'street', home: 'nord', epitaph: 'postcard' } }, '', 'dusk,street,nord,postcard', true],
  ];
  for (const [name, M, buy, lk, thanks] of metaCases) {
    const before = errors.length;
    const r = await shopSeen(M);
    ok(`магазин, сохранение «${name}»: купленное и выбор прочитаны честно`, errors.length === before && r.buy === buy && r.theme === lk.split(',')[0] && r.look === lk && !r.hasTheme && r.scene.hero === (lk.split(',')[1] !== 'base') && r.thanks === thanks && !r.junk, JSON.stringify(r));
  }
  /* «Удобство»: ×8 и правила автопокупок без покупки не действуют, мусор в правилах читается как «всё выключено» */
  const comfortSeen = async (M) => {
    const p = await open(null, mut((c) => { c.M = Object.assign({ seenHelp: true, auto: false }, M); c.S.money = 90000; c.S.peak = 90000; c.S.ms = 9; c.S.fork = null; c.S.traitOptions = null; }));
    await p.click('#menuPlay'); await p.waitForTimeout(300);
    await p.click('#tabBtn-shop');
    const r = await p.evaluate(() => ({ speed: window.z2m.meta().speed, a: window.z2m.meta().autobuy, bar: !document.getElementById('autoBar').hidden }));
    const m0 = (await st(p)).money;
    await p.click('#spinBtn'); await p.waitForTimeout(2600);
    r.bought = await p.evaluate(() => window.z2m.autoLast().length);
    r.log = await p.evaluate(() => window.z2m.meta().log.some((e) => /Автопокупка/.test(e.text)));
    r.junk = await junk(p);
    r.money = m0;
    await p.close();
    return r;
  };
  const OFF = (a) => a && a.on === false && a.job === false && a.reserve === 3 && Object.values(a.kinds).every((v) => v === false) && Object.keys(a.kinds).length === 8;
  const RULES = { on: true, reserve: 3, job: true, kinds: { gym: true, home: true, asset: true } };
  const comfortCases = [
    ['×8 без покупки', { speed: 8 }, (r) => r.speed === 1 && !r.bar],
    ['×8 строкой у владельца', { owned: ['speed8'], speed: '8' }, (r) => r.speed === 1],
    ['×8 у владельца', { owned: ['speed8'], speed: 8 }, (r) => r.speed === 8],
    ['правила без покупки', { autobuy: RULES }, (r) => !r.bar && r.bought === 0 && !r.log],
    ['правила строкой', { owned: ['autobuy'], autobuy: 'on' }, (r) => r.bar && OFF(r.a) && r.bought === 0],
    ['правила: мусор в полях', { owned: ['autobuy'], autobuy: { on: 'yes', reserve: 1, job: 1, kinds: { gym: 'true', zzz: true, home: [1] } } }, (r) => r.bar && OFF(r.a) && r.bought === 0],
    ['правила с чужим запасом', { owned: ['autobuy'], autobuy: { on: true, reserve: 99, job: false, kinds: { gym: true } } }, (r) => r.a.reserve === 3 && r.a.kinds.gym === true],
    ['правила у владельца', { owned: ['autobuy'], autobuy: RULES }, (r) => r.bar && r.a.on && r.bought > 0 && r.log],
  ];
  for (const [name, M, want] of comfortCases) {
    const before = errors.length;
    const r = await comfortSeen(M);
    ok(`«Удобство», сохранение «${name}»: прочитано честно`, errors.length === before && want(r) && !r.junk, JSON.stringify(r));
  }
  /* «Новая игра» стирает жизнь, но не покупки и выбор */
  p = await open(null, mut((c) => { c.M.owned = IDS; c.M.look = { theme: 'bill', hero: 'curls', home: 'terra', epitaph: 'paper' }; c.M.seenHelp = true; }));
  await p.click('#menuNew'); await p.click('#menuNew'); await p.waitForTimeout(300);
  const afterNew = await p.evaluate(() => window.z2m.meta());
  ok('«Новая игра» не стирает покупки и выбор внешнего вида', (await st(p)).month === 0 && afterNew.owned.length === IDS.length && JSON.stringify(afterNew.look) === JSON.stringify({ theme: 'bill', hero: 'curls', home: 'terra', epitaph: 'paper' })
    && (await p.evaluate(() => document.querySelector('#home > g').innerHTML !== Art.home(window.z2m.state().home) && document.documentElement.dataset.theme === 'bill' && /#6B3F22/.test(document.getElementById('charBody').innerHTML))), JSON.stringify(afterNew.look));
  await p.close();

  /* Новые жизни: в окне старта только купленные сценарии, даже если в сохранении лежит другой */
  const scSeen = async (owned, opts) => {
    const p = await open(null, mut((c) => { c.M = { seenHelp: true, auto: false, owned }; c.S.month = 0; c.S.fork = null; c.S.traitOptions = null; c.S.scOptions = opts; }));
    await p.click('#menuPlay'); await p.waitForTimeout(400);
    const r = { lay: await p.locator('#scLay').isVisible(), ids: await p.evaluate(() => [...document.querySelectorAll('#scOpts [data-sc]')].map((b) => b.dataset.sc).join(',')), opts: (await st(p)).scOptions, junk: await junk(p) };
    await p.close();
    return r;
  };
  for (const [name, owned, opts, want] of [
    ['чужой сценарий в сохранении', ['sc-loan'], ['base', 'late'], (r) => !r.lay && r.opts === null],
    ['купленный и чужой', ['sc-loan'], ['base', 'loan', 'flat'], (r) => r.lay && r.ids === 'base,loan'],
    ['покупка не в том поле', 'sc-late', ['base', 'late'], (r) => !r.lay && r.opts === null],
    ['всё купленное', ['sc-loan', 'sc-late', 'sc-flat'], ['base', 'loan', 'late', 'flat'], (r) => r.lay && r.ids === 'base,loan,late,flat'],
  ]) {
    const before = errors.length;
    const r = await scSeen(owned, opts);
    ok(`«Новые жизни», сохранение «${name}»: предложено только купленное`, errors.length === before && want(r) && !r.junk, JSON.stringify(r));
  }

  /* Возврат во вкладку при открытом окне автопокупок: «Пока тебя не было» не открывается поверх, догоняет после «Готово» */
  p = await open(null, mut((c) => { c.M = Object.assign({ seenHelp: true, auto: true }, { owned: ['autobuy'] }); c.t = Date.now(); c.S.fork = null; c.S.traitOptions = null; }));
  await p.click('#menuPlay'); await p.waitForTimeout(400);
  if (await p.locator('#overlay').isVisible()) await p.click('#modalBtn');
  await p.click('#tabBtn-shop'); await p.click('#autoEdit'); await p.waitForTimeout(200);
  const m1 = (await st(p)).month;
  await p.evaluate(() => {
    let hid = true; const t0 = Date.now(); let shift = 0;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hid });
    const real = Date.now; Date.now = () => real() + shift;
    document.dispatchEvent(new Event('visibilitychange'));
    shift = 5 * 60000; hid = false;
    document.dispatchEvent(new Event('visibilitychange'));
    void t0;
  });
  await p.waitForTimeout(300);
  const over = { auto: await p.locator('#autoLay').isVisible(), modal: await p.locator('#overlay').isVisible(), month: (await st(p)).month - m1 };
  await p.click('#autoClose'); await p.waitForTimeout(300);
  const after = { modal: await p.locator('#overlay').isVisible(), title: await p.evaluate(() => document.getElementById('overlay').textContent.includes('Пока тебя не было')), month: (await st(p)).month - m1 };
  ok('окно автопокупок и возврат во вкладку: «Пока тебя не было» ждёт «Готово»', over.auto && !over.modal && over.month === 0 && after.modal && after.title && after.month === 5, JSON.stringify({ over, after }));
  await p.close();

  /* 9. Магазин открыт во время спина, который открывает развилку: развилка ждёт, окна под магазином нет */
  p = await open();
  await p.click('#menuPlay'); await p.waitForTimeout(500); await p.click('#modalBtn'); await p.click('#autoBtn');
  await p.evaluate(() => { const s = window.z2m.state(); s.deck = { work: 6, study: 4, health: 3, network: 2, chance: 3, coin: 0, bill: 4, wild: 0 }; s.ms = 6; s.focus = 'work'; s.lastForks = []; s.month = 60; window.z2m.refresh(); });
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
