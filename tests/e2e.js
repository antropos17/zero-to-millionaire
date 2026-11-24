/* Сквозные проверки новой версии в браузере. */
const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(process.argv[2]);
const KEY = 'zero-to-millionaire-v2';
let failed = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) failed++; };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  /* после загрузки игрок всегда попадает в меню: входим главной кнопкой, как он */
  const enter = async (page) => { await page.waitForSelector('#menuPlay', { state: 'visible' }); await page.click('#menuPlay'); await page.waitForTimeout(300); };
  const mk = async (opts, seen = true, init) => {
    const ctx = await browser.newContext(opts || { viewport: { width: 1280, height: 900 } });
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(file);
    /* seen: 'menu' оставляет игрока в главном меню, false входит в игру, true ещё и закрывает подсказку первого запуска */
    if (seen !== 'menu') await enter(page);
    if (seen === true) { await page.waitForTimeout(500); await page.click('#modalBtn'); }
    return page;
  };
  /* случайная развилка остановила бы слот посреди замера темпа: в таких шагах сразу отказываемся */
  const skipForks = (p, on) => p.evaluate((flag) => {
    clearInterval(window.__skip);
    if (flag) window.__skip = setInterval(() => { if (!document.getElementById('forkLay').hidden) document.getElementById('forkB').click(); }, 40);
  }, on);
  const st = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.z2m.state())));
  /* стартовая колода и все рубежи пройдены: пороги для подложенных случайных чисел не плывут.
     При фокусе на работе: работа до .429, учёба до .571, здоровье до .679, связи до .750, шанс до .857, дальше счета */
  const D0 = { work: 6, study: 4, health: 3, network: 2, chance: 3, coin: 0, bill: 4, wild: 0 };
  const fix = (p, patch) => p.evaluate((x) => { const s = window.z2m.state(); Object.assign(s, { deck: Object.assign({}, x.d), ms: 6, fork: null, focus: 'work' }, x.patch || {}); window.z2m.refresh(); }, { d: D0, patch });
  const force = (p, q) => p.evaluate((arr) => { const q = arr.slice(); const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); }, q);
  const meta = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k)).M, KEY);
  const set = (p, patch) => p.evaluate((x) => { Object.assign(window.z2m.state(), x); window.z2m.refresh(); }, patch);

  /* 0. Загрузка и главное меню на первом запуске */
  let p = await mk(null, 'menu');
  await p.waitForSelector('#menuPlay', { state: 'visible' });
  ok('после загрузки открыто меню, экран загрузки убран, полоска дошла до конца', !(await p.locator('#boot').isVisible()) && await p.locator('#menuLay').isVisible() && (await p.evaluate(() => document.getElementById('bootFill').style.width)) === '100%');
  ok('первый запуск: в меню одна главная кнопка «Новая игра»', (await p.textContent('#menuPlay')) === 'Новая игра' && !(await p.locator('#menuNew').isVisible()) && /Сохранения пока нет/.test(await p.textContent('#menuSave')));
  await p.waitForTimeout(2200);
  ok('пока открыто меню, слот стоит', (await st(p)).month === 0);
  await p.click('#menuHelp');
  ok('«Как играть» открывается прямо из меню', await p.locator('#overlay').isVisible() && (await p.textContent('#modalTitle')) === 'Как играть');
  await p.waitForTimeout(450); await p.click('#modalBtn');
  ok('после подсказки игрок остаётся в меню', await p.locator('#menuLay').isVisible() && (await st(p)).month === 0);
  await p.click('#menuSound');
  ok('настройки в меню работают', (await p.textContent('#menuSound')) === 'Звук: вкл' && (await meta(p)).sound === true);
  await p.click('#menuSound');
  await p.close();

  /* 1. Первый запуск: подсказка, слот ждёт */
  p = await mk(null, false);
  await p.waitForTimeout(2500);
  ok('первый запуск: окно «Как играть»', await p.locator('#overlay').isVisible() && (await p.textContent('#modalTitle')) === 'Как играть');
  ok('пока окно открыто, слот стоит', (await st(p)).month === 0);
  await p.waitForTimeout(450); await p.click('#modalBtn');
  await skipForks(p, true);
  await p.waitForTimeout(4300);
  let s = await st(p);
  ok('автоспин на ×1: около 2 месяцев за 4 с', s.month >= 2 && s.month <= 3, 'месяцев: ' + s.month);
  await p.reload(); await enter(p);
  ok('подсказка второй раз сама не открывается', !(await p.locator('#overlay').isVisible()));
  await p.click('#helpBtn');
  ok('кнопка «?» открывает подсказку', (await p.textContent('#modalTitle')) === 'Как играть');
  await p.waitForTimeout(450); await p.click('#modalBtn');
  await p.close();

  /* 2. Скорость, пауза, ручной спин */
  p = await mk();
  await skipForks(p, true);
  await p.waitForTimeout(600);
  await p.click('#speedBtn'); await p.click('#speedBtn');
  ok('скорость ×4', (await p.textContent('#speedBtn')) === '×4');
  const w0 = (await st(p)).month;
  await p.waitForTimeout(4000);
  const w1 = (await st(p)).month;
  ok('на ×4 около 8 спинов за 4 с', w1 - w0 >= 6 && w1 - w0 <= 10, 'спинов: ' + (w1 - w0));
  await p.click('#autoBtn');
  await p.waitForTimeout(1300);
  await skipForks(p, false);
  const w2 = (await st(p)).month;
  await p.waitForTimeout(1500);
  ok('пауза держится', (await st(p)).month === w2);
  await p.click('#speedBtn');
  await p.evaluate(() => { const q = [0.1, 0.5, 0.8]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
  await p.click('#spinBtn'); await p.waitForTimeout(1400);
  ok('ручной спин', (await st(p)).month === w2 + 1);
  await p.evaluate(() => { const q = [0.1, 0.5, 0.8]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
  await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  ok('второе нажатие досрочно завершает спин', (await st(p)).month === w2 + 2);
  await p.evaluate(() => { document.activeElement.blur(); const q = [0.1, 0.5, 0.8]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
  await p.keyboard.press('Space'); await p.waitForTimeout(1400);
  ok('пробел крутит', (await st(p)).month === w2 + 3);

  /* 3. Фокус удваивает карты, вкладки переключаются */
  await fix(p);
  await p.click('.focus button[data-focus="study"]');
  ok('фокус на учёбу', (await st(p)).focus === 'study' && (await p.getAttribute('.focus button[data-focus="study"]', 'aria-checked')) === 'true');
  await p.click('#tabBtn-deck');
  const oddsText = await p.textContent('#odds');
  ok('в точных шансах учёба помечена фокусом', /Учёба \(в фокусе\)/.test(oddsText), oddsText.slice(0, 120));
  const oo = await p.evaluate(() => { const o = Core.odds(window.z2m.state()); return { sum: Core.SYMBOLS.reduce((a, k) => a + o[k].p, 0), study: o.study.p, total: o.total }; });
  ok('карты учёбы в фокусе считаются дважды: 8 из 26', Math.abs(oo.sum - 1) < 1e-9 && oo.total === 26 && Math.abs(oo.study - 8 / 26) < 1e-9, JSON.stringify(oo));
  ok('строка колоды показывает число карт и шанс', (await p.textContent('#deck li[data-kind="study"] h3')) === 'Учёба ×4 · 30,8%', await p.textContent('#deck li[data-kind="study"] h3'));
  ok('в колоде 22 карты, на полоске 6 символов', (await p.textContent('#deckSize')) === 'В колоде 22 карты' && (await p.locator('#deckBar i').count()) === 6, await p.textContent('#deckSize'));
  await p.click('#tabBtn-log');
  ok('вкладка «Лента» открыта', await p.locator('#tab-log').isVisible() && !(await p.locator('#tab-shop').isVisible()));

  /* 4. Покупки и колода */
  const btn = (k) => p.locator(`li[data-kind="${k}"] .btn-buy`);
  const cutBtn = (k) => p.locator(`li[data-kind="${k}"] .max-btn`);
  await p.click('#tabBtn-deck');
  await fix(p, { money: 10, skill: 0, job: 0, home: 0, health: 100, assets: 0, bought: { study: 0, health: 0, network: 0, chance: 0, wild: 0 }, cut: 0, billsCut: 0 });
  ok('без денег карта учёбы недоступна', await btn('study').isDisabled());
  ok('работа и монета не покупаются напрямую', await btn('work').isDisabled() && await btn('coin').isDisabled() && /даёт карту/.test(await btn('work').textContent()));
  await set(p, { money: 500 });
  await btn('study').click();
  s = await st(p);
  ok('карта учёбы куплена за $300, следующая дороже', s.deck.study === 5 && s.money === 200 && s.bought.study === 1 && (await p.evaluate(() => Core.addCost(window.z2m.state(), 'study'))) === 525, JSON.stringify({ study: s.deck.study, money: s.money }));
  ok('ссылка «убрать» без денег выключена', await cutBtn('study').isVisible() && await cutBtn('study').isDisabled(), await cutBtn('study').textContent());
  await set(p, { money: 2000 });
  await cutBtn('study').click();
  s = await st(p);
  ok('карта учёбы убрана за $250', s.deck.study === 4 && s.cut === 1 && s.money === 1750, JSON.stringify({ study: s.deck.study, money: s.money }));
  await btn('bill').click();
  s = await st(p);
  ok('карта счетов убрана за $1 500', s.deck.bill === 3 && s.billsCut === 1 && s.money === 250, JSON.stringify({ bill: s.deck.bill, money: s.money }));
  await set(p, { deck: Object.assign({}, D0, { network: 1 }) });
  ok('последнюю карту символа убрать нельзя', !(await cutBtn('network').isVisible()));
  await p.click('#tabBtn-shop');
  await fix(p, { money: 250, skill: 10 });
  ok('повышение доступно при навыке 10', await btn('job').isEnabled());
  await btn('job').click();
  s = await st(p);
  ok('повышение сработало и положило карту работы', s.job === 1 && s.deck.work === 7 && (await p.textContent('#jobText')) === 'Курьер');
  await btn('asset').click();
  s = await st(p);
  ok('инвестиция кладёт карту монеты', s.assets === 1 && s.deck.coin === 1 && s.money === 0, JSON.stringify(s.deck));
  await set(p, { money: 400 });
  await btn('home').click();
  ok('переезд в хостел', (await st(p)).home === 1 && (await st(p)).money === 0);
  await set(p, { money: 99999 });
  ok('значок на вкладке считает доступные покупки', Number(await p.textContent('#shopBadge')) >= 3, await p.textContent('#shopBadge'));
  const groups = await p.evaluate(() => Array.from(document.querySelectorAll('#shop > h3.sub')).map((h) => h.textContent + ':' + Array.from(h.nextElementSibling.querySelectorAll('li')).map((li) => li.dataset.kind).join(',')).join(' | '));
  ok('покупки разложены по разделам в нужном порядке', groups === 'Бонусы · 0 из 16:boost,ad-star,ad-sale | Жизнь:job,gym,home | Капитал:asset | Слот:reel,up-mult,up-star,up-insure,up-coach', groups);
  /* пара монет платит пассивный доход за 6 месяцев: работа до .387, учёба .516, здоровье .613, связи .677, шанс .774, монета .871 */
  await fix(p, { money: 100, assets: 1, deck: Object.assign({}, D0, { coin: 3 }) });
  const c0 = await p.evaluate(() => { const s = window.z2m.state(); return { money: s.money, sal: Core.salary(s), pas: Core.passive(s) }; });
  await force(p, [0.8, 0.8, 0.1]);
  await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  s = await st(p);
  ok('пара монет: пассив за 6 месяцев', c0.pas === 7 && s.money - c0.money - c0.sal - c0.pas === 42, String(s.money - c0.money - c0.sal - c0.pas));

  /* 5. Развилка от пары Шансов: слот ждёт, выбор применяется */
  await fix(p, { money: 5000, health: 80, lastForks: [], assets: 0 });
  await force(p, [0.8, 0.8, 0.1]);
  await p.click('#spinBtn');
  await p.waitForTimeout(2200);
  ok('пара Шансов открыла развилку', await p.locator('#forkLay').isVisible() && !!(await st(p)).fork, 'развилка: ' + (await st(p)).fork);
  const mFork = (await st(p)).month;
  ok('окно развилки перекрывает остальные кнопки', await p.evaluate(() => { const b = document.getElementById('autoBtn').getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!top.closest('#forkLay'); }));
  await p.evaluate(() => document.getElementById('autoBtn').click());
  await p.waitForTimeout(2600);
  ok('пока развилка открыта, слот стоит даже с авто', (await st(p)).month === mFork);
  await p.reload(); await enter(p);
  ok('развилка возвращается после перезагрузки', await p.locator('#forkLay').isVisible());
  await p.evaluate(() => { const s = window.z2m.state(); s.fork = 'overtime'; });
  await p.reload(); await enter(p);
  const bf = await st(p);
  const base = await p.evaluate(() => Core.baseSalary(window.z2m.state()));
  ok('на кнопке настоящая сумма', (await p.textContent('#forkA')).includes('$' + String(base * 3).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')), await p.textContent('#forkA'));
  await p.waitForTimeout(450); await p.click('#forkA');
  s = await st(p);
  ok('выбор применён: +3 зарплаты, здоровье −12', s.money === bf.money + base * 3 && Math.round(bf.health - s.health) === 12 && s.fork === null, JSON.stringify({ d: s.money - bf.money, hp: bf.health - s.health }));
  await p.waitForTimeout(2600);
  ok('после выбора автоспин продолжился', (await st(p)).month > mFork);
  const noMoney = await p.evaluate(() => { const s = window.z2m.state(); s.fork = 'mentor'; s.money = 1; window.z2m.refresh(); return Core.fork(s).options[0].enabled; });
  ok('дорогой вариант без денег недоступен', noMoney === false);
  await p.evaluate(() => { const s = window.z2m.state(); s.fork = null; s.money = 800; window.z2m.refresh(); });
  /* развилки по возрасту, разовые и с картами */
  const gates = await p.evaluate(() => {
    const young = Core.newState(), adult = Core.newState(), old = Core.newState();
    adult.month = 10 * 12; old.month = 40 * 12;
    return { n: Core.FORK_IDS.length, w18: Core.forkAllowed(young, 'wedding'), w28: Core.forkAllowed(adult, 'wedding'), h28: Core.forkAllowed(adult, 'heart'), h58: Core.forkAllowed(old, 'heart'), hack58: Core.forkAllowed(old, 'hackathon') };
  });
  ok('развилок больше тридцати, часть привязана к возрасту', gates.n >= 30 && !gates.w18 && gates.w28 && !gates.h28 && gates.h58 && !gates.hack58, JSON.stringify(gates));
  await p.evaluate(() => { const s = window.z2m.state(); s.fork = 'kitten'; s.money = 5000; s.lastForks = []; });
  await p.reload(); await enter(p);
  const hc0 = (await st(p)).deck.health;
  await p.waitForTimeout(450); await p.click('#forkA');
  s = await st(p);
  ok('развилка с котёнком кладёт карту здоровья и больше не повторяется', s.deck.health === hc0 + 1 && s.lastForks.includes('!kitten') && !(await p.evaluate(() => Core.forkAllowed(window.z2m.state(), 'kitten'))) && /\+1 карта Здоровья/.test(await p.textContent('#msg')), await p.textContent('#msg'));
  await p.evaluate(() => { const s = window.z2m.state(); s.fork = 'mortgage'; s.home = 1; s.money = 1000; s.month = 8 * 12; });
  await p.reload(); await enter(p);
  const bc0 = (await st(p)).deck.bill;
  ok('ипотека честно пишет про карты счетов', /\+2 карты Счетов/.test(await p.textContent('#forkA')), await p.textContent('#forkA'));
  await p.waitForTimeout(450); await p.click('#forkA');
  s = await st(p);
  ok('ипотека: жильё сразу, две карты счетов в колоду', s.home === 2 && s.deck.bill === bc0 + 2 && s.money === 250, JSON.stringify({ home: s.home, bill: s.deck.bill, money: s.money }));
  /* три варианта: золотой за рекламу, обычный, отказ */
  await p.evaluate(() => { const s = window.z2m.state(); s.fork = 'overtime'; s.money = 800; s.health = 70; s.month = 30; });
  await p.reload(); await enter(p);
  ok('в развилке три кнопки: золотая, обычная и отказ', (await p.locator('#forkLay .opt:visible').count()) === 3 && /за рекламу/.test(await p.textContent('#forkG')) && /здоровье не тратится/.test(await p.textContent('#forkG')), await p.textContent('#forkG'));
  const g0 = await st(p);
  const gBase = await p.evaluate(() => Core.baseSalary(window.z2m.state()));
  await p.waitForTimeout(450); await p.click('#forkG');
  ok('золотая кнопка открывает заглушку рекламы и ничего не применяет', await p.locator('#adLay').isVisible() && (await st(p)).fork === 'overtime' && /Осталось \d с/.test(await p.textContent('#adLeft')), await p.textContent('#adLeft'));
  await p.click('#adBack');
  ok('из заглушки можно вернуться к выбору без последствий', !(await p.locator('#adLay').isVisible()) && await p.locator('#forkLay').isVisible() && (await st(p)).money === g0.money && (await st(p)).flags.gold === 0);
  await p.evaluate(() => { window.z2m.adMs = 300; });
  await p.waitForTimeout(450); await p.click('#forkG');
  await p.waitForTimeout(200);
  ok('пока таймер идёт, выбор не применён', (await st(p)).fork === 'overtime');
  await p.waitForTimeout(400);
  s = await st(p);
  ok('после таймера золотой вариант сработал: деньги те же, здоровье цело', s.fork === null && s.money === g0.money + gBase * 3 && s.health === g0.health && s.flags.gold === 1 && !(await p.locator('#forkLay').isVisible()), JSON.stringify({ d: s.money - g0.money, hp: s.health - g0.health }));
  ok('цель «без золотого варианта» в этой жизни закрыта', await p.evaluate(() => Core.goalLost(window.z2m.state(), 'nogold')));
  const gold2 = await p.evaluate(() => {
    const a = Core.newState(); Object.assign(a, { fork: 'startup', money: 10000 });
    const plain = Core.fork(a);
    const b = Core.newState(); Object.assign(b, { fork: 'scam', money: 10000 });
    return { note: plain.gold.note, plainNote: plain.options[0].note, scam: Core.fork(b).gold, leak: '_gold' in a };
  });
  ok('рискованная развилка: золотой даёт +20% к шансу, у мошенников золотого нет', /^55%/.test(gold2.note) && /^35%/.test(gold2.plainNote) && gold2.scam === null && !gold2.leak, JSON.stringify(gold2));
  await p.evaluate(() => { const s = window.z2m.state(); s.fork = null; s.money = 800; s.month = 30; window.z2m.adMs = null; window.z2m.refresh(); });

  /* 5б. Звезда «Своего месяца»: копится пустыми месяцами, даёт выбранную тройку */
  await p.evaluate(() => document.getElementById('autoBtn').click());
  await p.waitForTimeout(1300);
  await skipForks(p, false);
  await fix(p, { charge: 8, reels4: false, xp: { work: 0, study: 0, health: 0, network: 0 } });
  ok('неполная звезда выключена и показывает заряд', await p.locator('#chargeBtn').isDisabled() && (await p.textContent('#chargeVal')) === '8/10');
  for (let i = 0; i < 2; i++) {
    await p.evaluate(() => { const q = [0.1, 0.5, 0.8]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
    await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  }
  s = await st(p);
  ok('два пустых месяца дозарядили звезду', s.charge === 10 && await p.locator('#chargeBtn').isEnabled(), 'заряд ' + s.charge);
  await p.evaluate(() => { const q = [0.1, 0.5, 0.8]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
  await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  ok('полная звезда дальше не копится', (await st(p)).charge === 10);
  const skill0 = (await st(p)).skill, m0 = (await st(p)).month;
  await p.click('#chargeBtn');
  ok('звезда открывает выбор из четырёх символов', await p.locator('#chargeLay').isVisible() && (await p.locator('#chargeOpts .opt').count()) === 4);
  await p.waitForTimeout(450);
  await p.click('#chargeLater');
  ok('«Позже» закрывает окно и не тратит звезду', !(await p.locator('#chargeLay').isVisible()) && (await st(p)).charge === 10);
  await p.click('#chargeBtn');
  await p.waitForTimeout(450);
  await p.click('#chargeOpts .opt[data-sym="study"]');
  await p.waitForTimeout(1500);
  s = await st(p);
  ok('выбранная учёба выпала тройкой: навык +4, звезда потрачена', s.skill === skill0 + 4 && s.charge === 0 && s.month === m0 + 1 && s.xp.study === 3, JSON.stringify({ skill: s.skill - skill0, charge: s.charge, xp: s.xp.study }));
  ok('на барабанах три учёбы', (await p.evaluate(() => Array.from(document.querySelectorAll('.reel:not(.reel-4) img')).map((i) => i.src))).every((v, i, a) => v === a[0]));

  /* 5в. Уровни символов и четвёртый барабан */
  await fix(p, { money: 1000 });
  await p.evaluate(() => { const s = window.z2m.state(); s.xp.work = 24; window.z2m.refresh(); });
  const base1 = await p.evaluate(() => Core.baseSalary(window.z2m.state()));
  await p.evaluate(() => { const q = [0.1, 0.1, 0.5]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
  const mm = (await st(p)).money;
  await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  s = await st(p);
  ok('пара работы на 1-м уровне даёт 1 зарплату и поднимает символ до 2-го', s.xp.work === 25 && await p.evaluate(() => Core.level(window.z2m.state(), 'work')) === 2, 'опыт ' + s.xp.work);
  await p.evaluate(() => { const q = [0.1, 0.1, 0.5]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
  const before2 = await p.evaluate(() => { const s = window.z2m.state(); return { money: s.money, sal: Core.salary(s), pas: Core.passive(s), base: Core.baseSalary(s) }; });
  await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  s = await st(p);
  ok('на 2-м уровне пара работы даёт 1,25 зарплаты', Math.round(s.money - before2.money - before2.sal - before2.pas) === Math.round(before2.base * 1.25), String(s.money - before2.money - before2.sal - before2.pas) + ' при зарплате ' + before2.base);
  await p.click('#tabBtn-deck');
  ok('во вкладке «Колода» видны уровень и настоящие значения', /Уровень 2 из 3, опыт 26 из 75/.test(await p.textContent('#odds')) && /пара 1,25, тройка 6,25/.test(await p.textContent('#odds')), (await p.textContent('#odds')).slice(0, 160));
  await p.click('#tabBtn-shop');
  await fix(p, { money: 80500 });
  const any3 = await p.evaluate(() => Core.odds(window.z2m.state()).any);
  await p.locator('li[data-kind="reel"] .btn-buy').click();
  await p.waitForTimeout(450);
  s = await st(p);
  ok('четвёртый барабан куплен и виден', s.reels4 === true && await p.locator('.reel-4').isVisible() && (await p.evaluate(() => Core.odds(window.z2m.state()).any)) > any3 + 0.2);
  await fix(p, { health: 50, money: 5000 });
  await force(p, [0.1, 0.1, 0.95, 0.95]);
  const b4 = await p.evaluate(() => { const s = window.z2m.state(); return { money: s.money, sal: Core.salary(s), pas: Core.passive(s), base: Core.baseSalary(s), hp: s.health, decay: Core.healthDecay(s) }; });
  await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  s = await st(p);
  ok('две пары дают два события: премия и счета вместе', Math.round(s.money - b4.money - b4.sal - b4.pas) === Math.round(b4.base * 1.25) - b4.base && Math.abs((b4.hp - s.health) - (3 + b4.decay)) < 0.01, JSON.stringify({ d: s.money - b4.money - b4.sal - b4.pas, hp: b4.hp - s.health }));
  ok('подсвечены все четыре барабана', (await p.locator('.reel.hit-good').count()) === 2 && (await p.locator('.reel.hit-bad').count()) === 2);
  await p.click('#tabBtn-goals');
  ok('цели: девятнадцать строк, «без четвёртого барабана» уже не в этой жизни', (await p.locator('#goals li').count()) === 19 && (await p.locator('#goals li.dead').filter({ hasText: 'без четвёртого барабана' }).count()) === 1, await p.textContent('#goals'));
  await p.click('#tabBtn-shop');
  await p.evaluate(() => { const q = [0.5, 0.5, 0.5, 0.5]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
  const sk4 = (await st(p)).skill;
  await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  ok('четыре одинаковых считаются как две тройки', (await st(p)).skill === sk4 + 8, 'навык +' + ((await st(p)).skill - sk4));
  /* 5г. Множитель и другие улучшения слота */
  await fix(p, { money: 15000, reels4: false });
  ok('до покупки клетки множителя нет', !(await p.locator('#multCell').isVisible()));
  await p.locator('li[data-kind="up-mult"] .btn-buy').click();
  await p.waitForTimeout(450);
  s = await st(p);
  ok('множитель куплен: клетка появилась, шансы видны в покупке', s.up.mult === 1 && s.money === 0 && await p.locator('#multCell').isVisible() && /×2 15%, ×3 5%/.test(await p.textContent('li[data-kind="up-mult"] p')), await p.textContent('li[data-kind="up-mult"] p'));
  await force(p, [0.1, 0.5, 0.6]);
  await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  ok('в пустой месяц множитель не крутится', (await p.textContent('#multCell')) === '×' && !(await p.evaluate(() => document.getElementById('multCell').classList.contains('on'))));
  const mq = await p.evaluate(() => { const s = window.z2m.state(); return { money: s.money, sal: Core.salary(s), pas: Core.passive(s), base: Core.baseSalary(s), mult: Core.level(s, 'work') === 2 ? 1.25 : 1 }; });
  await force(p, [0.1, 0.1, 0.5]);
  await p.click('#spinBtn');
  await force(p, [0.99]);
  await p.click('#spinBtn'); await p.waitForTimeout(150);
  s = await st(p);
  ok('пара работы с множителем ×3 дала тройную премию', Math.round(s.money - mq.money - mq.sal - mq.pas) === Math.round(mq.base * mq.mult * 3) && (await p.textContent('#multCell')) === '×3' && /Множитель ×3/.test(await p.textContent('#msg')), String(s.money - mq.money - mq.sal - mq.pas) + ' при зарплате ' + mq.base);
  const mb = await p.evaluate(() => {
    const a = Core.newState(); a.up.mult = 3; a.money = 1000;
    const r1 = Core.resolve(a, ['bill', 'bill', 'work'], () => 0.999);
    const b = Core.newState(); b.up.mult = 3; b.reels4 = true; b.money = 1000;
    const base = Core.baseSalary(b);
    const r2 = Core.resolve(b, ['work', 'work', 'bill', 'bill'], () => 0.999);
    const c = Core.newState(); c.up.insure = 2;
    return { billMult: r1.mult, billEvent: r1.event, mixMult: r2.mult, mixEvent: r2.event, base, insured: Core.effect(c, 'bill', 2).salaries, mean: Core.multMean(b) };
  });
  ok('множитель не трогает Счета, страховка их уменьшает', mb.billMult === null && mb.billEvent === -mb.base && mb.mixMult === 10 && mb.mixEvent === mb.base * 10 - mb.base && mb.insured === -0.25 && Math.abs(mb.mean - 1.69) < 1e-9, JSON.stringify(mb));
  await set(p, { money: 8000, charge: 9 });
  await p.locator('li[data-kind="up-star"] .btn-buy').click();
  s = await st(p);
  ok('быстрая звезда: заряд из 8, лишнее срезано', s.up.star === 1 && s.charge === 8 && (await p.textContent('#chargeVal')) === '8/8' && await p.locator('#chargeBtn').isEnabled(), await p.textContent('#chargeVal'));
  /* 5д. Сеты, Джокер и «Удачный год» */
  await fix(p, { money: 1000, charge: 3, reels4: false, up: { mult: 0, star: 0, insure: 0, coach: 0 } });
  const st0 = await st(p);
  await force(p, [0.1, 0.5, 0.7]);
  await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  s = await st(p);
  ok('работа, учёба и связи собрали сет: навык +2, связи +1, звезда не заряжается', s.skill === st0.skill + 2 && s.network === st0.network + 1 && s.charge === 3 && s.flags.sets.includes('intern') && /Сет «Стажировка мечты»/.test(await p.textContent('#msg')) && (await p.locator('.reel.hit-good').count()) === 3, await p.textContent('#msg'));
  await p.click('#tabBtn-deck');
  const setsText = await p.textContent('#sets');
  ok('во вкладке «Колода» шесть сетов с шансами', (await p.locator('#sets li').count()) === 6 && /Стажировка мечты\d+,\d\d%/.test(setsText), setsText.slice(0, 80));
  /* с одним Джокером при фокусе на работе: учёба до .552, здоровье до .655, джокер от .966 */
  await fix(p, { money: 1000, deck: Object.assign({}, D0, { wild: 1 }) });
  const jk0 = await st(p);
  await force(p, [0.99, 0.5, 0.6]);
  await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  s = await st(p);
  ok('Джокер достроил пару к первому слева символу', s.skill === jk0.skill + 1 && (await p.locator('.reel.hit-good').count()) === 2, 'навык +' + (s.skill - jk0.skill));
  const jk = await p.evaluate(() => { const a = Core.newState(); a.deck.wild = 1; const o = Core.odds(a); a.money = 30000; const cost = Core.addCost(a, 'wild'); Core.act(a, 'add:wild'); return { cost, wild: a.deck.wild, next: Core.addCost(a, 'wild'), sum: Core.SYMBOLS.reduce((x, k) => x + o[k].p, 0), bills: JSON.stringify(Core.evaluate(a, ['bill', 'wild', 'bill']).combos) }; });
  ok('Джокер покупается за $20 000, к Счетам не примыкает', jk.cost === 20000 && jk.wild === 2 && jk.next === 120000 && Math.abs(jk.sum - 1) < 1e-9 && /"sym":"bill","count":2/.test(jk.bills), JSON.stringify(jk));
  await p.click('#tabBtn-shop');
  await fix(p, { money: 1000, boost: 0, boostAt: 0 });
  await p.evaluate(() => { window.z2m.adMs = 250; });
  await p.locator('li[data-kind="boost"] .btn-buy').click();
  ok('«Удачный год» открывает заглушку рекламы', await p.locator('#adLay').isVisible() && (await st(p)).boost === 0);
  await p.waitForTimeout(450);
  const bs = await p.evaluate(() => { const s = window.z2m.state(); return { boost: s.boost, money: s.money, sal: Core.salary(s), pas: Core.passive(s), month: s.month, at: s.boostAt }; });
  await force(p, [0.1, 0.5, 0.6]);
  await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  s = await st(p);
  ok('после рекламы 12 месяцев доход вдвое, потом 24 месяца отдыха', bs.boost === 12 && bs.at === bs.month + 36 && s.money - bs.money === 2 * (bs.sal + bs.pas) && s.boost === 11 && /доходы ×2/.test(await p.textContent('#goalText')) && await p.locator('li[data-kind="boost"] .btn-buy').isDisabled(), JSON.stringify({ d: s.money - bs.money, sal: bs.sal, boost: s.boost }));
  await p.evaluate(() => { const s = window.z2m.state(); s.fork = null; s.charge = 0; s.boost = 0; window.z2m.adMs = null; window.z2m.refresh(); document.getElementById('autoBtn').click(); });

  /* 6. Сохранение и офлайн */
  await p.click('#autoBtn');
  await p.evaluate((k) => { const set = localStorage.setItem.bind(localStorage); localStorage.setItem = (key, val) => { if (key === k) { const v = JSON.parse(val); v.t = Date.now() - 30 * 60000; val = JSON.stringify(v); } set(key, val); }; }, KEY);
  await p.evaluate(() => { const s = window.z2m.state(); if (s.fork) s.fork = null; });
  await p.click('#autoBtn');
  await p.evaluate(() => window.z2m.refresh());
  const wk = (await st(p)).month;
  await p.reload(); await enter(p);
  ok('офлайн: окно показано', await p.locator('#overlay').isVisible() && (await p.textContent('#modalTitle')) === 'Пока тебя не было');
  s = await st(p);
  ok('офлайн: 30 минут дали потолок 12 месяцев', s.month - wk === 12, 'месяцев: ' + (s.month - wk));
  ok('офлайн не открывает развилок', s.fork === null);
  if (await p.locator('#modalAlt').isVisible()) {
    const gotText = await p.textContent('#modalAlt');
    const off0 = (await st(p)).money;
    await p.evaluate(() => { window.z2m.adMs = 200; });
    await p.waitForTimeout(450); await p.click('#modalAlt');
    const adSeen = await p.locator('#adLay').isVisible() && await p.locator('#overlay').isVisible();
    await p.waitForTimeout(450);
    const got = Number(gotText.replace(/[^0-9]/g, ''));
    ok('офлайн: за рекламу доход удваивается, окно закрывается', adSeen && got > 0 && Math.round((await st(p)).money - off0) === got && !(await p.locator('#overlay').isVisible()), gotText);
    await p.evaluate(() => { window.z2m.adMs = null; });
  } else { await p.waitForTimeout(450); await p.click('#modalBtn'); }

  /* 7. Проигрыш, черта новой жизни, миллион, пенсия, опыт и наследие */
  await p.evaluate(() => { const t = window.z2m.state(); t.fork = null; t.money = 1000; t.peak = 1000; t.month = 47 * 12 - 1; window.z2m.skip(1); });
  await p.waitForTimeout(300);
  ok('проигрыш: окно', (await p.textContent('#modalTitle')) === '65 лет. Время вышло');
  ok('проигрыш: эпитафия в окне', /^[А-ЯЁ].+\.$/.test((await p.textContent('#modalBody .epitaph')) || ''), await p.textContent('#modalBody'));
  ok('проигрыш: в окне нет рекламы и покупок, только новая жизнь и опыт', (await p.locator('#overlay .modal button:visible').count()) === 2 && !/реклам/i.test(await p.textContent('#modalBox')) && (await p.textContent('#modalBody')).includes(`Опыт за эту жизнь: +${(await st(p)).paid.pts}`) && (await st(p)).paid.pts === 1 + (await st(p)).paid.goals.length, await p.textContent('#modalBody'));
  const pts0 = (await st(p)).paid.pts;
  await p.waitForTimeout(450); await p.click('#modalBtn');
  s = await st(p);
  ok('новая жизнь: опыт начислен, жизнь 2, всё с нуля', (await meta(p)).pts === pts0 && s.life === 2 && s.money === 0 && s.month === 0 && s.job === 0);
  ok('перед второй жизнью открыт выбор из трёх черт', await p.locator('#traitLay').isVisible() && (await p.locator('#traitOpts .opt').count()) === 3 && s.traitOptions.length === 3);
  await p.waitForTimeout(1800);
  ok('пока черта не выбрана, слот стоит', (await st(p)).month === 0);
  await p.evaluate(() => { window.z2m.state().traitOptions = ['scholar', 'heir', 'athlete']; });
  await p.reload(); await enter(p);
  ok('выбор черты возвращается после перезагрузки', await p.locator('#traitLay').isVisible() && (await p.locator('#traitOpts .opt[data-trait="scholar"]').count()) === 1);
  await p.waitForTimeout(450); await p.click('#traitOpts .opt[data-trait="scholar"]');
  s = await st(p);
  ok('черта «Отличник» дала две карты учёбы', s.trait === 'scholar' && s.traitOptions === null && s.deck.study === 6 && !(await p.locator('#traitLay').isVisible()), JSON.stringify(s.deck));
  ok('номер жизни виден рядом с деньгами', /жизнь 2/.test(await p.textContent('#goalText')));
  await p.click('#tabBtn-goals');
  ok('черта показана на вкладке целей', /Черта этой жизни: Отличник/.test(await p.textContent('#traitLine')));
  ok('наследие: опыта хватает на первый уровень капитала', (await p.textContent('#ptsLine')).endsWith(`опыт: ${pts0}`) && await p.locator('li[data-kind="perk-cash"] .btn-buy').isEnabled() && await p.locator('li[data-kind="perk-joker"] .btn-buy').isDisabled());
  await p.locator('li[data-kind="perk-cash"] .btn-buy').click();
  const mt1 = await meta(p);
  ok('куплен «Семейный капитал»: опыт потрачен, действует со следующей жизни', mt1.pts === pts0 - 1 && mt1.perks.cash === 1 && (await st(p)).money === 0 && (await p.evaluate((pk) => Core.newState(pk).money, mt1.perks)) === 500 && /Ур\. 2 из 4/.test(await p.textContent('li[data-kind="perk-cash"] p')), JSON.stringify(mt1.perks));
  ok('до миллиона кнопка пенсии уже на месте, но выключена: вкладка не прыгает в момент миллиона', (await st(p)).wonAt == null && await p.locator('#retireBtn').isVisible() && await p.locator('#retireBtn').isDisabled() && (await p.textContent('#retireBtn')) === 'Пенсия после миллиона');
  await p.evaluate(() => { const t = window.z2m.state(); t.fork = null; t.money = 1200000; t.month = 12 * 20; t.job = 6; window.z2m.skip(1); });
  await p.waitForTimeout(300);
  ok('миллион жизнь не заканчивает: окно с выбором', (await p.textContent('#modalTitle')) === 'Первый миллион!' && (await st(p)).status === 'playing' && (await st(p)).wonAt === 241 && (await p.locator('#overlay .modal button:visible').count()) === 2);
  await p.reload(); await enter(p);
  ok('после перезагрузки окно миллиона второй раз не всплывает', !(await p.locator('#overlay').isVisible()) && (await st(p)).status === 'playing');
  await p.evaluate(() => { const b = document.getElementById('autoBtn'); if (b.getAttribute('aria-pressed') === 'true') b.click(); });
  await p.click('#tabBtn-goals');
  ok('после миллиона на вкладке целей есть кнопка пенсии', await p.locator('#retireBtn').isEnabled() && !(await p.locator('#nextBtn').isVisible()) && /миллион есть/.test(await p.textContent('#goalText')));
  await p.click('#retireBtn');
  await p.waitForTimeout(300);
  ok('пенсия: заголовок с возрастом миллиона', /^Миллион в 38 лет$/.test(await p.textContent('#modalTitle')), await p.textContent('#modalTitle'));
  ok('пенсия: эпитафия и летопись с первым миллионом', /^[А-ЯЁ].+, .+\.$/.test(await p.textContent('#modalBody .epitaph')) && (await p.textContent('#modalBody .story')).includes('Первый миллион'), await p.textContent('#modalBody'));
  const met1 = await p.evaluate(() => Core.goalsMet(window.z2m.state()));
  const paid1 = (await st(p)).paid;
  const ptsA = pts0 - 1 + paid1.pts;
  ok('в окне новые цели, среди них «до 40» и «без инвестиций»', paid1.goals.length >= 5 && met1.includes('m40') && met1.includes('noinvest') && !met1.includes('m35') && paid1.pts === 2 + paid1.goals.length && (await p.locator('#modalBody .goals li').count()) === paid1.goals.length, met1.join(','));
  await p.reload(); await enter(p);
  ok('окно конца жизни возвращается после перезагрузки, опыт второй раз не начислен', /^Миллион в/.test(await p.textContent('#modalTitle')) && (await p.locator('#modalBody .goals li').count()) === paid1.goals.length && (await meta(p)).pts === ptsA);
  await p.waitForTimeout(450); await p.click('#modalAlt');
  ok('«Потратить опыт» ведёт в наследие, жизнь ждёт', await p.locator('#tab-goals').isVisible() && await p.locator('#nextBtn').isVisible() && (await st(p)).status === 'won' && !(await p.locator('#overlay').isVisible()));
  const doneA = (await meta(p)).goals.length;
  ok('выполненные цели отмечены', doneA >= paid1.goals.length && (await p.locator('#goals li.done').count()) === doneA);
  await p.click('#nextBtn');
  s = await st(p);
  ok('новая жизнь стартует с семейным капиталом', s.life === 3 && s.money === 500 && s.perks.cash === 1 && (await meta(p)).goals.length === doneA, 'деньги ' + s.money);
  await p.waitForTimeout(450); await p.locator('#traitOpts .opt').first().click();
  await p.evaluate(() => { const t = window.z2m.state(); t.fork = null; t.money = 1200000; t.month = 12 * 20; window.z2m.skip(1); });
  await p.waitForTimeout(800); await p.click('#modalAlt');
  await p.waitForTimeout(300);
  const met2 = await p.evaluate(() => Core.goalsMet(window.z2m.state()));
  const paid2 = (await st(p)).paid;
  ok('те же цели второй раз опыта не дают', met2.includes('m40') && !paid2.goals.includes('m40') && paid2.pts === 2 + paid2.goals.length && (await meta(p)).pts === ptsA + paid2.pts, `опыт ${(await meta(p)).pts}, новых целей ${paid2.goals.length}`);
  await p.waitForTimeout(450); await p.click('#modalBtn');
  await p.waitForTimeout(450); await p.locator('#traitOpts .opt').first().click();

  /* 8. Новая игра из меню стирает всё */
  await p.click('#menuBtn');
  await p.click('#menuNew');
  ok('первое нажатие только спрашивает', (await st(p)).life === 4 && /Нажми ещё раз/.test(await p.textContent('#menuNew')));
  await p.click('#menuNew');
  await p.waitForTimeout(300);
  s = await st(p);
  const mt0 = await meta(p);
  ok('второе нажатие стирает всё, включая цели и наследие', s.life === 1 && s.money === 0 && mt0.pts === 0 && mt0.goals.length === 0 && !mt0.perks.cash && (await p.locator('#goals li.done').count()) === 0);

  /* 9. Скрытая вкладка */
  await p.evaluate(() => { const b = document.getElementById('autoBtn'); if (b.getAttribute('aria-pressed') !== 'true') b.click(); });
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(300);
  const wHidden = (await st(p)).month;
  await p.waitForTimeout(2500);
  ok('в скрытой вкладке спины стоят', (await st(p)).month === wHidden);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(3000);
  ok('после возврата спины идут', (await st(p)).month > wHidden || !!(await st(p)).fork);
  await p.close();

  /* 9б. Сохранение прошлой версии подхватывается и получает новые поля */
  p = await mk(null, false);
  await p.evaluate((k) => {
    const old = { v: 2, money: 5200, month: 40, job: 2, skill: 9, health: 77, network: 3, home: 1, assets: 1, finlit: 0, courses: 4, focus: 'study', fork: null, lastFork: null, ms: 1, legacy: 1, life: 2, status: 'playing', peak: 5200, wonAt: null, earned: 9000 };
    localStorage.setItem(k, JSON.stringify({ S: old, M: { seenHelp: true, auto: false }, t: Date.now() }));
    /* текущая страница при закрытии не должна перезаписать подложенное сохранение */
    localStorage.setItem = () => {};
  }, KEY);
  await p.reload(); await enter(p);
  s = await st(p);
  ok('старое сохранение продолжилось с колодой', s.v === 9 && s.sc === 'base' && s.scOptions === null && s.ads === 0 && s.sale === false && s.trait4 === false && s.up.mult === 0 && s.flags.gold === 0 && s.deck.wild === 0 && s.perks.genes === 0 && /опыт: 1$/.test(await p.textContent('#ptsLine')) && s.money === 5200 && s.job === 2 && s.life === 2 && s.charge === 0 && s.xp.work === 0 && s.reels4 === false && s.deck.work === 8 && s.deck.study === 5 && s.deck.coin === 1 && s.deck.chance === 4 && s.deck.bill === 4 && s.trait === null, JSON.stringify({ v: s.v, money: s.money, deck: s.deck }));
  await p.close();

  /* 10. Хранилище запрещено */
  p = await mk(null, false, () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await p.waitForTimeout(500);
  await p.waitForTimeout(450); await p.click('#modalBtn');
  await p.waitForTimeout(3200);
  ok('без localStorage игра идёт', (await st(p)).month >= 1);
  await p.close();

  /* 11. Уменьшение анимации */
  p = await mk({ viewport: { width: 390, height: 780 }, reducedMotion: 'reduce' });
  await p.waitForTimeout(4600);
  s = await st(p);
  ok('reduced motion: спины идут в обычном темпе', s.month >= 1 && s.month <= 3, 'месяцев: ' + s.month);
  ok('reduced motion: летящих монет и конфетти нет', (await p.locator('#fly > *').count()) === 0);
  await p.close();

  /* 12. Телефон: всё помещается в экран без прокрутки страницы */
  for (const [w, h] of [[412, 839], [360, 640], [390, 844]]) {
    p = await mk({ viewport: { width: w, height: h } });
    await p.waitForTimeout(500);
    const m = await p.evaluate(() => ({
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pageScroll: document.documentElement.scrollHeight - window.innerHeight,
      slotBottom: Math.round(document.querySelector('.slot').getBoundingClientRect().bottom),
      desk: Math.round(document.querySelector('.desk').getBoundingClientRect().height),
      clipped: Array.from(document.querySelectorAll('.focus button span, .btn-small, .btn-spin')).filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).length,
      focusFits: document.querySelector('.focus').scrollWidth <= document.querySelector('.focus').clientWidth + 1,
    }));
    ok(`телефон ${w}×${h}: без прокрутки страницы, слот у нижнего края, подписи целые`, m.over === 0 && m.pageScroll <= 0 && m.slotBottom === h && m.clipped === 0 && m.focusFits && m.desk >= 150, JSON.stringify(m));
    await p.evaluate(() => { const s = window.z2m.state(); s.up.mult = 3; s.reels4 = true; window.z2m.refresh(); });
    const m5 = await p.evaluate(() => ({
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      slotBottom: Math.round(document.querySelector('.slot').getBoundingClientRect().bottom),
      clipped: Array.from(document.querySelectorAll('.focus button span, .btn-small, .btn-spin')).filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).length,
      reelsFit: document.getElementById('reels').scrollWidth <= document.getElementById('reels').clientWidth + 1,
      cells: Array.from(document.querySelectorAll('.reel, #multCell')).filter((e) => e.offsetParent).length,
    }));
    ok(`телефон ${w}×${h}: четыре барабана и множитель помещаются`, m5.over === 0 && m5.slotBottom === h && m5.clipped === 0 && m5.reelsFit && m5.cells === 5, JSON.stringify(m5));
    await p.click('#tabBtn-deck');
    const dk = await p.evaluate(() => ({
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tabs: Array.from(document.querySelectorAll('.tabs button')).filter((e) => e.scrollWidth > e.clientWidth + 1).length,
      clipped: Array.from(document.querySelectorAll('#deck h3, #deck .btn-buy b, #deck .btn-buy span, #deck .max-btn')).filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
      rows: Array.from(new Set(Array.from(document.querySelectorAll('#deck li')).slice(1).map((li) => Math.round(li.getBoundingClientRect().height)))),
    }));
    ok(`телефон ${w}×${h}: колода помещается, строки одной высоты`, dk.over === 0 && dk.tabs === 0 && dk.clipped.length === 0 && dk.rows.length === 1, JSON.stringify(dk));
    await p.close();
  }

  /* 12б. Десктоп: подписи фокуса и кнопок целые, строки покупок одной высоты */
  p = await mk({ viewport: { width: 1280, height: 800 } });
  await p.waitForTimeout(300);
  const dsk = await p.evaluate(() => ({
    clipped: Array.from(document.querySelectorAll('.focus button span, .btn-small, .btn-spin, .btn-buy b, .btn-buy span, .shop h3')).filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
    rows: Array.from(new Set(Array.from(document.querySelectorAll('#shop li')).slice(1).map((li) => Math.round(li.getBoundingClientRect().height)))),
  }));
  ok('десктоп: подписи целые, строки покупок одной высоты', dsk.clipped.length === 0 && dsk.rows.length === 1, JSON.stringify(dsk));
  await p.close();

  /* 13. Полная жизнь через кнопки интерфейса */
  p = await mk();
  await p.waitForTimeout(400);
  await p.click('#autoBtn');
  const result = await p.evaluate(() => {
    const S = () => window.z2m.state();
    const SEL = { 'cut:bill': 'bill', 'add:study': 'study', 'up:mult': 'up-mult', 'up:star': 'up-star', 'up:insure': 'up-insure', 'up:coach': 'up-coach', 'add:wild': 'wild' };
    const q = (k) => document.querySelector(`li[data-kind="${SEL[k] || k}"] .btn-buy`);
    let guard = 0;
    while (S().status === 'playing' && guard++ < 700) {
      if (S().wonAt != null) { Core.retire(S()); break; }
      while (!q('job').hidden && !q('job').disabled) q('job').click();
      if (S().health < 40 && !q('gym').disabled) q('gym').click();
      const focus = S().health < 35 ? 'health' : (Core.nextJob(S()) && Core.age(S()) < 40 ? 'study' : 'work');
      if (S().focus !== focus) document.querySelector(`.focus button[data-focus="${focus}"]`).click();
      if (S().money < 600000) {
        const opts = ['asset', 'home', 'cut:bill', 'add:study', 'reel', 'up:mult', 'up:star', 'up:insure', 'up:coach'].filter((k) => k !== 'add:study' || (Core.nextJob(S()) && S().bought.study < 6)).map((k) => ({ b: q(k), cost: Core.costOf(S(), k) }))
          .filter((o) => o.cost != null && !o.b.disabled && S().money >= o.cost * 2).sort((a, b) => a.cost - b.cost);
        if (opts.length) opts[0].b.click();
      }
      window.z2m.skip(1);
    }
    const s = S();
    return { status: s.status, age: 18 + Math.floor((s.wonAt == null ? s.month : s.wonAt) / 12), job: s.job, home: s.home, assets: s.assets, title: document.getElementById('modalTitle').textContent };
  });
  ok('полная жизнь через интерфейс заканчивается миллионом между 38 и 64', result.status === 'won' && result.age >= 38 && result.age <= 64, JSON.stringify(result));
  await p.close();

  /* 14. Меню с сохранением: продолжить, пауза из игры, новая игра в два нажатия */
  p = await mk();
  await skipForks(p, true);
  await p.evaluate(() => { const s = window.z2m.state(); s.money = 4321; s.month = 30; window.z2m.refresh(); });
  await p.click('#menuBtn');
  ok('кнопка меню в игре открывает меню', await p.locator('#menuLay').isVisible() && (await p.textContent('#menuPlay')) === 'Продолжить' && await p.locator('#menuNew').isVisible());
  const mm0 = (await st(p)).month;
  await p.waitForTimeout(2500);
  ok('меню ставит игру на паузу', (await st(p)).month === mm0);
  await p.click('#menuPlay');
  await p.waitForTimeout(3200);
  ok('«Продолжить» возвращает в игру, слот крутится', !(await p.locator('#menuLay').isVisible()) && (await st(p)).month > mm0);
  await skipForks(p, false);
  await p.evaluate(() => { const s = window.z2m.state(); s.fork = null; s.money = 4321; window.z2m.refresh(); document.getElementById('autoBtn').click(); });
  await p.reload();
  await p.waitForSelector('#menuPlay', { state: 'visible' });
  ok('после перезагрузки меню показывает сохранение', (await p.textContent('#menuPlay')) === 'Продолжить' && /Жизнь 1 · \d+ (год|года|лет) · \$4\s321/.test(await p.textContent('#menuSave')) && /Целей: 0 из 19/.test(await p.textContent('#menuStats')), await p.textContent('#menuSave'));
  await p.click('#menuNew');
  ok('«Новая игра» сначала спрашивает', /Нажми ещё раз/.test(await p.textContent('#menuNew')) && (await st(p)).money === 4321 && await p.locator('#menuLay').isVisible());
  await p.click('#menuNew');
  await p.waitForTimeout(300);
  s = await st(p);
  ok('второе нажатие начинает с нуля и сразу пускает в игру', s.money === 0 && s.month === 0 && s.life === 1 && !(await p.locator('#menuLay').isVisible()) && !(await p.locator('#overlay').isVisible()));
  await p.close();

  /* 15. Магазин за настоящие деньги (сейчас тестовая оплата): вход, покупки, хранение, темы, честность */
  p = await mk(null, 'menu');
  await p.waitForSelector('#menuPlay', { state: 'visible' });
  const owned = (q) => q.evaluate((k) => { const v = JSON.parse(localStorage.getItem(k) || 'null'); return (v && v.M && v.M.owned) || []; }, KEY);
  const theme = (q) => q.evaluate(() => document.documentElement.dataset.theme || 'base');
  ok('в меню есть «Магазин» и честная строка про покупки', await p.locator('#menuStore').isVisible() && /деньги не списываются/.test(await p.textContent('.menu-foot')) && !/Настоящих денег в игре нет/.test(await p.textContent('#menuLay')));
  await p.click('#menuStore');
  const NIDS = await p.evaluate(() => [Core.STORE_SHELVES.length, Core.STORE_IDS.length]);
  ok(`магазин открывается из меню: ${NIDS[0]} полки, ${NIDS[1]} товаров, цены «тест»`, await p.locator('#storeLay').isVisible() && (await p.locator('.store-shelf').count()) === NIDS[0] && (await p.locator('[data-buy]').count()) === NIDS[1] && (await p.locator('[data-buy] span').allTextContents()).every((t) => t === 'тест'));
  ok('«Внешний вид»: четыре свёрнутые группы — тема, герой, дом, эпитафия, в каждой стандартный вариант выбран', JSON.stringify(await p.evaluate(() => Array.from(document.querySelectorAll('.store-group')).map((d) => d.dataset.group + (d.open ? '+' : '') + ':' + d.querySelectorAll('li').length))) === '["theme:3","hero:3","home:3","epitaph:3"]'
    && (await p.locator('[data-pick$=":base"]:disabled').count()) === 4);
  await p.evaluate(() => document.querySelectorAll('.store-group').forEach((d) => { d.open = true; }));
  await p.waitForTimeout(100);
  ok('у каждого варианта внешнего вида есть предпросмотр', (await p.locator('.store-group li .pv').count()) === 12);
  const look = async (q) => (await meta(q)).look;
  await p.click('[data-buy="hero-curls"]'); await p.click('#payCancel');
  ok('отказ от косметики: ничего не куплено и ничего не выбрано', (await owned(p)).length === 0 && (await p.locator('[data-pick="hero:curls"]').count()) === 0 && (await p.textContent('[data-group="hero"] summary span')) === 'Выбрано: Обычный облик' && (await p.locator('[data-buy="hero-curls"]').isVisible()));
  ok('в магазине нет «выгодно», скидок, таймеров и сравнений', !/выгод|скидк|осталось|было|сегодня|%/i.test(await p.textContent('#storeBox')), await p.textContent('#storeBox'));
  await p.click('[data-buy="noads"]');
  ok('покупка открывает окно тестовой оплаты', await p.locator('#payLay').isVisible() && /Тестовая покупка\. Деньги не списываются/.test(await p.textContent('#payBox')) && (await p.textContent('#payPrice')) === 'тест');
  await p.click('#payCancel');
  ok('отказ: ничего не куплено, никаких повторных предложений', !(await p.locator('#payLay').isVisible()) && await p.locator('#storeLay').isVisible() && (await p.textContent('#storeNote')) === '' && (await p.textContent('[data-buy="noads"] b')) === 'Купить' && !(await p.locator('#overlay').isVisible()) && (await owned(p)).length === 0);
  await p.evaluate(() => { window.z2m.pay = 'error'; });
  await p.click('[data-buy="thanks"]');
  ok('ошибка оплаты: ничего не куплено, спокойная строка', /не прошла/.test(await p.textContent('#storeNote')) && (await owned(p)).length === 0 && await p.locator('[data-buy="thanks"]').isVisible());
  await p.evaluate(() => { window.z2m.pay = null; });
  const ALLIDS = await p.evaluate(() => Core.STORE_IDS);
  for (const id of ALLIDS) { await p.click(`[data-buy="${id}"]`); await p.click('#payOk'); await p.waitForTimeout(50); }
  ok('все товары покупаются через заглушку', JSON.stringify(await owned(p)) === JSON.stringify(ALLIDS) && (await p.locator('[data-buy]').count()) === 0 && (await p.locator('[data-pick]').count()) === 12);
  await p.evaluate(() => { window.z2m.payRestore = ['thanks', 'nope']; });
  await p.click('#storeRestore');
  ok('«Восстановить покупки» не дарит лишнего и не дублирует', /Новых покупок не найдено/.test(await p.textContent('#storeNote')) && (await owned(p)).length === ALLIDS.length);
  await p.click('#storeClose');
  ok('магазин закрывается в один тап, в меню видна благодарность', !(await p.locator('#storeLay').isVisible()) && await p.locator('#menuThanks').isVisible() && /ничего не меняет в игре/i.test(await p.evaluate(() => Core.STORE.thanks.note)));
  /* темы меняют только цвета: ни одна рамка не сдвигается */
  await p.click('#menuPlay'); await p.waitForTimeout(500); await p.click('#modalBtn');
  /* сценарии куплены до первого входа: первая жизнь начинается с выбора старта */
  await p.waitForTimeout(300);
  ok('купленные до первого входа сценарии предложены в первой жизни', await p.locator('#scLay').isVisible() && (await p.locator('#scOpts [data-sc]').count()) === 4);
  await p.waitForTimeout(450); await p.click('#scOpts [data-sc="base"]'); await p.waitForTimeout(200);
  await p.evaluate(() => { if (document.getElementById('autoBtn').getAttribute('aria-pressed') === 'true') document.getElementById('autoBtn').click(); });
  const boxes = () => p.evaluate(() => ['.stage', '.scene-wrap', '.hud', '.slot', '.desk', '.tabs', '.ctrl', '#spinBtn', '#money', '.chips', '.focus', '#reels', '#storeBtn']
    .concat(Array.from(document.querySelectorAll('#shop li')).map((li) => `#shop li[data-kind="${li.dataset.kind}"]`))
    .map((q) => { const r = document.querySelector(q).getBoundingClientRect(); return [q, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(':'); }).join('|'));
  await p.waitForTimeout(400);
  const bx0 = await boxes(), col0 = await p.evaluate(() => getComputedStyle(document.querySelector('.stage')).borderTopColor);
  ok('вход в магазин из игры виден', await p.locator('#storeBtn').isVisible());
  for (const t of ['bill', 'dusk']) {
    await p.click('#storeBtn'); await p.click(`[data-pick="theme:${t}"]`); await p.click('#storeClose'); await p.waitForTimeout(400);
    ok(`тема «${t}» выбрана и меняет только цвета`, (await theme(p)) === t && (await boxes()) === bx0 && (await p.evaluate(() => getComputedStyle(document.querySelector('.stage')).borderTopColor)) !== col0 && (await look(p)).theme === t);
  }
  /* облик, стиль дома и эпитафия: применяются сразу, рамки на месте, предпросмотр — тот же рисунок, что на сцене */
  const sceneSvg = () => p.evaluate(() => ({ hero: document.getElementById('charBody').innerHTML, home: document.querySelector('#home > g').innerHTML, box: document.getElementById('scene').getBoundingClientRect().height }));
  const sc0 = await sceneSvg();
  await p.click('#storeBtn');
  for (const pick of ['hero:street', 'home:nord', 'epitaph:paper']) await p.click(`[data-pick="${pick}"]`);
  const pv = await p.evaluate(() => ({ hero: document.querySelector('[data-item="hero-street"] svg').innerHTML, home: document.querySelector('[data-item="home-nord"] svg').innerHTML }));
  await p.click('#storeClose'); await p.waitForTimeout(400);
  const sc1 = await sceneSvg();
  ok('облик и стиль дома видны на сцене сразу, без перезагрузки', sc1.hero !== sc0.hero && sc1.home !== sc0.home && JSON.stringify(await look(p)) === JSON.stringify({ theme: 'dusk', hero: 'street', home: 'nord', epitaph: 'paper' }));
  ok('предпросмотр в магазине — тот же рисунок, что на сцене', pv.hero === sc1.hero && pv.home.includes(sc1.home));
  ok('косметика не двигает ни одной рамки', (await boxes()) === bx0 && sc1.box === sc0.box);
  /* покупки переживают перезагрузку, новую жизнь и «Новую игру» */
  await p.reload(); await enter(p);
  ok('после перезагрузки покупки и выбор на месте', (await owned(p)).length === ALLIDS.length && (await theme(p)) === 'dusk' && JSON.stringify(await look(p)) === JSON.stringify({ theme: 'dusk', hero: 'street', home: 'nord', epitaph: 'paper' }) && /#FF5A7A/.test(await p.evaluate(() => document.getElementById('charBody').innerHTML)));
  await p.evaluate(() => { const t = window.z2m.state(); t.fork = null; t.traitOptions = null; t.money = 1000; t.peak = 1000; t.month = 47 * 12 - 1; window.z2m.skip(1); });
  await p.waitForTimeout(300);
  ok('экран проигрыша: купленное оформление эпитафии показано', await p.locator('#modalBox .chron[data-ep="paper"] .epitaph').isVisible());
  ok('экран проигрыша: ни входа в магазин, ни упоминаний покупок', (await p.textContent('#modalTitle')) === '65 лет. Время вышло' && !/магазин|покуп|купить|реклам|тест/i.test(await p.textContent('#modalBox')) && (await p.evaluate(() => getComputedStyle(document.getElementById('storeBtn')).visibility)) === 'hidden' && await p.locator('#storeBtn').isDisabled(), await p.textContent('#modalBox'));
  await p.waitForTimeout(450); await p.click('#modalBtn');
  ok('новая жизнь: покупки и выбор на месте', (await st(p)).life === 2 && (await owned(p)).length === ALLIDS.length && (await look(p)).hero === 'street');
  await p.evaluate(() => { const s = window.z2m.state(); s.traitOptions = null; document.getElementById('traitLay').hidden = true; });
  await p.reload();
  await p.waitForSelector('#menuNew', { state: 'visible' });
  await p.click('#menuNew'); await p.click('#menuNew'); await p.waitForTimeout(300);
  ok('«Новая игра» стирает жизнь, но не покупки и выбор', (await st(p)).life === 1 && (await owned(p)).length === ALLIDS.length && JSON.stringify(await look(p)) === JSON.stringify({ theme: 'dusk', hero: 'street', home: 'nord', epitaph: 'paper' }) && (await theme(p)) === 'dusk');
  await p.close();

  /* Косметика не меняет ни одного числа: одна и та же жизнь с одной очередью случайностей со стандартным набором
     и со всем купленным и выбранным даёт одинаковое состояние до поля */
  const lifeWith = async (M) => {
    const q = await mk(null, 'menu', { content: `if (!sessionStorage.getItem('z2m-same')) { sessionStorage.setItem('z2m-same', '1'); localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify({ M }))}); }` });
    await q.waitForSelector('#menuPlay', { state: 'visible' });
    const r = await q.evaluate(() => {
      let a = 20261123;
      Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      window.z2m.skip(400);
      return JSON.stringify(window.z2m.state());
    });
    const lk = (await meta(q)).look;
    await q.context().close();
    return { r, lk };
  };
  const plain = await lifeWith({ seenHelp: true, auto: false });
  const dressed = await lifeWith({ seenHelp: true, auto: false, owned: ALLIDS, look: { theme: 'bill', hero: 'curls', home: 'terra', epitaph: 'postcard' } });
  ok('косметика не меняет ни одного числа: жизнь со всем выбранным совпадает со стандартной до поля', plain.r === dressed.r && dressed.lk.hero === 'curls' && dressed.lk.home === 'terra' && JSON.parse(plain.r).month >= 300, plain.r === dressed.r ? '' : 'расходятся');

  /* 16. Удобство: скорость ×8 и автопокупки есть только у владельца и считают ту же жизнь */
  p = await mk();
  await p.evaluate(() => { if (document.getElementById('autoBtn').getAttribute('aria-pressed') === 'true') document.getElementById('autoBtn').click(); });
  const speedRound = async (q) => { const out = []; for (let i = 0; i < 4; i++) { await q.click('#speedBtn'); out.push(await q.textContent('#speedBtn')); } return out; };
  const HINT = /×\s?8|автопокуп/i;
  const bodyText = (q) => q.evaluate(() => document.body.innerText);
  ok('без покупки: скорость ×1 → ×2 → ×4 → ×1, четвёртого положения нет', JSON.stringify(await speedRound(p)) === '["×2","×4","×1","×2"]');
  await p.click('#speedBtn'); await p.click('#speedBtn');
  await p.click('#tabBtn-shop');
  ok('без покупки: в «Покупках» нет строки автопокупок и ни одного намёка на них и на ×8', !(await p.locator('#autoBar').isVisible()) && !HINT.test(await bodyText(p)));
  await p.click('#menuBtn'); await p.waitForTimeout(200);
  ok('без покупки: в меню тоже ни слова', await p.locator('#menuLay').isVisible() && !HINT.test(await bodyText(p)));
  await p.click('#menuStore');
  for (const id of ['speed8', 'autobuy']) { await p.click(`[data-buy="${id}"]`); await p.click('#payCancel'); }
  await p.click('#storeClose'); await p.click('#menuPlay'); await p.waitForTimeout(300);
  ok('отказ от «Удобства»: ничего не куплено, скорость по-прежнему до ×4, строки автопокупок нет', (await owned(p)).length === 0 && JSON.stringify(await speedRound(p)) === '["×2","×4","×1","×2"]' && !(await p.locator('#autoBar').isVisible()));
  await p.click('#speedBtn'); await p.click('#speedBtn');
  await p.click('#storeBtn');
  ok('«Удобство» в магазине: две вещи, у автопокупок сказано, что они покупают то же по тем же ценам', /Скорость ×8/.test(await p.textContent('[data-item="speed8"]')) && /то же, что купил бы ты, по тем же ценам/.test(await p.textContent('[data-item="autobuy"]')));
  for (const id of ['speed8', 'autobuy']) { await p.click(`[data-buy="${id}"]`); await p.click('#payOk'); await p.waitForTimeout(50); }
  await p.click('#storeClose');
  ok('после покупки: ×8 появилось четвёртым положением', JSON.stringify(await speedRound(p)) === '["×2","×4","×8","×1"]');
  await p.click('#tabBtn-shop');
  const am = (await meta(p)).autobuy;
  ok('после покупки: строка автопокупок в «Покупках», по умолчанию всё выключено', await p.locator('#autoBar').isVisible() && /выключены/.test(await p.textContent('#autoBar')) && am.on === false && am.job === false && Object.values(am.kinds).every((v) => v === false));
  await p.click('#autoEdit');
  ok('окно «Автопокупки» открывается: главный выключатель, запас и девять правил', await p.locator('#autoLay').isVisible() && (await p.locator('#autoList button').count()) === 9 && (await p.locator('#autoRes button').count()) === 3);
  await p.evaluate(() => { if (document.getElementById('autoBtn').getAttribute('aria-pressed') !== 'true') document.getElementById('autoBtn').click(); });
  const mOpen = (await st(p)).month; await p.waitForTimeout(1500);
  ok('пока окно открыто, месяц стоит', (await st(p)).month === mOpen);
  await p.click('#autoMain'); await p.click('[data-rule="gym"]'); await p.click('[data-rule="job"]'); await p.click('[data-res="4"]');
  await p.click('#autoClose');
  await p.evaluate(() => { if (document.getElementById('autoBtn').getAttribute('aria-pressed') === 'true') document.getElementById('autoBtn').click(); });
  const rules = (m) => JSON.stringify([m.autobuy.on, m.autobuy.job, m.autobuy.kinds.gym, m.autobuy.kinds.home, m.autobuy.reserve]);
  ok('правила сохраняются: включено, спортзал и повышение, запас ×4', /2 правила · запас ×4/.test(await p.textContent('#autoBar')) && rules(await meta(p)) === '[true,true,true,false,4]', await p.textContent('#autoBar'));
  await p.click('#autoToggle');
  ok('выключаются в одно касание', (await meta(p)).autobuy.on === false && /выключены/.test(await p.textContent('#autoBar')));
  await p.click('#autoToggle');
  for (let i = 0; i < 3; i++) await p.click('#speedBtn');
  ok('×8 выбрано', (await meta(p)).speed === 8);
  await p.reload(); await enter(p);
  ok('после перезагрузки: ×8 и правила на месте', (await meta(p)).speed === 8 && rules(await meta(p)) === '[true,true,true,false,4]');
  await p.evaluate(() => { const t = window.z2m.state(); t.fork = null; t.traitOptions = null; t.money = 1000; t.peak = 1000; t.month = 47 * 12 - 1; window.z2m.skip(1); });
  await p.waitForTimeout(300);
  ok('экран проигрыша у владельца: ни магазина, ни автопокупок, ни ×8', (await p.textContent('#modalTitle')) === '65 лет. Время вышло' && !/магазин|покуп|купить|реклам|тест|×\s?8/i.test(await p.textContent('#modalBox')), await p.textContent('#modalBox'));
  await p.waitForTimeout(450); await p.click('#modalBtn');
  ok('новая жизнь: покупки и правила на месте', (await st(p)).life === 2 && (await owned(p)).includes('autobuy') && rules(await meta(p)) === '[true,true,true,false,4]');
  await p.evaluate(() => { const s = window.z2m.state(); s.traitOptions = null; document.getElementById('traitLay').hidden = true; });
  await p.reload();
  await p.waitForSelector('#menuNew', { state: 'visible' });
  await p.click('#menuNew'); await p.click('#menuNew'); await p.waitForTimeout(300);
  ok('«Новая игра» не стирает «Удобство», правила и скорость', (await st(p)).life === 1 && (await owned(p)).includes('speed8') && (await meta(p)).speed === 8 && rules(await meta(p)) === '[true,true,true,false,4]');
  await p.close();

  /* «Пока тебя не было» автопокупки не делают: догонялка идёт без них */
  {
    const ALL = { on: true, reserve: 3, job: true, kinds: { gym: true, home: true, asset: true, reel: true } };
    const q1 = await mk(null, 'menu', { content: `if (!sessionStorage.getItem('z2m-a1')) { sessionStorage.setItem('z2m-a1', '1'); localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify({ M: { seenHelp: true, auto: false, owned: ['autobuy'], autobuy: ALL } }))}); }` });
    await q1.waitForSelector('#menuPlay', { state: 'visible' }); await q1.click('#menuPlay'); await q1.waitForTimeout(300);
    await q1.evaluate(() => { const s = window.z2m.state(); Object.assign(s, { money: 50000, peak: 50000, ms: 9, fork: null, traitOptions: null, health: 40 }); window.z2m.refresh(); });
    const saved = await q1.evaluate((k) => { const v = JSON.parse(localStorage.getItem(k)); v.t = Date.now() - 30 * 60000; v.M.auto = true; return JSON.stringify(v); }, KEY);
    const before = JSON.parse(saved).S;
    await q1.context().close();
    const q = await mk(null, 'menu', { content: `if (!sessionStorage.getItem('z2m-a2')) { sessionStorage.setItem('z2m-a2', '1'); localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(saved)}); }` });
    await q.waitForSelector('#menuPlay', { state: 'visible' }); await q.click('#menuPlay'); await q.waitForTimeout(300);
    const r = await q.evaluate(() => { const s = window.z2m.state(); return { title: document.getElementById('modalTitle').textContent, shown: !document.getElementById('overlay').hidden, log: window.z2m.meta().log.map((e) => e.text), month: s.month, job: s.job, home: s.home, assets: JSON.stringify(s.assets) }; });
    ok('«Пока тебя не было»: год прошёл без автопокупок', r.shown && r.title === 'Пока тебя не было' && r.month === before.month + 12 && !r.log.some((t) => /Автопокупка/.test(t)) && r.home === before.home && r.assets === JSON.stringify(before.assets), JSON.stringify(r).slice(0, 300));
    await q.context().close();
  }

  /* Одна и та же очередь случайностей: ×1 и ×8 дают одну жизнь; автопокупки равны тем же ручным нажатиям */
  const seeded = `let a = 20261124; Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };`;
  const lifePage = async (M) => {
    const q = await mk(null, 'menu', { content: `localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify({ M }))});` });
    await q.waitForSelector('#menuPlay', { state: 'visible' });
    await q.click('#menuPlay'); await q.waitForTimeout(200);
    await q.evaluate(seeded);
    await q.click('#tabBtn-shop');
    return q;
  };
  /* один месяц ручным нажатием «Крутить», потом окна развилки, черты и событий закрываются одним и тем же выбором */
  const oneMonth = async (q, forks) => {
    const m = (await st(q)).month;
    await q.click('#spinBtn');
    await q.waitForFunction((mm) => window.z2m.state().month > mm, m, { timeout: 15000 });
    for (let k = 0; k < 40; k++) {
      await q.waitForTimeout(k ? 150 : 60);
      const w = await q.evaluate(() => ({ fork: !document.getElementById('forkLay').hidden, trait: !document.getElementById('traitLay').hidden, modal: !document.getElementById('overlay').hidden, f: !!window.z2m.state().fork, t: !!window.z2m.state().traitOptions }));
      if (w.fork) { forks.n++; await q.waitForTimeout(450); await q.click('#forkB'); continue; }
      if (w.trait) { await q.waitForTimeout(450); await q.locator('#traitOpts button').first().click(); continue; }
      if (w.modal) { await q.waitForTimeout(450); await q.click('#modalBtn'); continue; }
      if (!w.f && !w.t && k > 3) break;
    }
  };
  const runLife = async (M, n, between) => {
    const q = await lifePage(M), forks = { n: 0 }, trail = [];
    for (let i = 0; i < n && (await st(q)).status === 'playing'; i++) {
      await oneMonth(q, forks);
      if (between) await between(q, i);
      trail.push(JSON.stringify(await st(q)));
    }
    await q.context().close();
    return { trail, forks: forks.n };
  };
  const N8 = 30;
  const slow = await runLife({ seenHelp: true, auto: false, speed: 1 }, N8);
  const quick = await runLife({ seenHelp: true, auto: false, speed: 8, owned: ['speed8'] }, N8);
  const diff = slow.trail.findIndex((x, i) => x !== quick.trail[i]);
  ok(`×1 и ×8 при одной очереди случайностей: ${N8} месяцев совпадают до поля`, diff === -1 && slow.trail.length === N8 && quick.trail.length === N8, diff === -1 ? `развилок: ${slow.forks}` : `расходятся с месяца ${diff + 1}`);
  ok('на ×8 развилки открываются так же', quick.forks === slow.forks && quick.forks > 0, `развилок ${quick.forks} и ${slow.forks}`);

  const NA = 120, ALL_AUTO = { on: true, reserve: 3, job: true, kinds: Object.fromEntries(['gym', 'home', 'asset', 'reel', 'up:mult', 'up:star', 'up:insure', 'up:coach'].map((k) => [k, true])) };
  const bought = [];
  const auto = await runLife({ seenHelp: true, auto: false, speed: 8, owned: ['speed8', 'autobuy'], autobuy: ALL_AUTO }, NA, async (q, i) => { bought[i] = await q.evaluate(() => window.z2m.autoLast()); });
  const hand = await runLife({ seenHelp: true, auto: false, speed: 8, owned: ['speed8'] }, NA, async (q, i) => {
    for (const k of bought[i] || []) await q.evaluate((kind) => document.querySelector(`#shop li[data-kind="${kind.replace(':', '-')}"] .btn-buy`).click(), k);
  });
  const nb = bought.flat();
  const ad = auto.trail.findIndex((x, i) => x !== hand.trail[i]);
  ok(`автопокупки равны ручным нажатиям тех же покупок в те же месяцы: ${NA} месяцев совпадают до поля`, ad === -1 && auto.trail.length === hand.trail.length && nb.length > 5, ad === -1 ? `автопокупок ${nb.length}: ${[...new Set(nb)].join(', ')}` : `расходятся с месяца ${ad + 1}`);
  ok('автопокупки не уводят деньги в минус', auto.trail.every((x) => JSON.parse(x).money >= 0));

  /* 17. Новые жизни: платные сценарии старта видны только купленные, колоду и шансы не меняют, на экране проигрыша их нет */
  p = await mk();
  ok('без покупки: окна выбора старта нет', !(await p.locator('#scLay').isVisible()) && (await st(p)).scOptions === null && (await st(p)).sc === 'base');
  await p.click('#storeBtn');
  const livesText = await p.evaluate(() => [...document.querySelectorAll('.store-shelf')].find((x) => /Новые жизни/.test(x.querySelector('h3').textContent)).textContent);
  const scNames = await p.evaluate(() => ['sc-loan', 'sc-late', 'sc-flat'].map((id) => Core.STORE[id].name));
  ok('полка «Новые жизни»: три сценария, у каждого сказано, что колода, шансы и цены те же', scNames.every((n) => livesText.includes(n)) && (livesText.match(/Колода, шансы, выплаты и цены те же/g) || []).length === 3, livesText.slice(0, 200));
  await p.click('[data-buy="sc-late"]'); await p.click('#payCancel');
  await p.click('[data-buy="sc-loan"]'); await p.click('#payOk'); await p.waitForTimeout(50);
  await p.click('#storeClose'); await p.waitForTimeout(200);
  ok('куплен один сценарий, отказ от второго ничего не купил, текущая жизнь не тронута', JSON.stringify(await owned(p)) === '["sc-loan"]' && (await st(p)).scOptions === null && !(await p.locator('#scLay').isVisible()));
  await p.evaluate(() => { const t = window.z2m.state(); t.fork = null; t.money = 1000; t.peak = 1000; t.month = 47 * 12 - 1; window.z2m.skip(1); });
  await p.waitForTimeout(300);
  const lossText = await p.textContent('#modalBox');
  ok('проигрыш у владельца сценария: в окне нет ни сценариев, ни магазина, только новая жизнь и опыт', (await p.locator('#overlay .modal button:visible').count()) === 2 && !/Студент|Второй шанс|однушк|Новые жизни|магазин|реклам/i.test(lossText), lossText.slice(0, 160));
  await p.waitForTimeout(450); await p.click('#modalBtn'); await p.waitForTimeout(200);
  let s17 = await st(p);
  ok('новая жизнь: сначала выбор старта, черта ждёт', await p.locator('#scLay').isVisible() && !(await p.locator('#traitLay').isVisible()) && JSON.stringify(s17.scOptions) === '["base","loan"]' && Array.isArray(s17.traitOptions));
  ok('в окне только стандартный старт и купленный сценарий', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#scOpts [data-sc]')].map((b) => b.dataset.sc))) === '["base","loan"]');
  await p.waitForTimeout(1800);
  await p.evaluate(() => document.getElementById('spinBtn').click()); await p.waitForTimeout(300);
  ok('пока старт не выбран, слот стоит даже по нажатию «Крутить»', (await st(p)).month === 0 && (await st(p)).scOptions !== null);
  await p.reload(); await enter(p);
  ok('выбор старта возвращается после перезагрузки', await p.locator('#scLay').isVisible());
  const deck0 = JSON.stringify((await st(p)).deck);
  await p.waitForTimeout(450); await p.click('#scOpts [data-sc="loan"]'); await p.waitForTimeout(200);
  s17 = await st(p);
  const L = await p.evaluate(() => Core.SCENARIOS.loan);
  ok('сценарий применён: возраст, долг, навык; колода та же; дальше выбор черты', s17.sc === 'loan' && s17.scOptions === null && 18 + Math.floor(s17.month / 12) === L.age && s17.money < 0 && s17.skill >= L.skill && JSON.stringify(s17.deck) === deck0 && await p.locator('#traitLay').isVisible() && !(await p.locator('#scLay').isVisible()), JSON.stringify({ m: s17.month, money: s17.money, skill: s17.skill }));
  ok('вступление сценария в ленте', (await meta(p)).log.some((e) => e.text === L.intro));
  await p.waitForTimeout(450); await p.locator('#traitOpts button').first().click(); await p.waitForTimeout(200);
  await p.evaluate(() => { const t = window.z2m.state(); t.fork = null; t.money = 1000; t.peak = 1000; t.month = 47 * 12 - 1; window.z2m.skip(1); });
  await p.waitForTimeout(300);
  ok('эпитафия сценарной жизни начинается с её истории', ((await p.textContent('#modalBody .epitaph')) || '').startsWith(L.epi), await p.textContent('#modalBody .epitaph'));
  await p.waitForTimeout(450); await p.click('#modalBtn'); await p.waitForTimeout(200);
  await p.waitForTimeout(450); await p.click('#scOpts [data-sc="base"]'); await p.waitForTimeout(200);
  s17 = await st(p);
  ok('стандартный старт ничего не меняет', s17.sc === 'base' && s17.month === 0 && s17.money === (await p.evaluate(() => Core.newState(window.z2m.state().perks, 3).money)) && s17.skill === 0 && await p.locator('#traitLay').isVisible());
  await p.evaluate(() => { window.z2m.state().traitOptions = null; });
  await p.reload();
  await p.waitForSelector('#menuNew', { state: 'visible' });
  await p.click('#menuNew'); await p.click('#menuNew'); await p.waitForTimeout(300);
  ok('«Новая игра»: покупка на месте, первая жизнь тоже начинается с выбора старта', (await st(p)).life === 1 && JSON.stringify(await owned(p)) === '["sc-loan"]' && await p.locator('#scLay').isVisible() && !(await p.locator('#traitLay').isVisible()));
  await p.close();

  /* 11. Бонусы за рекламу: звезда, скидка, лимит на жизнь, четвёртая черта, честные подписи */
  p = await mk();
  await p.evaluate(() => { if (document.getElementById('autoBtn').getAttribute('aria-pressed') === 'true') document.getElementById('autoBtn').click(); window.z2m.adMs = 250; });
  await p.click('#tabBtn-shop');
  const adRow = (k) => p.locator(`li[data-kind="${k}"]`);
  const rowsText = () => p.evaluate(() => ['boost', 'ad-star', 'ad-sale'].map((k) => { const li = document.querySelector(`li[data-kind="${k}"]`); return { k, title: li.querySelector('h3').textContent, desc: li.querySelector('p').textContent, btn: li.querySelector('.btn-buy').textContent, off: li.querySelector('.btn-buy').disabled, shown: li.offsetHeight > 0 }; }));
  await fix(p, { money: 50000, charge: 0, starAt: 0, saleAt: 0, sale: false, ads: 0, boost: 0, boostAt: 0, health: 60 });
  let rt = await rowsText();
  ok('в разделе «Бонусы» три строки, у каждой сказано, что даётся, на кнопке — что нужно сделать', rt.length === 3 && rt.every((r) => r.shown && r.title && r.desc.length > 20 && /Смотреть\s*рекламу/.test(r.btn) && !r.off) && /Свой месяц/.test(rt[1].desc) && /дешевле/.test(rt[2].desc) && (await p.textContent('#adsHead')) === 'Бонусы · 0 из 16', JSON.stringify(rt));
  await p.waitForTimeout(400);
  await adRow('ad-star').locator('.btn-buy').click();
  const starAd = await p.locator('#adLay').isVisible() && (await st(p)).charge === 0;
  await p.waitForTimeout(600);
  s = await st(p);
  ok('«Зарядить звезду»: после ролика звезда заряжена, бонус посчитан, 24 месяца отдыха', starAd && s.charge === (await p.evaluate(() => Core.chargeMax(window.z2m.state()))) && s.ads === 1 && s.starAt === s.month + 24 && (await p.textContent('#adsHead')) === 'Бонусы · 1 из 16' && await adRow('ad-star').locator('.btn-buy').isDisabled() && /Заряжена/.test(await adRow('ad-star').locator('.btn-buy').textContent()), JSON.stringify({ charge: s.charge, ads: s.ads, starAt: s.starAt }));
  await set(p, { charge: 0 });
  ok('после звезды строка на месте и честно говорит, сколько ждать', /Отдых\s*ещё 24 мес\./.test(await adRow('ad-star').locator('.btn-buy').textContent()));
  const list0 = await p.evaluate(() => { const t = JSON.parse(JSON.stringify(window.z2m.state())); return { home: Core.costOf(t, 'home'), gym: Core.costOf(t, 'gym'), job: Core.costOf(t, 'job') }; });
  await adRow('ad-sale').locator('.btn-buy').click();
  await p.waitForTimeout(600);
  s = await st(p);
  const saleView = await p.evaluate(() => { const s = window.z2m.state(); const txt = (k) => (document.querySelector(`li[data-kind="${k}"] .shop-act`).dataset.sale || '') + ' ' + document.querySelector(`li[data-kind="${k}"] .btn-buy span`).textContent; return { home: Core.costOf(s, 'home'), gym: Core.costOf(s, 'gym'), card: Core.costOf(s, 'add:study'), cardList: Core.addCost(s, 'study'), th: txt('home'), tg: txt('gym'), tr: txt('reel'), tj: txt('job') }; });
  const dollars = (t) => Number(t.replace(/^−20% /, '').replace(/[^0-9]/g, ''));
  const deckTag = () => p.evaluate(() => Array.from(document.querySelectorAll('#deck .shop-act')).some((a) => a.dataset.sale));
  ok('«Скидка»: цены всех покупок вкладки ниже на 20% и видны на кнопках, колода и должность без скидки', s.sale === true && s.ads === 2 && saleView.home === Math.round(list0.home * 0.8) && saleView.gym === Math.round(list0.gym * 0.8) && /^−20% /.test(saleView.th) && /^−20% /.test(saleView.tg) && /^−20% /.test(saleView.tr) && dollars(saleView.th) === saleView.home && saleView.card === saleView.cardList && !/20%/.test(saleView.tj) && !(await deckTag()), JSON.stringify(saleView));
  await set(p, { skill: 20 });
  await p.locator('li[data-kind="job"] .btn-buy').click();
  ok('повышение скидку не тратит', (await st(p)).sale === true && (await st(p)).job === 1);
  const sm0 = (await st(p)).money, hc = await p.evaluate(() => Core.costOf(window.z2m.state(), 'home'));
  await p.locator('li[data-kind="home"] .btn-buy').click();
  s = await st(p);
  ok('покупка со скидкой: списана цена с кнопки, скидка ушла, 24 месяца отдыха', s.money === sm0 - hc && s.sale === false && s.saleAt === s.month + 24 && !(await p.evaluate(() => document.querySelector('li[data-kind="gym"] .shop-act').dataset.sale)) && /Отдых/.test(await adRow('ad-sale').locator('.btn-buy').textContent()), JSON.stringify({ d: sm0 - s.money, hc, sale: s.sale }));
  /* лимит: 16 бонусов за жизнь, строки не пропадают, обычные варианты работают */
  await fix(p, { money: 50000, charge: 0, starAt: 0, saleAt: 0, sale: false, ads: 16, boost: 0, boostAt: 0, health: 60 });
  rt = await rowsText();
  ok('лимит исчерпан: все три бонуса выключены и подписаны «лимит на жизнь», строки на месте', rt.every((r) => r.shown && r.off && /Лимит\s*на жизнь/.test(r.btn)) && (await p.textContent('#adsHead')) === 'Бонусы · 16 из 16', JSON.stringify(rt));
  await p.evaluate(() => { const s = window.z2m.state(); s.fork = 'overtime'; window.z2m.refresh(); });
  await p.reload(); await enter(p);
  await p.evaluate(() => { window.z2m.adMs = 250; });
  await p.waitForTimeout(450);
  ok('лимит исчерпан: золотой вариант выключен с той же причиной, обычный и отказ доступны', await p.locator('#forkG').isVisible() && await p.locator('#forkG').isDisabled() && /Лимит бонусов на эту жизнь/.test(await p.textContent('#forkG')) && await p.locator('#forkA').isEnabled() && await p.locator('#forkB').isEnabled());
  await p.click('#forkA');
  ok('обычный вариант при исчерпанном лимите применяется как всегда', (await st(p)).fork === null && (await st(p)).ads === 16 && (await st(p)).flags.gold === 0);
  ok('нет мигания и напоминалок: бонусы не считаются на значке вкладки', await p.evaluate(() => { const b = document.getElementById('shopBadge'); const n = Array.from(document.querySelectorAll('#shop li')).filter((li) => !['boost', 'ad-star', 'ad-sale'].includes(li.dataset.kind) && !li.querySelector('.btn-buy').disabled).length; return Number(b.textContent) === n; }));
  /* проигрыш: на экране ни одного бонуса; новая жизнь: счётчик с нуля */
  await p.evaluate(() => { const t = window.z2m.state(); t.fork = null; t.money = 1000; t.peak = 1000; t.ads = 7; t.month = 47 * 12 - 1; window.z2m.skip(1); });
  await p.waitForTimeout(300);
  const loseTxt = await p.textContent('#modalBox');
  ok('экран проигрыша: ни одного бонуса за рекламу, кнопки бонусов выключены', (await p.textContent('#modalTitle')) === '65 лет. Время вышло' && !/реклам|Удачный год|звезд|Скидк|черт|бонус/i.test(loseTxt) && (await rowsText()).every((r) => r.off && !/Смотреть/.test(r.btn)), loseTxt);
  await p.waitForTimeout(450); await p.click('#modalBtn');
  s = await st(p);
  ok('новая жизнь: счётчик бонусов сброшен, отдых и скидка тоже', s.life === 2 && s.ads === 0 && s.sale === false && s.starAt === 0 && s.saleAt === 0 && s.trait4 === false && (await p.textContent('#adsHead')) === 'Бонусы · 0 из 16');
  ok('в окне черты есть «Показать ещё одну черту» с подписью, что даётся', await p.locator('#traitMore').isVisible() && await p.locator('#traitMore').isEnabled() && /Показать ещё одну черту/.test(await p.textContent('#traitMore')) && /за рекламу/i.test(await p.textContent('#traitMore')) && /Один раз за жизнь/.test(await p.textContent('#traitMore')) && (await p.locator('#traitOpts .opt').count()) === 3);
  const tr0 = (await st(p)).traitOptions;
  await p.waitForTimeout(450);
  await p.click('#traitMore');
  const trAd = await p.locator('#adLay').isVisible();
  await p.waitForTimeout(600);
  s = await st(p);
  ok('«Четвёртая черта»: после ролика четвёртый вариант из других черт, кнопка ушла, бонус посчитан', trAd && s.traitOptions.length === 4 && tr0.every((t) => s.traitOptions.includes(t)) && new Set(s.traitOptions).size === 4 && s.trait4 === true && s.ads === 1 && !(await p.locator('#traitMore').isVisible()) && (await p.locator('#traitOpts .opt').count()) === 4, JSON.stringify(s.traitOptions));
  await p.waitForTimeout(450);
  await p.click(`#traitOpts .opt[data-trait="${s.traitOptions[3]}"]`);
  ok('четвёртую черту можно выбрать', (await st(p)).trait === s.traitOptions[3] && !(await p.locator('#traitLay').isVisible()));
  /* отказ: черту выбирают сразу, одним нажатием, и больше ничего не предлагают */
  await p.evaluate(() => { const t = window.z2m.state(); t.fork = null; t.money = 1000; t.peak = 1000; t.month = 47 * 12 - 1; window.z2m.skip(1); });
  await p.waitForTimeout(300);
  await p.waitForTimeout(450); await p.click('#modalBtn');
  await p.waitForTimeout(450);
  const pick1 = (await st(p)).traitOptions[0];
  await p.click(`#traitOpts .opt[data-trait="${pick1}"]`);
  await p.waitForTimeout(1200);
  s = await st(p);
  ok('отказ от четвёртой черты — одно нажатие, повторно не предлагается', s.trait === pick1 && s.trait4 === false && s.ads === 0 && !(await p.locator('#traitLay').isVisible()) && !(await p.locator('#adLay').isVisible()) && !(await p.locator('#overlay').isVisible()));
  await p.close();

  /* «Без рекламы» даёт ровно тот же бонус, только без ролика: одинаковая очередь случайных чисел, одинаковый итог */
  const bonusRun = async (noads) => {
    const q = await mk();
    if (noads) { await q.evaluate(() => { window.z2m.pay = 'bought'; }); await q.click('#storeBtn'); await q.click('[data-buy="noads"]'); await q.click('#storeClose'); }
    await q.evaluate(() => { if (document.getElementById('autoBtn').getAttribute('aria-pressed') === 'true') document.getElementById('autoBtn').click(); });
    await q.evaluate(() => { const s = window.z2m.state(); Object.assign(s, { fork: 'startup', money: 10000, health: 70, month: 60, boost: 0, boostAt: 0 }); window.z2m.refresh(); });
    await q.reload(); await enter(q);
    /* заглушка рекламы идёт 600 мс: окно успеваем застать и на загруженной машине; после замера ждём её конца */
    await q.evaluate(() => { window.z2m.adMs = 600; });
    const label = await q.textContent('#forkG i');
    await q.waitForTimeout(450);
    await force(q, [0.42, 0.42, 0.42, 0.42]);
    await q.click('#forkG');
    const adShown = await q.locator('#adLay').isVisible();
    await q.waitForTimeout(1000);
    const afterFork = JSON.stringify(await st(q));
    await q.click('#tabBtn-shop');
    const bl = await q.textContent('li[data-kind="boost"] .btn-buy');
    await q.locator('li[data-kind="boost"] .btn-buy').click();
    const adShown2 = await q.locator('#adLay').isVisible();
    await q.waitForTimeout(1000);
    await force(q, [0.1, 0.5, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5]);
    await q.evaluate(() => window.z2m.skip(1));
    const res = { label, bl, adShown, adShown2, afterFork, afterBoost: JSON.stringify(await st(q)) };
    await q.close();
    return res;
  };
  const ra = await bonusRun(false), rb = await bonusRun(true);
  ok('без покупки бонусы идут через ролик, с покупкой без него, подписи честные', ra.adShown && ra.adShown2 && !rb.adShown && !rb.adShown2 && /за рекламу/.test(ra.label) && /без рекламы/.test(rb.label) && /Смотреть/.test(ra.bl) && /Забрать/.test(rb.bl), JSON.stringify({ a: [ra.label, ra.bl, ra.adShown, ra.adShown2], b: [rb.label, rb.bl, rb.adShown, rb.adShown2] }));
  ok('«Без рекламы» не меняет шансы и суммы: золотой вариант и «Удачный год» дают то же самое', ra.afterFork === rb.afterFork && ra.afterBoost === rb.afterBoost && JSON.parse(rb.afterBoost).boost === 11, ra.afterFork === rb.afterFork ? 'год различается' : 'развилка различается');

  ok('в консоли нет ошибок', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? `\n${failed} проверок упало` : '\nвсе проверки прошли');
  process.exit(failed ? 1 : 0);
})();
