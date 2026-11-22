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
     При фокусе на работе: работа до .444, учёба до .556, здоровье до .667, связи до .741, шанс до .852, дальше счета */
  const D0 = { work: 6, study: 3, health: 3, network: 2, chance: 3, coin: 0, bill: 4, wild: 0 };
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
  await p.evaluate(() => { const q = [0.1, 0.5, 0.75]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
  await p.click('#spinBtn'); await p.waitForTimeout(1400);
  ok('ручной спин', (await st(p)).month === w2 + 1);
  await p.evaluate(() => { const q = [0.1, 0.5, 0.75]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
  await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  ok('второе нажатие досрочно завершает спин', (await st(p)).month === w2 + 2);
  await p.evaluate(() => { document.activeElement.blur(); const q = [0.1, 0.5, 0.75]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
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
  ok('карты учёбы в фокусе считаются дважды: 6 из 24', Math.abs(oo.sum - 1) < 1e-9 && oo.total === 24 && Math.abs(oo.study - 0.25) < 1e-9, JSON.stringify(oo));
  ok('строка колоды показывает число карт и шанс', (await p.textContent('#deck li[data-kind="study"] h3')) === 'Учёба ×3 · 25,0%', await p.textContent('#deck li[data-kind="study"] h3'));
  ok('в колоде 21 карта, на полоске 6 символов', (await p.textContent('#deckSize')) === 'В колоде 21 карта' && (await p.locator('#deckBar i').count()) === 6, await p.textContent('#deckSize'));
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
  ok('карта учёбы куплена за $300, следующая дороже', s.deck.study === 4 && s.money === 200 && s.bought.study === 1 && (await p.evaluate(() => Core.addCost(window.z2m.state(), 'study'))) === 525, JSON.stringify({ study: s.deck.study, money: s.money }));
  ok('ссылка «убрать» без денег выключена', await cutBtn('study').isVisible() && await cutBtn('study').isDisabled(), await cutBtn('study').textContent());
  await set(p, { money: 2000 });
  await cutBtn('study').click();
  s = await st(p);
  ok('карта учёбы убрана за $250', s.deck.study === 3 && s.cut === 1 && s.money === 1750, JSON.stringify({ study: s.deck.study, money: s.money }));
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
  ok('покупки разложены по разделам в нужном порядке', groups === 'Бонусы:boost | Жизнь:job,gym,home | Капитал:asset | Слот:reel,up-mult,up-star,up-insure,up-coach', groups);
  /* пара монет платит пассивный доход за 6 месяцев: работа до .4, учёба .5, здоровье .6, связи .667, шанс .767, монета .867 */
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
    await p.evaluate(() => { const q = [0.1, 0.5, 0.75]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
    await p.click('#spinBtn'); await p.click('#spinBtn'); await p.waitForTimeout(150);
  }
  s = await st(p);
  ok('два пустых месяца дозарядили звезду', s.charge === 10 && await p.locator('#chargeBtn').isEnabled(), 'заряд ' + s.charge);
  await p.evaluate(() => { const q = [0.1, 0.5, 0.75]; const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); });
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
  /* с одним Джокером при фокусе на работе: учёба до .536, здоровье до .643, джокер от .964 */
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
  ok('черта «Отличник» дала две карты учёбы', s.trait === 'scholar' && s.traitOptions === null && s.deck.study === 5 && !(await p.locator('#traitLay').isVisible()), JSON.stringify(s.deck));
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
  ok('старое сохранение продолжилось с колодой', s.v === 7 && s.up.mult === 0 && s.flags.gold === 0 && s.deck.wild === 0 && s.perks.genes === 0 && /опыт: 1$/.test(await p.textContent('#ptsLine')) && s.money === 5200 && s.job === 2 && s.life === 2 && s.charge === 0 && s.xp.work === 0 && s.reels4 === false && s.deck.work === 8 && s.deck.study === 4 && s.deck.coin === 1 && s.deck.chance === 4 && s.deck.bill === 4 && s.trait === null, JSON.stringify({ v: s.v, money: s.money, deck: s.deck }));
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

  ok('в консоли нет ошибок', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? `\n${failed} проверок упало` : '\nвсе проверки прошли');
  process.exit(failed ? 1 : 0);
})();
