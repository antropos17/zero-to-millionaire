/* Zero to Millionaire: игровая логика без DOM. Одинаково работает в браузере и в симуляторе баланса. */
const Core = (() => {
  const GOAL = 1000000;
  const START_AGE = 18;
  const END_AGE = 65;
  const YEAR = 12; /* один спин = один месяц */
  const TOTAL = (END_AGE - START_AGE) * YEAR;

  /* Колода: сколько карт каждого символа лежит на барабанах. Шанс символа = его карты / все карты. */
  const SYMBOLS = ['work', 'study', 'health', 'network', 'chance', 'coin', 'bill', 'wild'];
  const START_DECK = { work: 6, study: 4, health: 3, network: 2, chance: 3, coin: 0, bill: 10, wild: 0 };
  const FOCI = ['work', 'study', 'health', 'network'];
  const BUYABLE = ['study', 'health', 'network', 'chance'];
  const CARD_BASE = { study: 300, health: 300, network: 400, chance: 500 };
  const CARD_GROW = { study: 1.75, health: 1.6, network: 1.6, chance: 1.7 };
  const BILL_REMOVE = [1500, 9000, 45000];
  const REMOVE_BASE = 250;
  /* Джокер: достраивает самую большую группу на барабанах. Купить можно две карты. */
  const WILD_COSTS = [20000, 120000];
  /* Сеты: три разных символа на барабанах в любом порядке. Платят поверх обычных событий. */
  const SETS = [
    { id: 'intern', name: 'Стажировка мечты', syms: ['work', 'study', 'network'], fx: { skill: 2, network: 1 } },
    { id: 'camp', name: 'Летняя школа', syms: ['study', 'health', 'network'], fx: { skill: 1, health: 8, network: 1 } },
    { id: 'party', name: 'Вечеринка года', syms: ['health', 'network', 'chance'], fx: { health: 10, network: 2 } },
    { id: 'vacpay', name: 'Отпускные', syms: ['work', 'health', 'coin'], fx: { salaries: 2 } },
    { id: 'deal', name: 'Удачная сделка', syms: ['work', 'chance', 'coin'], fx: { salaries: 1, months: 4 } },
    { id: 'refund', name: 'Возврат налогов', syms: ['work', 'chance', 'bill'], fx: { salaries: 2 } },
  ];
  const SET_BY = {};
  SETS.forEach((t) => { SET_BY[t.id] = t; });
  /* «Удачный год» за рекламу: BOOST_LEN месяцев все доходы ×BOOST_K, потом BOOST_REST месяцев отдыха */
  const BOOST_LEN = 6, BOOST_REST = 36, BOOST_K = 1.5;
  /* Рекламные бонусы: не больше AD_LIMIT за жизнь. В счёт идут золотые варианты, «Удачный год»,
     заряд звезды, скидка и четвёртая черта. Удвоение за время отсутствия в счёт не идёт. */
  const AD_LIMIT = 8;
  /* «Зарядить звезду»: «Свой месяц» готов сразу, потом столько месяцев отдыха.
     Первый раз — не раньше месяца STAR_FIRST (с 28 лет): ранняя звезда решала жизнь за игрока */
  const STAR_REST = 24, STAR_FIRST = 120;
  /* «Скидка»: следующая покупка во вкладке «Покупки» дешевле на SALE_CUT, после неё столько месяцев отдыха */
  const SALE_CUT = 0.2, SALE_REST = 24;
  /* Наследие: постоянные улучшения за опыт прошлых жизней. Действуют с начала следующей жизни. */
  const PERKS = {
    cash: { name: 'Семейный капитал', costs: [1, 2, 3, 4], vals: [0, 500, 2000, 6000, 15000] },
    genes: { name: 'Хватка', costs: [2, 3, 4, 5, 6] },
    tough: { name: 'Закалка', costs: [1, 2, 3] },
    ties: { name: 'Связи семьи', costs: [1, 2, 3], vals: [0, 3, 6, 10] },
    school: { name: 'Хорошая школа', costs: [2, 3, 4] },
    sale: { name: 'Умение торговаться', costs: [2, 3, 4] },
    star: { name: 'Заряженная звезда', costs: [2] },
    traits: { name: 'Богатый характер', costs: [3, 5] },
    joker: { name: 'Счастливая карта', costs: [6] },
  };
  const PERK_IDS = Object.keys(PERKS);
  const normPerks = (perks) => { const P = {}; PERK_IDS.forEach((id) => { P[id] = Math.max(0, Math.min(PERKS[id].costs.length, (perks && perks[id]) | 0)); }); return P; };
  /* Магазин за настоящие деньги: только удобство, внешний вид и поддержка автора. Силу не продаём:
     ни денег в игре, ни наследия, ни шансов. Цены здесь нет, её отдаёт оплата площадки (ui.js, Pay).
     shelf: полка; once: разовая покупка (восстанавливается);
     slot + value: какой вариант внешнего вида открывает товар (слоты — LOOK_SLOTS) */
  const STORE_SHELVES = [
    { id: 'noads', name: 'Без рекламы' },
    { id: 'comfort', name: 'Удобство' },
    { id: 'lives', name: 'Новые жизни' },
    { id: 'look', name: 'Внешний вид' },
    { id: 'support', name: 'Поддержать автора' },
  ];
  /* Слоты внешнего вида. В каждом стандартный вариант LOOK_BASE бесплатный и доступен всегда */
  const LOOK_BASE = 'base';
  const LOOK_SLOTS = [
    { id: 'theme', name: 'Тема интерфейса', base: 'Стандартная тема', baseNote: 'Синяя, как с самого начала. Доступна всегда' },
    { id: 'hero', name: 'Облик героя', base: 'Обычный облик', baseNote: 'Одежда по должности, как с самого начала. Доступен всегда' },
    { id: 'home', name: 'Стиль дома', base: 'Обычный стиль', baseNote: 'Цвета жилья, как с самого начала. Доступен всегда' },
    { id: 'epitaph', name: 'Оформление эпитафии', base: 'Обычное оформление', baseNote: 'Эпитафия и летопись на белой карточке. Доступно всегда' },
  ];
  const LOOK_SLOT_IDS = LOOK_SLOTS.map((sl) => sl.id);
  const STORE = {
    noads: { shelf: 'noads', name: 'Без рекламы', note: 'Бонусы за рекламу сразу, без ролика. Сами бонусы и их ограничения те же', once: true },
    speed8: { shelf: 'comfort', name: 'Скорость ×8', note: 'Четвёртое положение переключателя скорости. Месяцы и шансы те же, только идут быстрее', once: true },
    autobuy: { shelf: 'comfort', name: 'Автопокупки', note: 'Покупает то же, что купил бы ты, по тем же ценам, когда хватает денег с запасом. Фокус, развилки, звезду и колоду не трогает', once: true },
    'sc-loan': { shelf: 'lives', name: 'Жизнь «Студент с кредитом»', note: '', once: true, scenario: 'loan' },
    'sc-late': { shelf: 'lives', name: 'Жизнь «Поздний старт»', note: '', once: true, scenario: 'late' },
    'sc-flat': { shelf: 'lives', name: 'Жизнь «Бабушкина однушка»', note: '', once: true, scenario: 'flat' },
    'theme-bill': { shelf: 'look', name: 'Тема «Зелёная купюра»', note: 'Цвета интерфейса: зелёный и тёмно-зелёный', once: true, slot: 'theme', value: 'bill' },
    'theme-dusk': { shelf: 'look', name: 'Тема «Вечер на вилле»', note: 'Цвета интерфейса: фиолетовый и сливовый', once: true, slot: 'theme', value: 'dusk' },
    'hero-street': { shelf: 'look', name: 'Облик «Двор»', note: 'Вязаная шапка, яркие кеды и тёмные джинсы', once: true, slot: 'hero', value: 'street' },
    'hero-curls': { shelf: 'look', name: 'Облик «Кудри»', note: 'Пышные кудри, кожаные ботинки и брюки хаки', once: true, slot: 'hero', value: 'curls' },
    'home-terra': { shelf: 'look', name: 'Дом «Терракота»', note: 'Тёплые терракотовые стены, тёмная крыша и зелёные двери на всех уровнях жилья', once: true, slot: 'home', value: 'terra' },
    'home-nord': { shelf: 'look', name: 'Дом «Север»', note: 'Белые стены, чёрная крыша и светлое дерево на всех уровнях жилья', once: true, slot: 'home', value: 'nord' },
    'epitaph-paper': { shelf: 'look', name: 'Эпитафия «Газета»', note: 'Эпитафия и летопись в виде газетной вырезки', once: true, slot: 'epitaph', value: 'paper' },
    'epitaph-postcard': { shelf: 'look', name: 'Эпитафия «Открытка»', note: 'Эпитафия и летопись на почтовой открытке с маркой', once: true, slot: 'epitaph', value: 'postcard' },
    thanks: { shelf: 'support', name: 'Спасибо автору', note: 'Ничего не меняет в игре. В меню появится отметка благодарности', once: true },
  };
  const STORE_IDS = Object.keys(STORE);

  /* Сценарии старта жизни (полка «Новые жизни»). Меняют только стартовый расклад: возраст, деньги (в том числе долг),
     навык, здоровье, связи, жильё и должность. Колоду, шансы символов, множители, выплаты и цены не трогают.
     money, skill и network прибавляются к стартовым (наследие действует как обычно); job и home — не ниже указанного;
     health — стартовое здоровье. Числа подобраны ботами так, чтобы сценарий не был легче стандартной жизни
     (раздел «Сценарии старта» в docs/BALANCE-REPORT.md). */
  const SC_BASE = 'base';
  const SCENARIOS = {
    loan: {
      name: 'Студент с кредитом', age: 22, money: -1500, skill: 55, health: 60, network: 2, home: 0, job: 0,
      note: 'Старт в 22 года: навык 55, но долг $1 500 за учёбу и здоровье 60',
      intro: 'Тебе 22: диплом, навык 55, здоровье 60 после сессий и $1 500 студенческого кредита.',
      epi: 'Начал с диплома и кредита за учёбу.',
    },
    late: {
      name: 'Поздний старт', age: 26, money: 20000, skill: 60, health: 55, network: 6, home: 1, job: 0,
      note: 'Старт в 26 лет: $20 000, навык 60, связи 6, койка в хостеле, здоровье 55',
      intro: 'Тебе 26: восемь лет ушли не туда. Есть $20 000, навык 60 и пара знакомых. Начинаешь заново.',
      epi: 'Начал заново в 26.',
    },
    flat: {
      name: 'Бабушкина однушка', age: 24, money: -3000, skill: 70, health: 60, network: 3, home: 3, job: 0,
      note: 'Старт в 24 года в своей однушке, навык 70, но долг $3 000 за неё',
      intro: 'Тебе 24: навык 70, бабушка оставила однушку и $3 000 долга за неё.',
      epi: 'Начал с бабушкиной однушки и её долга.',
    },
  };
  const SC_IDS = Object.keys(SCENARIOS);
  for (const id of STORE_IDS) if (STORE[id].scenario) STORE[id].note = SCENARIOS[STORE[id].scenario].note + '. Колода, шансы, выплаты и цены те же';
  /* какие сценарии открыты покупками: id сценариев в порядке каталога */
  const ownedScenarios = (owned) => STORE_IDS.filter((id) => STORE[id].scenario && Array.isArray(owned) && owned.includes(id)).map((id) => STORE[id].scenario);
  const THEME_BASE = LOOK_BASE;
  /* все варианты слота: стандартный и те, что открывают товары */
  const lookValues = (slot) => [LOOK_BASE].concat(STORE_IDS.filter((id) => STORE[id].slot === slot).map((id) => STORE[id].value));
  const THEMES = lookValues('theme');
  /* Купленное из сохранения: только известные товары, без повторов; всё остальное считается «не куплено» */
  const normOwned = (list) => (Array.isArray(list) ? STORE_IDS.filter((id) => list.includes(id)) : []);
  const ownsLook = (owned, slot, value) => value === LOOK_BASE || STORE_IDS.some((id) => STORE[id].slot === slot && STORE[id].value === value && owned.includes(id));
  /* Выбранный внешний вид из сохранения: по каждому слоту известный и купленный вариант, иначе стандартный.
     legacyTheme: поле M.theme из сохранений до слотов, используется, если в look темы нет */
  const normLook = (look, owned, legacyTheme) => {
    const o = normOwned(owned), src = look && typeof look === 'object' && !Array.isArray(look) ? look : {}, L = {};
    LOOK_SLOT_IDS.forEach((slot) => {
      const v = slot === 'theme' && !Object.prototype.hasOwnProperty.call(src, 'theme') ? legacyTheme : src[slot];
      L[slot] = typeof v === 'string' && lookValues(slot).includes(v) && ownsLook(o, slot, v) ? v : LOOK_BASE;
    });
    return L;
  };
  const ownsTheme = (owned, theme) => ownsLook(owned, 'theme', theme);
  const normTheme = (theme, owned) => normLook({ theme }, owned).theme;
  const noAds = (owned) => normOwned(owned).includes('noads');
  /* Автопокупки (товар autobuy): правила игрока, лежат в метаданных между жизнями.
     on: общий выключатель; reserve: покупать, когда денег не меньше цены × запас; job: брать бесплатное повышение;
     kinds: какие покупки вкладки «Покупки» брать. По умолчанию всё выключено.
     Запас не ниже ×3: с ×1 и ×2 игрок, который ничего не нажимает, выигрывал заметно чаще и раньше бота nofocus
     (docs/BALANCE-REPORT.md, раздел «Автопокупки»). */
  const AUTO_KINDS = ['gym', 'home', 'asset', 'reel', 'up:mult', 'up:star', 'up:insure', 'up:coach'];
  const AUTO_RESERVES = [3, 4, 5];
  const normAuto = (a) => {
    const src = a && typeof a === 'object' && !Array.isArray(a) ? a : {}, ks = src.kinds && typeof src.kinds === 'object' ? src.kinds : {}, kinds = {};
    AUTO_KINDS.forEach((k) => { kinds[k] = ks[k] === true; });
    return { on: src.on === true, reserve: AUTO_RESERVES.includes(src.reserve) ? src.reserve : AUTO_RESERVES[0], job: src.job === true, kinds };
  };

  /* Богатство к концу жизни даёт дополнительный опыт */
  const WEALTH = [5000000, 25000000, 100000000];

  const JOBS = [
    { name: 'Раздаёшь листовки', pay: 80, skill: 0 },
    { name: 'Курьер', pay: 90, skill: 13 },
    { name: 'Бариста', pay: 98, skill: 58 },
    { name: 'Джун', pay: 133, skill: 138 },
    { name: 'Мидл', pay: 179, skill: 266 },
    { name: 'Сеньор', pay: 242, skill: 461 },
    { name: 'Тимлид', pay: 313, skill: 726 },
    { name: 'Техдир стартапа', pay: 400, skill: 1093 },
    { name: 'Фаундер', pay: 500, skill: 1584 },
    { name: 'Владелец единорога', pay: 613, skill: 2216 },
  ];

  const HOMES = [
    { name: 'Скамейка в парке', cost: 0 },
    { name: 'Койка в хостеле', cost: 400 },
    { name: 'Съёмная комната', cost: 2500 },
    { name: 'Своя однушка', cost: 14000 },
    { name: 'Дом с двором', cost: 60000 },
    { name: 'Вилла у моря', cost: 220000 },
  ];

  const ASSETS = [
    { name: 'Копилка-свинья', cost: 250, income: 7 },
    { name: 'Вклад в банке', cost: 1200, income: 31 },
    { name: 'Индексный фонд', cost: 5000, income: 120 },
    { name: 'Гараж под сдачу', cost: 18000, income: 405 },
    { name: 'Квартира под сдачу', cost: 55000, income: 1165 },
    { name: 'Доля в бизнесе', cost: 150000, income: 2910 },
    { name: 'Свой фонд', cost: 350000, income: 6240 },
  ];

  const MILESTONES = [1000, 10000, 50000, 100000, 250000, 500000];
  const PAY = { workPair: 1, workTriple: 5, jackpot: 12, billPair: 1, billTriple: 4, coinPair: 6, coinTriple: 24 };
  const SKILL_PCT = 1;
  const NET_PCT = 1.5;
  const NET_CAP = 40;
  const LUCK_CAP = 20;
  /* Слот: заряд «Своего месяца», уровни символов, четвёртый барабан */
  const CHARGE_MAX = 10;
  const LEVELED = ['work', 'study', 'health', 'network'];
  const XP_LEVELS = [0, 25, 75];
  const LEVEL_MULT = [1, 1.25, 1.5];
  const XP_GAIN = { 2: 1, 3: 3, 4: 6 };
  const BASE_FX = { study: [1, 4], health: [10, 40], network: [1, 4] };
  const REEL4_COST = 80000;
  /* Улучшения слота: уровни покупаются по порядку */
  const UPGRADES = {
    mult: { name: 'Множитель', costs: [15000, 60000, 200000] },
    star: { name: 'Быстрая звезда', costs: [8000, 40000] },
    insure: { name: 'Страховка', costs: [3000, 15000] },
    coach: { name: 'Тренер', costs: [25000] },
  };
  const UP_IDS = Object.keys(UPGRADES);
  /* Множитель: значения и их шансы в процентах на каждом уровне. Крутится только в месяц с хорошим событием. */
  const MULT_TABLES = [null, [[1, 80], [2, 15], [3, 5]], [[1, 74], [2, 16], [3, 7], [5, 3]], [[1, 68], [2, 17], [3, 9], [5, 4], [10, 2]]];
  const CHARGE_NEED = [10, 8, 6];
  const INSURE_CUT = [0, 0.4, 0.75];
  /* Золотой вариант развилки: на столько процентных пунктов выше шанс удачи */
  const GOLD_LUCK = 20;

  /* Черты: одна на жизнь, выбирается из трёх случайных начиная со второй жизни */
  const TRAITS = {
    scholar: { name: 'Отличник', note: '+2 карты Учёбы в колоде', apply(s) { s.deck.study += 2; } },
    social: { name: 'Душа компании', note: '+2 карты Связей и +5 связей сразу', apply(s) { s.deck.network += 2; s.network += 5; } },
    athlete: { name: 'Спортсмен', note: 'Здоровье тратится на 30% медленнее' },
    heir: { name: 'Наследник', note: 'Сразу +$5 000 на счёт', apply(s) { s.money += 5000; s.peak = s.money; } },
    lucky: { name: 'Везунчик', note: '+10% к удаче в развилках и +1 карта Шанса', apply(s) { s.deck.chance += 1; } },
    workaholic: { name: 'Трудоголик', note: '+2 карты Работы, но −1 карта Здоровья', apply(s) { s.deck.work += 2; s.deck.health -= 1; } },
    frugal: { name: 'Аскет', note: 'Все покупки дешевле на 15%' },
    financier: { name: 'Финансист', note: '−1 карта Счетов, инвестиции приносят на 20% больше', apply(s) { s.deck.bill -= 1; } },
  };
  const TRAIT_IDS = Object.keys(TRAITS);

  /* scenarios: открытые сценарии (ownedScenarios). Если есть хоть один, жизнь начинается с выбора старта */
  function newState(perks, life, rng, scenarios) {
    const P = normPerks(perks), start = PERKS.cash.vals[P.cash];
    const s = {
      v: 9,
      money: start, month: 0, job: 0, skill: 0, health: 100, network: PERKS.ties.vals[P.ties],
      home: 0, assets: 0,
      deck: Object.assign({}, START_DECK, { study: START_DECK.study + P.school, wild: P.joker }),
      bought: { study: 0, health: 0, network: 0, chance: 0, wild: 0 }, billsCut: 0, cut: 0,
      charge: P.star ? CHARGE_NEED[0] : 0, xp: { work: 0, study: 0, health: 0, network: 0 }, reels4: false,
      up: { mult: 0, star: 0, insure: 0, coach: 0 }, boost: 0, boostAt: 0,
      ads: 0, starAt: STAR_FIRST, saleAt: 0, sale: false, trait4: false,
      focus: 'work', fork: null, lastForks: [], ms: 0,
      trait: null, traitOptions: null,
      sc: SC_BASE, scOptions: null,
      flags: { debt: false, low: false, yes: 0, gold: 0, sets: [], quad: false },
      perks: P, life: life || 1,
      status: 'playing', peak: start, wonAt: null, won: null, earned: 0,
      story: [],
    };
    const scs = Array.isArray(scenarios) ? SC_IDS.filter((id) => scenarios.includes(id)) : [];
    if (scs.length) s.scOptions = [SC_BASE].concat(scs);
    /* со второй жизни сначала выбирается черта */
    if (s.life > 1) {
      rng = rng || Math.random;
      const pool = TRAIT_IDS.slice();
      s.traitOptions = [];
      while (s.traitOptions.length < 3 + P.traits) s.traitOptions.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    return s;
  }

  /* Выбор старта: только в начале жизни, до первого месяца. Стандартный старт ничего не меняет */
  function pickScenario(s, id) {
    if (!s.scOptions || !s.scOptions.includes(id)) return false;
    s.scOptions = null;
    const sc = SCENARIOS[id];
    if (!sc) return true;
    s.sc = id;
    s.month = (sc.age - START_AGE) * YEAR;
    s.money += sc.money;
    s.skill += sc.skill;
    s.network += sc.network;
    s.health = Math.min(100, sc.health);
    s.home = Math.max(s.home, sc.home);
    s.job = Math.max(s.job, sc.job);
    s.peak = Math.max(s.peak, s.money);
    note(s, 'start', { sc: id });
    if (s.money < 0) { s.flags.debt = true; note(s, 'debt'); }
    return true;
  }

  function pickTrait(s, id) {
    if (s.scOptions || !s.traitOptions || !s.traitOptions.includes(id)) return false;
    s.trait = id;
    s.traitOptions = null;
    if (TRAITS[id].apply) TRAITS[id].apply(s);
    return true;
  }

  /* «Четвёртая черта» за рекламу: ещё один вариант из тех черт, что не показаны. Раз за жизнь. */
  const traitMore = (s) => !!s.traitOptions && !s.scOptions && !s.trait4 && s.ads < AD_LIMIT && TRAIT_IDS.some((id) => !s.traitOptions.includes(id));
  function extraTrait(s, rng) {
    if (!traitMore(s)) return false;
    rng = rng || Math.random;
    const pool = TRAIT_IDS.filter((id) => !s.traitOptions.includes(id));
    s.traitOptions.push(pool[Math.floor(rng() * pool.length)]);
    s.trait4 = true; s.ads += 1;
    return true;
  }

  /* Сохранения прошлых версий получают новые поля и продолжают жить */
  function migrate(s) {
    if (s && s.v === 2) { s.v = 3; s.charge = 0; s.xp = { work: 0, study: 0, health: 0, network: 0 }; s.reels4 = false; }
    if (s && s.v === 3) {
      /* жизнь из v3 начиналась с 4 картами Счетов: колода собирается по тогдашнему старту */
      const cutBills = Math.min(3, s.finlit || 0), study = Math.min(8, Math.floor((s.courses || 0) / 4));
      s.v = 4;
      s.deck = Object.assign({}, START_DECK, { work: START_DECK.work + (s.job || 0), study: START_DECK.study + study, coin: s.assets || 0, chance: START_DECK.chance + (s.ms || 0), bill: 4 - cutBills });
      s.bought = { study, health: 0, network: 0, chance: 0 };
      s.billsCut = cutBills; s.cut = 0;
      s.lastForks = s.lastFork ? [s.lastFork] : [];
      s.trait = null; s.traitOptions = null;
      s.flags = { debt: s.money < 0, low: s.health < 50, yes: 0 };
      delete s.finlit; delete s.courses; delete s.lastFork;
    }
    if (s && s.v === 4) { s.v = 5; s.up = { mult: 0, star: 0, insure: 0, coach: 0 }; if (s.flags) s.flags.gold = 0; }
    if (s && s.v === 5) {
      s.v = 6;
      if (s.deck) s.deck.wild = 0;
      if (s.bought) s.bought.wild = 0;
      s.boost = 0; s.boostAt = 0;
      if (s.flags) { s.flags.sets = []; s.flags.quad = false; }
      s.perks = normPerks(null);
      s.won = s.wonAt != null && s.flags && s.deck ? snapWon(s) : null;
      delete s.legacy;
    }
    if (s && s.v === 6) { s.v = 7; s.story = []; }
    /* до v8 лимита не было: в счёт идут золотые варианты, которые уже взяты, остальное отсчитывается заново */
    if (s && s.v === 7) {
      s.v = 8;
      s.ads = Math.min(AD_LIMIT, (s.flags && s.flags.gold) | 0);
      s.starAt = STAR_FIRST; s.saleAt = 0; s.sale = false; s.trait4 = false;
    }
    /* до v9 сценариев не было: любая жизнь — стандартный старт */
    if (s && s.v === 8) { s.v = 9; s.sc = SC_BASE; s.scOptions = null; }
    /* лимит рекламы стал меньше (16 → 8) без новой версии: старая жизнь доигрывает, но сверх лимита не берёт */
    if (s && s.v === 9 && s.ads > AD_LIMIT) s.ads = AD_LIMIT;
    return s;
  }

  const age = (s) => START_AGE + Math.floor(s.month / YEAR);
  const monthsLeft = (s) => Math.max(0, TOTAL - s.month);
  const reelCount = (s) => (s.reels4 ? 4 : 3);
  const level = (s, sym) => (!LEVELED.includes(sym) ? 1 : s.xp[sym] >= XP_LEVELS[2] ? 3 : s.xp[sym] >= XP_LEVELS[1] ? 2 : 1);
  const deckSize = (s) => SYMBOLS.reduce((a, k) => a + s.deck[k], 0);
  const price = (s, cost) => (cost == null ? null : Math.round(cost * (s.trait === 'frugal' ? 0.85 : 1) * (1 - 0.05 * s.perks.sale)));
  /* что было у игрока в момент миллиона: по этому снимку считаются цели «миллион без …» */
  const snapWon = (s) => ({ reels4: s.reels4, assets: s.assets, debt: s.flags.debt, low: s.flags.low, deck: deckSize(s), gold: s.flags.gold });

  /* Сколько карт каждого символа участвует в спине: карты символа в фокусе считаются дважды */
  function weights(s) {
    const w = Object.assign({}, s.deck);
    if (s.focus && FOCI.includes(s.focus)) w[s.focus] *= 2;
    return w;
  }

  /* Что выпало: группы одинаковых и сеты. Джокер уходит в самую большую группу, кроме Счетов;
     при равенстве в символ фокуса, иначе в первый слева. Если примкнуть не к чему, считается символом фокуса. */
  function evaluate(s, reels) {
    const cnt = {};
    let wild = 0;
    for (const r of reels) { if (r === 'wild') wild += 1; else cnt[r] = (cnt[r] || 0) + 1; }
    let joined = null;
    if (wild) {
      let best = 0, cands = [];
      for (const r of reels) {
        if (r === 'wild' || r === 'bill') continue;
        if (cnt[r] > best) { best = cnt[r]; cands = [r]; } else if (cnt[r] === best && !cands.includes(r)) cands.push(r);
      }
      joined = !cands.length || cands.includes(s.focus) ? s.focus : cands[0];
      cnt[joined] = (cnt[joined] || 0) + wild;
    }
    const combos = SYMBOLS.filter((k) => k !== 'wild' && cnt[k] >= 2).map((k) => ({ sym: k, count: cnt[k], wild: k === joined })).sort((a, b) => b.count - a.count);
    const sets = SETS.filter((t) => t.syms.every((k) => reels.includes(k))).map((t) => t.id);
    return { combos, sets };
  }

  /* Точные шансы: перебираются все исходы барабанов с их вероятностями. Результат запоминается, пока колода и фокус те же. */
  const memo = new Map();
  function analyze(s) {
    const w = weights(s), n = reelCount(s);
    const key = SYMBOLS.map((k) => w[k]).join(',') + '|' + n + s.focus + LEVELED.map((k) => level(s, k)).join('') + s.up.insure;
    let a = memo.get(key);
    if (a) return a;
    const total = SYMBOLS.reduce((x, k) => x + w[k], 0), syms = SYMBOLS.filter((k) => w[k] > 0);
    a = { total, reels: n, any: 0, sym: {}, sets: {}, good: 0, bad: 0, months: 0 };
    SYMBOLS.forEach((k) => { a.sym[k] = { 2: 0, 3: 0, 4: 0 }; });
    SETS.forEach((t) => { a.sets[t.id] = 0; });
    const reels = new Array(n);
    const walk = (i, p) => {
      if (i < n) { for (const k of syms) { reels[i] = k; walk(i + 1, p * w[k] / total); } return; }
      const e = evaluate(s, reels);
      if (e.combos.length || e.sets.length) a.any += p;
      for (const c of e.combos) {
        a.sym[c.sym][c.count] += p;
        const fx = effect(s, c.sym, c.count);
        if (fx.salaries > 0) a.good += p * fx.salaries; else if (fx.salaries < 0) a.bad += p * fx.salaries;
        if (fx.months) a.months += p * fx.months;
      }
      for (const id of e.sets) {
        a.sets[id] += p;
        const fx = SET_BY[id].fx;
        if (fx.salaries) a.good += p * fx.salaries;
        if (fx.months) a.months += p * fx.months;
      }
    };
    walk(0, 1);
    if (memo.size > 400) memo.clear();
    memo.set(key, a);
    return a;
  }
  function odds(s) {
    const w = weights(s), a = analyze(s);
    const out = { total: a.total, reels: a.reels, any: a.any, sets: a.sets };
    for (const k of SYMBOLS) out[k] = { weight: w[k], cards: s.deck[k], p: w[k] / a.total, pair: a.sym[k][2], triple: a.sym[k][3], quad: a.sym[k][4] };
    return out;
  }

  function healthFactor(s) {
    if (s.health <= 0) return 0.25;
    if (s.health < 25) return 0.5;
    if (s.health < 50) return 0.75;
    return 1;
  }

  const incomeMult = (s) => (1 + NET_PCT / 100 * Math.min(s.network, NET_CAP)) * (1 + 0.06 * s.home) * (1 + 0.1 * s.perks.genes);
  /* Месячная зарплата без штрафа за здоровье: в ней считаются суммы событий */
  const baseSalary = (s) => Math.round(JOBS[s.job].pay * (1 + SKILL_PCT / 100 * s.skill) * incomeMult(s));
  const salary = (s) => Math.round(baseSalary(s) * healthFactor(s));
  const gold = (s) => (s._gold ? GOLD_LUCK : 0);
  const luck = (s) => Math.min(LUCK_CAP, s.network) + (s.trait === 'lucky' ? 10 : 0) + gold(s);
  const assetIncome = (s, i) => Math.round(ASSETS[i].income * (1 + 0.1 * s.perks.genes) * (s.trait === 'financier' ? 1.2 : 1));

  function passive(s) {
    let sum = 0;
    for (let i = 0; i < s.assets; i++) sum += assetIncome(s, i);
    return sum;
  }

  function healthDecay(s) {
    const a = age(s);
    const base = a < 35 ? 1.2 : a < 50 ? 1.6 : 2.0;
    return base * (1 - 0.1 * s.home) * (s.trait === 'athlete' ? 0.7 : 1) * (1 - 0.1 * s.perks.tough);
  }

  function roll(w, rng) {
    let n = rng() * SYMBOLS.reduce((a, k) => a + w[k], 0);
    for (const k of SYMBOLS) {
      if (n < w[k]) return k;
      n -= w[k];
    }
    return 'work';
  }

  function rollReels(s, rng) {
    rng = rng || Math.random;
    const w = weights(s);
    const out = [];
    for (let i = 0; i < reelCount(s); i++) out.push(roll(w, rng));
    return out;
  }

  /* Что даёт совпадение: пара, тройка или каре (каре это двойная тройка). Уровень символа усиливает эффект. */
  function effect(s, sym, count) {
    const m = LEVEL_MULT[level(s, sym) - 1];
    const t = count === 2 ? 0 : 1;
    const twice = count >= 4 ? 2 : 1;
    switch (sym) {
      case 'work': return { salaries: (t ? PAY.workTriple : PAY.workPair) * m * twice };
      case 'study': return { skill: Math.round(BASE_FX.study[t] * m) * twice };
      case 'health': return { health: Math.round(BASE_FX.health[t] * m) * twice };
      case 'network': return { network: Math.round(BASE_FX.network[t] * m) * twice };
      case 'chance': return t ? { salaries: PAY.jackpot * twice } : { fork: true };
      case 'coin': return { months: (t ? PAY.coinTriple : PAY.coinPair) * twice };
      case 'bill': return { salaries: -(t ? PAY.billTriple : PAY.billPair) * twice * (1 - INSURE_CUT[s.up.insure]), health: -(t ? 10 : 3) * twice };
    }
    return {};
  }

  const chargeMax = (s) => CHARGE_NEED[s.up.star];
  const canCharge = (s) => s.status === 'playing' && !s.fork && !s.traitOptions && !s.scOptions && s.charge >= chargeMax(s);
  const multTable = (s, lvl) => MULT_TABLES[lvl == null ? s.up.mult : lvl];
  const multMean = (s) => (s.up.mult ? multTable(s).reduce((a, r) => a + r[0] * r[1], 0) / 100 : 1);
  function rollMult(s, rng) {
    let n = rng() * 100;
    for (const [value, pct] of multTable(s)) { if (n < pct) return value; n -= pct; }
    return 1;
  }
  /* «Свой месяц»: первые три барабана показывают выбранный символ, четвёртый крутится как обычно */
  function chargedReels(s, sym, rng) {
    if (!canCharge(s) || !FOCI.includes(sym)) return null;
    const r = rollReels(s, rng);
    r[0] = r[1] = r[2] = sym;
    return r;
  }

  /* ---------- Карты: докупить и убрать ---------- */
  const MIN_CARDS = { work: 1, study: 1, health: 1, network: 1, chance: 1, coin: 0, bill: 1, wild: 0 };
  const addCost = (s, sym) => (sym === 'wild' ? (s.bought.wild < WILD_COSTS.length ? price(s, WILD_COSTS[s.bought.wild]) : null) : BUYABLE.includes(sym) ? price(s, Math.round(CARD_BASE[sym] * Math.pow(CARD_GROW[sym], s.bought[sym]))) : null);
  function removeCost(s, sym) {
    if (s.deck[sym] <= MIN_CARDS[sym]) return null;
    if (sym === 'bill') return s.billsCut < BILL_REMOVE.length ? price(s, BILL_REMOVE[s.billsCut]) : null;
    if (!BUYABLE.includes(sym)) return null;
    return price(s, REMOVE_BASE * Math.pow(2, s.cut));
  }
  /* Сдвиг числа карт с соблюдением минимума; возвращает, на сколько реально изменилось */
  function shiftCards(s, sym, n) {
    const was = s.deck[sym];
    s.deck[sym] = Math.max(MIN_CARDS[sym], was + n);
    return s.deck[sym] - was;
  }

  /* ---------- Развилки: их открывает пара Шансов ---------- */
  const pct = (p) => Math.round(p * 100) + '%';
  const usd = (n) => '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const hp = (st, n) => { st.health = Math.max(0, Math.min(100, st.health + n)); };
  const NOTHING = 'Ничего не изменится';
  const CARD_NAME = { work: 'Работы', study: 'Учёбы', health: 'Здоровья', network: 'Связей', chance: 'Шанса', coin: 'Монеты', bill: 'Счетов', wild: 'Джокера' };
  /* Развилка: ages [от, до], ok(s) доп. условие, make(s) строит текст и два варианта. cost у варианта: сколько денег нужно. */
  const FORKS = {
    startup: {
      ok: (s) => s.money >= baseSalary(s) * 2,
      make(s) {
        const stake = Math.round(s.money * 0.3), p = (35 + luck(s)) / 100;
        return {
          title: 'Друг зовёт в стартап', text: '«Это как Uber, только для шаурмы». Просит вложиться.',
          a: { label: `Вложить ${usd(stake)}`, note: `${pct(p)}: вернётся втрое. ${pct(1 - p)}: сгорит`,
            run(st, rng) { if (rng() < p) { st.money += stake * 2; return { text: 'Стартап взлетел', tone: 'good' }; } st.money -= stake; return { text: 'Стартап закрылся', tone: 'bad' }; } },
          b: { label: 'Отказаться', note: NOTHING },
        };
      },
    },
    crypto: {
      ok: (s) => s.money >= baseSalary(s) * 2,
      make(s) {
        const stake = Math.round(s.money * 0.2), p = (20 + luck(s)) / 100;
        return {
          title: 'Монета «точно вырастет»', text: 'Таксист уверенно советует крипту.',
          a: { label: `Купить на ${usd(stake)}`, note: `${pct(p)}: вырастет в 4 раза. ${pct(1 - p)}: обнулится`,
            run(st, rng) { if (rng() < p) { st.money += stake * 3; return { text: 'Монета выстрелила', tone: 'good' }; } st.money -= stake; return { text: 'Монета обнулилась', tone: 'bad' }; } },
          b: { label: 'Пройти мимо', note: NOTHING },
        };
      },
    },
    overtime: {
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Шеф просит выйти в выходные', text: '«Горит релиз, без тебя никак».',
          a: { label: 'Согласиться', note: `+${usd(b * 3)}, здоровье −12`, run(st) { st.money += b * 3; hp(st, -12); return { text: 'Отработал выходные', tone: 'good' }; } },
          b: { label: 'Отдохнуть', note: 'Здоровье +5', run(st) { hp(st, 5); return { text: 'Выходные прошли как надо', tone: 'plain' }; } },
        };
      },
    },
    sidejob: {
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Предлагают подработку', text: 'Сосед просит «по-быстрому» сделать ему сайт.',
          a: { label: 'Взять', note: `+${usd(b * 2)}, здоровье −7`, run(st) { st.money += b * 2; hp(st, -7); return { text: 'Подработка сдана', tone: 'good' }; } },
          b: { label: 'Не брать', note: NOTHING },
        };
      },
    },
    mentor: {
      ok: (s) => s.job < JOBS.length - 1,
      make(s) {
        const cost = baseSalary(s) * 3;
        return {
          title: 'Курс у топового ментора', text: 'Осталось одно место, старт завтра.',
          a: { label: `Заплатить ${usd(cost)}`, note: 'Навык +3', cost, run(st) { st.money -= cost; st.skill += 3; return { text: 'Прошёл курс у ментора', tone: 'good' }; } },
          b: { label: 'Пропустить', note: NOTHING },
        };
      },
    },
    conference: {
      make(s) {
        const cost = baseSalary(s) * 2;
        return {
          title: 'Конференция в другом городе', text: 'Там будут все, кого стоит знать.',
          a: { label: `Поехать за ${usd(cost)}`, note: 'Связи +3', cost, run(st) { st.money -= cost; st.network += 3; return { text: 'Съездил на конференцию', tone: 'good' }; } },
          b: { label: 'Не ехать', note: NOTHING },
        };
      },
    },
    loan: {
      ok: (s) => s.money >= baseSalary(s) * 2,
      make(s) {
        const sum = baseSalary(s) * 2, p = (50 + luck(s)) / 100;
        return {
          title: 'Одноклассник просит в долг', text: '«До пятницы, честное слово».',
          a: { label: `Одолжить ${usd(sum)}`, note: `${pct(p)}: вернёт вдвойне и связи +2. ${pct(1 - p)}: пропадёт`,
            run(st, rng) { if (rng() < p) { st.money += sum; st.network += 2; return { text: 'Одноклассник вернул вдвойне', tone: 'good' }; } st.money -= sum; return { text: 'Одноклассник пропал с деньгами', tone: 'bad' }; } },
          b: { label: 'Отказать', note: NOTHING },
        };
      },
    },
    lottery: {
      make(s) {
        const b = baseSalary(s), cost = Math.round(b * 0.3), lp = (5 + gold(s)) / 100;
        return {
          title: 'Лотерейный билет у кассы', text: 'Честно: в среднем это минус.',
          a: { label: `Купить за ${usd(cost)}`, note: `${pct(lp)}: выигрыш ${usd(b * 5)}. ${pct(1 - lp)}: ничего`, cost,
            run(st, rng) { st.money -= cost; if (rng() < lp) { st.money += b * 5; return { text: 'Билет выиграл', tone: 'good' }; } return { text: 'Билет не выиграл', tone: 'bad' }; } },
          b: { label: 'Пройти мимо', note: NOTHING },
        };
      },
    },
    marathon: {
      ok: (s) => s.health < 90,
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Друзья зовут на марафон', text: 'Месяц подготовки вместо переработок.',
          a: { label: 'Готовиться', note: `Здоровье +25, −${usd(b)}`, run(st) { hp(st, 25); st.money -= b; return { text: 'Пробежал марафон', tone: 'good' }; } },
          b: { label: 'Забить', note: NOTHING },
        };
      },
    },
    blog: {
      make() {
        return {
          title: 'Завести блог про работу', text: 'Писать придётся по ночам.',
          a: { label: 'Вести блог', note: 'Связи +2, навык +1, здоровье −6', run(st) { st.network += 2; st.skill += 1; hp(st, -6); return { text: 'Блог читают', tone: 'good' }; } },
          b: { label: 'Не вести', note: NOTHING },
        };
      },
    },

    /* ----- молодость ----- */
    hackathon: {
      ages: [18, 32],
      make(s) {
        const b = baseSalary(s), p = (25 + luck(s)) / 100;
        return {
          title: 'Хакатон на выходных', text: 'Двое суток без сна, пицца бесплатно.',
          a: { label: 'Участвовать', note: `Навык +2, здоровье −8. ${pct(p)}: ещё и приз ${usd(b * 4)}`,
            run(st, rng) { st.skill += 2; hp(st, -8); if (rng() < p) { st.money += b * 4; return { text: 'Взял приз на хакатоне', tone: 'good' }; } return { text: 'Хакатон без приза, но с опытом', tone: 'good' }; } },
          b: { label: 'Выспаться', note: 'Здоровье +6', run(st) { hp(st, 6); return { text: 'Выспался вместо хакатона', tone: 'plain' }; } },
        };
      },
    },
    roadtrip: {
      ages: [18, 30],
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Друзья зовут автостопом на море', text: 'Палатка одна на четверых.',
          a: { label: 'Поехать', note: `Здоровье +15, связи +1, −${usd(b)}`, run(st) { hp(st, 15); st.network += 1; st.money -= b; return { text: 'Съездил на море автостопом', tone: 'good' }; } },
          b: { label: 'Остаться работать', note: `+${usd(b)}`, run(st) { st.money += b; return { text: 'Отработал, пока друзья были на море', tone: 'plain' }; } },
        };
      },
    },
    gamerelease: {
      ages: [18, 35],
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Вышла игра, которую ты ждал пять лет', text: 'На работе как раз дедлайн.',
          a: { label: 'Играть весь месяц', note: `Здоровье +8, −${usd(b)} за сорванные сроки`, run(st) { hp(st, 8); st.money -= b; return { text: 'Прошёл игру, сорвал дедлайн', tone: 'plain' }; } },
          b: { label: 'Держаться', note: 'Навык +1', run(st) { st.skill += 1; return { text: 'Игра подождёт, дедлайн закрыт', tone: 'good' }; } },
        };
      },
    },
    freecourse: {
      ages: [18, 40],
      ok: (s) => s.job < JOBS.length - 1,
      make() {
        return {
          title: 'Бесплатные курсы от города', text: 'Три вечера в неделю после работы.',
          a: { label: 'Ходить', note: 'Навык +2, здоровье −5', run(st) { st.skill += 2; hp(st, -5); return { text: 'Отходил вечерние курсы', tone: 'good' }; } },
          b: { label: 'Не ходить', note: NOTHING },
        };
      },
    },
    roommate: {
      ages: [18, 30],
      ok: (s) => s.home >= 1 && s.home <= 2,
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Сосед съезжает', text: 'Хозяин спрашивает, искать ли нового.',
          a: { label: 'Жить одному', note: `Здоровье +12, −${usd(b * 2)}`, cost: b * 2, run(st) { hp(st, 12); st.money -= b * 2; return { text: 'Живёшь без соседа', tone: 'good' }; } },
          b: { label: 'Пустить нового соседа', note: 'Связи +1', run(st) { st.network += 1; return { text: 'Новый сосед оказался нормальным', tone: 'plain' }; } },
        };
      },
    },
    nightshift: {
      ages: [18, 34],
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Ночные смены на складе', text: 'Платят сразу, спать некогда.',
          a: { label: 'Выйти', note: `+${usd(b * 3)}, здоровье −14`, run(st) { st.money += b * 3; hp(st, -14); return { text: 'Месяц ночных смен', tone: 'good' }; } },
          b: { label: 'Отказаться', note: NOTHING },
        };
      },
    },

    /* ----- середина жизни ----- */
    wedding: {
      ages: [23, 40], once: true,
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Свадьба', text: 'Родня уже составила список из двухсот гостей.',
          a: { label: 'Пышная свадьба', note: `Связи +5, +1 карта Здоровья, −${usd(b * 7)}`, cost: b * 7, run(st) { st.network += 5; shiftCards(st, 'health', 1); st.money -= b * 7; return { text: 'Сыграли свадьбу на двести гостей', tone: 'good' }; } },
          b: { label: 'Роспись и пицца', note: `+1 карта Здоровья, −${usd(b)}`, run(st) { shiftCards(st, 'health', 1); st.money -= b; return { text: 'Расписались и заказали пиццу', tone: 'good' }; } },
        };
      },
    },
    child: {
      ages: [26, 42], once: true,
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'У вас будет ребёнок', text: 'Жизнь прежней уже не будет.',
          a: { label: 'Больше времени семье', note: `+1 карта Здоровья, связи +2, −${usd(b * 3)}`, run(st) { shiftCards(st, 'health', 1); st.network += 2; st.money -= b * 3; return { text: 'Родился ребёнок, ты рядом', tone: 'good' }; } },
          b: { label: 'Больше работать ради семьи', note: `+1 карта Работы, +${usd(b * 2)}, здоровье −12`, run(st) { shiftCards(st, 'work', 1); st.money += b * 2; hp(st, -12); return { text: 'Родился ребёнок, ты на работе', tone: 'plain' }; } },
        };
      },
    },
    mortgage: {
      ages: [24, 50],
      gold(s) {
        const next = HOMES[s.home + 1], cost = Math.round(next.cost * 0.3);
        return { label: `Льготная ставка, взнос ${usd(cost)}`, note: 'Новое жильё сразу и только +1 карта Счетов', cost, run(st) { st.money -= cost; st.home += 1; shiftCards(st, 'bill', 1); return { text: `Взял льготную ипотеку (${next.name.toLowerCase()})`, tone: 'good' }; } };
      },
      ok: (s) => s.home >= 1 && s.home < HOMES.length - 1 && s.money >= HOMES[s.home + 1].cost * 0.3 && s.money < HOMES[s.home + 1].cost,
      make(s) {
        const next = HOMES[s.home + 1], cost = Math.round(next.cost * 0.3);
        return {
          title: 'Банк одобрил ипотеку', text: `Можно въехать прямо сейчас: ${next.name.toLowerCase()}.`,
          a: { label: `Взять за ${usd(cost)}`, note: 'Новое жильё сразу, но +2 карты Счетов в колоду', cost, run(st) { st.money -= cost; st.home += 1; shiftCards(st, 'bill', 2); return { text: `Взял ипотеку (${next.name.toLowerCase()})`, tone: 'good' }; } },
          b: { label: 'Копить дальше', note: NOTHING },
        };
      },
    },
    relocate: {
      ages: [22, 48],
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Зовут работать в другой город', text: 'Там никого не знаешь, зато проект интересный.',
          a: { label: 'Переехать', note: `+1 карта Работы, связи −3, −${usd(b * 2)}`, cost: b * 2, run(st) { shiftCards(st, 'work', 1); st.network = Math.max(0, st.network - 3); st.money -= b * 2; return { text: 'Переехал ради работы', tone: 'good' }; } },
          b: { label: 'Остаться', note: 'Связи +1', run(st) { st.network += 1; return { text: 'Остался в своём городе', tone: 'plain' }; } },
        };
      },
    },
    burnout: {
      ages: [25, 55],
      ok: (s) => s.health < 65,
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Выгорание', text: 'Понедельник начинается в воскресенье вечером.',
          a: { label: 'Взять отпуск', note: `Здоровье +30, −${usd(b * 2)}`, run(st) { hp(st, 30); st.money -= b * 2; return { text: 'Месяц отпуска вернул к жизни', tone: 'good' }; } },
          b: { label: 'Терпеть', note: `+${usd(b)}, здоровье −15`, run(st) { st.money += b; hp(st, -15); return { text: 'Дотерпел до следующего выгорания', tone: 'bad' }; } },
        };
      },
    },
    vacancy: {
      ages: [22, 55],
      ok: (s) => s.job >= 1 && s.job < JOBS.length - 1 && s.skill < JOBS[s.job + 1].skill,
      make(s) {
        const p = (30 + luck(s)) / 100, next = JOBS[s.job + 1];
        return {
          title: 'Начальник уходит, место свободно', text: `Навыка на должность «${next.name}» пока не хватает.`,
          a: { label: 'Подать заявку', note: `${pct(p)}: повысят сразу. ${pct(1 - p)}: связи −2`,
            run(st, rng) { if (rng() < p) { st.job += 1; shiftCards(st, 'work', 1); return { text: `Повысили без очереди, новая должность «${next.name}»`, tone: 'good' }; } st.network = Math.max(0, st.network - 2); return { text: 'Взяли человека со стороны', tone: 'bad' }; } },
          b: { label: 'Не высовываться', note: NOTHING },
        };
      },
    },
    speaker: {
      ages: [24, 60],
      ok: (s) => s.job >= 3,
      make() {
        return {
          title: 'Позвали выступить с докладом', text: 'Зал на триста человек, слайдов пока ноль.',
          a: { label: 'Выступить', note: 'Связи +3, навык +1, здоровье −5', run(st) { st.network += 3; st.skill += 1; hp(st, -5); return { text: 'Выступил с докладом', tone: 'good' }; } },
          b: { label: 'Отказаться', note: NOTHING },
        };
      },
    },
    mba: {
      ages: [26, 48],
      ok: (s) => s.job >= 3 && s.job < JOBS.length - 1,
      make(s) {
        const cost = baseSalary(s) * 9;
        return {
          title: 'Программа MBA', text: 'Два года вечеров и очень дорогой диплом.',
          a: { label: `Заплатить ${usd(cost)}`, note: 'Навык +8, +1 карта Связей', cost, run(st) { st.money -= cost; st.skill += 8; shiftCards(st, 'network', 1); return { text: 'Получил MBA', tone: 'good' }; } },
          b: { label: 'Обойтись', note: NOTHING },
        };
      },
    },
    carrepair: {
      ages: [22, 62],
      ok: (s) => s.ms >= 2,
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Машина сломалась', text: 'Мастер цокает языком и долго молчит.',
          a: { label: 'Чинить', note: `−${usd(b * 2)}`, cost: b * 2, run(st) { st.money -= b * 2; return { text: 'Починил машину', tone: 'plain' }; } },
          b: { label: 'Месяц ездить на автобусе', note: 'Здоровье −6', run(st) { hp(st, -6); return { text: 'Месяц в автобусах', tone: 'bad' }; } },
        };
      },
    },
    cafe: {
      ages: [24, 55],
      ok: (s) => s.money >= baseSalary(s) * 3,
      make(s) {
        const stake = Math.round(s.money * 0.25), p = (40 + luck(s)) / 100;
        return {
          title: 'Друг открывает кофейню, зовёт в долю', text: 'Место проходное, аренда тоже.',
          a: { label: `Войти за ${usd(stake)}`, note: `${pct(p)}: деньги вернутся и +1 карта Монеты. ${pct(1 - p)}: сгорят`,
            run(st, rng) { st.money -= stake; if (rng() < p) { st.money += stake; shiftCards(st, 'coin', 1); return { text: 'Кофейня приносит доход', tone: 'good' }; } return { text: 'Кофейня закрылась через год', tone: 'bad' }; } },
          b: { label: 'Отказаться', note: NOTHING },
        };
      },
    },
    inheritance: {
      ages: [25, 60], once: true,
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Наследство от двоюродной тёти', text: 'Вместе с квартирой достались её долги.',
          a: { label: 'Принять', note: `+${usd(b * 6)}, но +1 карта Счетов в колоду`, run(st) { st.money += b * 6; shiftCards(st, 'bill', 1); return { text: 'Принял наследство с долгами', tone: 'good' }; } },
          b: { label: 'Отказаться', note: NOTHING },
        };
      },
    },
    doctor: {
      ages: [28, 65],
      ok: (s) => s.health < 70,
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Врач советует сменить режим', text: 'Меньше кофе, больше сна, никаких новостей на ночь.',
          a: { label: 'Послушаться', note: `+1 карта Здоровья, −${usd(b)}`, run(st) { shiftCards(st, 'health', 1); st.money -= b; return { text: 'Сменил режим по совету врача', tone: 'good' }; } },
          b: { label: 'Само пройдёт', note: NOTHING },
        };
      },
    },
    insider: {
      ages: [25, 62],
      ok: (s) => s.network >= 5 && s.money >= baseSalary(s) * 3,
      make(s) {
        const stake = Math.round(s.money * 0.15), p = (40 + luck(s)) / 100;
        return {
          title: 'Знакомый шепнул про акции', text: '«Только никому».',
          a: { label: `Вложить ${usd(stake)}`, note: `${pct(p)}: вырастут в 2,5 раза. ${pct(1 - p)}: упадут до нуля`,
            run(st, rng) { if (rng() < p) { st.money += Math.round(stake * 1.5); return { text: 'Акции выросли', tone: 'good' }; } st.money -= stake; return { text: 'Акции рухнули', tone: 'bad' }; } },
          b: { label: 'Не лезть', note: NOTHING },
        };
      },
    },

    /* ----- вторая половина ----- */
    midlife: {
      ages: [38, 50], once: true,
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Кризис среднего возраста', text: 'В салоне очень красиво блестит мотоцикл.',
          a: { label: 'Купить мотоцикл', note: `Здоровье +10, связи +2, −${usd(b * 5)}`, cost: b * 5, run(st) { hp(st, 10); st.network += 2; st.money -= b * 5; return { text: 'Купил мотоцикл', tone: 'good' }; } },
          b: { label: 'Пойти к психологу', note: `Здоровье +15, −${usd(b)}`, run(st) { hp(st, 15); st.money -= b; return { text: 'Сходил к психологу', tone: 'good' }; } },
        };
      },
    },
    college: {
      ages: [45, 60], once: true,
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Ребёнок поступает в вуз', text: 'На бюджет не хватило двух баллов.',
          a: { label: 'Оплатить учёбу', note: `Связи +3, −${usd(b * 7)}`, cost: b * 7, run(st) { st.network += 3; st.money -= b * 7; return { text: 'Оплатил ребёнку вуз', tone: 'good' }; } },
          b: { label: 'Пусть пробует сам', note: 'Связи −2', run(st) { st.network = Math.max(0, st.network - 2); return { text: 'Ребёнок обиделся, но справился', tone: 'plain' }; } },
        };
      },
    },
    heart: {
      ages: [48, 65],
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Прихватило сердце', text: 'Отпустило, но как-то нехорошо.',
          a: { label: 'Лечь на обследование', note: `Здоровье +35, −${usd(b * 3)}`, run(st) { hp(st, 35); st.money -= b * 3; return { text: 'Прошёл обследование', tone: 'good' }; } },
          b: { label: 'Работать дальше', note: '30%: здоровье −40. 70%: обойдётся', run(st, rng) { if (rng() < 0.3) { hp(st, -40); return { text: 'Сердце напомнило о себе', tone: 'bad' }; } return { text: 'В этот раз обошлось', tone: 'plain' }; } },
        };
      },
    },
    earlyout: {
      ages: [54, 64], once: true,
      gold(s) {
        const b = baseSalary(s);
        return { label: 'Выплата и полставки', note: `+${usd(b * 10)} и только −1 карта Работы`, run(st) { st.money += b * 10; shiftCards(st, 'work', -1); return { text: 'Ушёл на полставки с выплатой', tone: 'good' }; } };
      },
      ok: (s) => s.deck.work > 3,
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Предлагают уйти по сокращению', text: 'С хорошей выплатой и тортом на прощание.',
          a: { label: 'Взять выплату', note: `+${usd(b * 10)}, но −2 карты Работы`, run(st) { st.money += b * 10; shiftCards(st, 'work', -2); return { text: 'Ушёл с выплатой', tone: 'good' }; } },
          b: { label: 'Остаться', note: NOTHING },
        };
      },
    },
    mentoring: {
      ages: [38, 65],
      ok: (s) => s.job >= 4,
      make() {
        return {
          title: 'Просят стать наставником', text: 'Трое стажёров смотрят с надеждой.',
          a: { label: 'Взять стажёров', note: 'Связи +3, навык +1, здоровье −4', run(st) { st.network += 3; st.skill += 1; hp(st, -4); return { text: 'Вырастил трёх стажёров', tone: 'good' }; } },
          b: { label: 'Некогда', note: NOTHING },
        };
      },
    },
    dacha: {
      ages: [40, 65], once: true,
      make(s) {
        const cost = baseSalary(s) * 5;
        return {
          title: 'Продаётся дача у озера', text: 'Шесть соток, баня и очень общительный сосед.',
          a: { label: `Купить за ${usd(cost)}`, note: '+1 карта Здоровья, связи +1', cost, run(st) { st.money -= cost; shiftCards(st, 'health', 1); st.network += 1; return { text: 'Купил дачу', tone: 'good' }; } },
          b: { label: 'Не покупать', note: NOTHING },
        };
      },
    },
    reunion: {
      ages: [30, 65],
      make(s) {
        const b = baseSalary(s), p = (20 + luck(s)) / 100;
        return {
          title: 'Встреча выпускников', text: 'Все будут рассказывать, как у них всё хорошо.',
          a: { label: 'Пойти', note: `Связи +2, −${usd(b)}. ${pct(p)}: позовут в проект, +${usd(b * 4)}`,
            run(st, rng) { st.network += 2; st.money -= b; if (rng() < p) { st.money += b * 4; return { text: 'На встрече позвали в проект', tone: 'good' }; } return { text: 'Сходил на встречу выпускников', tone: 'plain' }; } },
          b: { label: 'Не идти', note: NOTHING },
        };
      },
    },

    /* ----- в любом возрасте ----- */
    scam: {
      noGold: true,
      ok: (s) => s.money >= 500,
      make(s) {
        const loss = Math.round(s.money * 0.05);
        return {
          title: 'Звонок из «службы безопасности банка»', text: 'Просят срочно продиктовать код из СМС.',
          a: { label: 'Продиктовать код', note: `Это мошенники: потеряешь ${usd(loss)}`, run(st) { st.money -= loss; return { text: 'Продиктовал код мошенникам', tone: 'bad' }; } },
          b: { label: 'Положить трубку', note: NOTHING },
        };
      },
    },
    wallet: {
      gold(s) {
        const b = baseSalary(s);
        return { label: 'Вернуть, хозяин отблагодарит', note: `Связи +2 и +${usd(b)}`, run(st) { st.network += 2; st.money += b; return { text: 'Вернул кошелёк и получил награду', tone: 'good' }; } };
      },
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Нашёл на улице кошелёк', text: 'Внутри деньги и чья-то визитка.',
          a: { label: 'Вернуть', note: 'Связи +2', run(st) { st.network += 2; return { text: 'Вернул кошелёк хозяину', tone: 'good' }; } },
          b: { label: 'Оставить себе', note: `+${usd(b)}, связи −1`, run(st) { st.money += b; st.network = Math.max(0, st.network - 1); return { text: 'Оставил чужой кошелёк себе', tone: 'plain' }; } },
        };
      },
    },
    bet: {
      ok: (s) => s.money >= baseSalary(s),
      make(s) {
        const b = baseSalary(s), bp = (50 + gold(s)) / 100;
        return {
          title: 'Спор с коллегой на зарплату', text: 'Он уверен, что знает столицу Австралии.',
          a: { label: 'Поспорить', note: `${pct(bp)}: +${usd(b)}. ${pct(1 - bp)}: −${usd(b)}`, run(st, rng) { if (rng() < bp) { st.money += b; return { text: 'Выиграл спор', tone: 'good' }; } st.money -= b; return { text: 'Проиграл спор', tone: 'bad' }; } },
          b: { label: 'Не спорить', note: NOTHING },
        };
      },
    },
    volunteer: {
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Зовут волонтёром в приют', text: 'По субботам, вместо подработки.',
          a: { label: 'Ходить', note: `Связи +2, здоровье +5, −${usd(b)}`, run(st) { st.network += 2; hp(st, 5); st.money -= b; return { text: 'Субботы в приюте', tone: 'good' }; } },
          b: { label: 'Не ходить', note: NOTHING },
        };
      },
    },
    sale90: {
      ok: (s) => s.job < JOBS.length - 1,
      make(s) {
        const cost = Math.round(baseSalary(s) * 0.5), sp = (30 + gold(s)) / 100;
        return {
          title: 'Скидка 90% на онлайн-курс', text: 'Таймер на сайте тикает уже третий месяц.',
          a: { label: `Купить за ${usd(cost)}`, note: `${pct(sp)}: пройдёшь, навык +3. ${pct(1 - sp)}: так и не откроешь`, cost, run(st, rng) { st.money -= cost; if (rng() < sp) { st.skill += 3; return { text: 'Прошёл курс до конца', tone: 'good' }; } return { text: 'Курс так и не открыл', tone: 'bad' }; } },
          b: { label: 'Закрыть вкладку', note: NOTHING },
        };
      },
    },
    kitten: {
      once: true,
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Котёнок у подъезда', text: 'Смотрит так, будто уже выбрал тебя.',
          a: { label: 'Забрать домой', note: `+1 карта Здоровья, −${usd(b)}`, run(st) { shiftCards(st, 'health', 1); st.money -= b; return { text: 'Теперь у тебя кот', tone: 'good' }; } },
          b: { label: 'Пройти мимо', note: NOTHING },
        };
      },
    },
    taxrefund: {
      make(s) {
        const b = baseSalary(s);
        return {
          title: 'Положен налоговый вычет', text: 'Нужно собрать одиннадцать справок.',
          a: { label: 'Оформить', note: `+${usd(b * 2)}, здоровье −4`, run(st) { st.money += b * 2; hp(st, -4); return { text: 'Получил налоговый вычет', tone: 'good' }; } },
          b: { label: 'Лень', note: NOTHING },
        };
      },
    },
    podcast: {
      ok: (s) => s.job >= 2,
      make(s) {
        const b = baseSalary(s), p = (25 + luck(s)) / 100;
        return {
          title: 'Зовут гостем в подкаст', text: 'Слушателей у него человек сорок.',
          a: { label: 'Прийти', note: `Связи +2. ${pct(p)}: выпуск разойдётся, +${usd(b * 3)}`, run(st, rng) { st.network += 2; if (rng() < p) { st.money += b * 3; return { text: 'Выпуск подкаста разошёлся', tone: 'good' }; } return { text: 'Сходил в подкаст', tone: 'good' }; } },
          b: { label: 'Отказаться', note: NOTHING },
        };
      },
    },
  };
  const FORK_IDS = Object.keys(FORKS);

  function forkAllowed(s, id) {
    const f = FORKS[id], a = age(s);
    if (f.ages && (a < f.ages[0] || a > f.ages[1])) return false;
    if (f.once && s.lastForks.includes('!' + id)) return false;
    return !f.ok || f.ok(s);
  }
  function pickFork(s, rng) {
    const recent = s.lastForks.filter((x) => x[0] !== '!').slice(-4);
    let pool = FORK_IDS.filter((id) => !recent.includes(id) && forkAllowed(s, id));
    if (!pool.length) pool = FORK_IDS.filter((id) => forkAllowed(s, id));
    return pool[Math.floor(rng() * pool.length)] || 'overtime';
  }

  /* Подписи золотых вариантов там, где он убирает плату и потери. В рискованных развилках подпись та же, что у обычного. */
  const GOLD_LABEL = {
    overtime: 'Выйти и взять отгул', sidejob: 'Взять и сдать по шаблону', mentor: 'Попасть по стипендии', conference: 'Поехать за счёт фирмы',
    marathon: 'Готовиться в оплаченный отпуск', blog: 'Вести блог в рабочее время', roadtrip: 'Поехать, друзья угощают', gamerelease: 'Взять отгулы и играть',
    freecourse: 'Учиться в рабочее время', roommate: 'Жить одному, хозяин уступил', nightshift: 'Выйти на дневные смены', wedding: 'Пышная свадьба, платят родители',
    child: 'Оплачиваемый отпуск по уходу', relocate: 'Переехать, компания платит', burnout: 'Оплачиваемый отпуск', speaker: 'Выступить с готовым докладом',
    mba: 'MBA за счёт компании', carrepair: 'Починить по гарантии', inheritance: 'Принять, юрист снял долги', doctor: 'Сменить режим по страховке',
    midlife: 'Мотоцикл отдал знакомый', college: 'Учёба по гранту', heart: 'Обследование по страховке', mentoring: 'Взять стажёров в рабочее время',
    dacha: 'Дачу отдают даром', volunteer: 'Ходить, работа отпускает', kitten: 'Забрать, приют даёт корм', taxrefund: 'Оформить через приложение',
  };
  const GOLD_TEXT = { gamerelease: 'Прошёл игру в отгулах', inheritance: 'Принял наследство без долгов', nightshift: 'Месяц дневных смен', carrepair: 'Починил машину по гарантии', midlife: 'Мотоцикл достался даром', dacha: 'Дача досталась даром' };
  const snap = (st) => ({ money: st.money, health: st.health, network: st.network, skill: st.skill, deck: Object.assign({}, st.deck) });
  /* Убирает из результата всё, что стало хуже: плату, потерю здоровья и связей, лишние Счета, пропавшие карты */
  function undoLosses(st, was) {
    st.money = Math.max(st.money, was.money);
    st.health = Math.max(st.health, was.health);
    st.network = Math.max(st.network, was.network);
    for (const k of SYMBOLS) st.deck[k] = k === 'bill' ? Math.min(st.deck[k], was.deck[k]) : Math.max(st.deck[k], was.deck[k]);
  }
  /* Золотой вариант: свой у развилки, либо первый вариант с шансом +GOLD_LUCK (если в нём есть риск), либо первый вариант без платы и потерь */
  function goldOption(s, id) {
    const F = FORKS[id];
    if (F.noGold) return null;
    if (F.gold) return F.gold(s);
    s._gold = true;
    let f;
    try { f = F.make(s); } finally { delete s._gold; }
    const a = f.a;
    let calls = 0;
    const plain = JSON.parse(JSON.stringify(s)), was = snap(s);
    a.run(plain, () => { calls += 1; return 0.999; });
    if (calls > 0) return { label: a.label, note: `${a.note}. Шанс удачи уже выше на ${GOLD_LUCK}%`, cost: a.cost, run: a.run };
    const best = JSON.parse(JSON.stringify(s));
    a.run(best, () => 0);
    undoLosses(best, was);
    const bits = [];
    if (best.money > was.money) bits.push('+' + usd(best.money - was.money));
    if (best.skill > was.skill) bits.push(`навык +${best.skill - was.skill}`);
    if (best.network > was.network) bits.push(`связи +${best.network - was.network}`);
    if (Math.round(best.health - was.health) > 0) bits.push(`здоровье +${Math.round(best.health - was.health)}`);
    for (const k of SYMBOLS) if (best.deck[k] > was.deck[k]) bits.push(`+${best.deck[k] - was.deck[k]} карта ${CARD_NAME[k]}`);
    if (plain.money < was.money) bits.push('бесплатно');
    if (plain.health < was.health) bits.push('здоровье не тратится');
    if (plain.network < was.network) bits.push('связи целы');
    if (plain.deck.bill > was.deck.bill) bits.push('без карты Счетов');
    const note = bits.join(', ');
    return { label: GOLD_LABEL[id] || a.label, note: note.charAt(0).toUpperCase() + note.slice(1), run(st, rng) { const w = snap(st); const out = a.run(st, rng); undoLosses(st, w); return { text: GOLD_TEXT[id] || out.text, tone: out.tone }; } };
  }

  /* Описание открытой развилки для интерфейса: два обычных варианта и золотой (его может не быть) */
  function fork(s) {
    if (!s.fork) return null;
    const f = FORKS[s.fork].make(s), g = goldOption(s, s.fork);
    const opt = (o) => ({ label: o.label, note: o.note, enabled: o.cost == null || s.money >= o.cost });
    const gold = g ? opt(g) : null;
    if (gold && s.ads >= AD_LIMIT) { gold.enabled = false; gold.limit = true; }
    return { id: s.fork, title: f.title, text: f.text, options: [opt(f.a), opt(f.b)], gold };
  }

  /* Летопись: главные события жизни, из них в конце собирается эпитафия */
  function note(s, k, o) {
    if (!s.story) s.story = [];
    if (s.story.length < 120) s.story.push(Object.assign({ m: s.month, k }, o));
  }

  function track(s) {
    if (s.money < 0 && !s.flags.debt) note(s, 'debt');
    if (s.money < 0) s.flags.debt = true;
    if (s.health < 50) s.flags.low = true;
  }

  /* Выбор в развилке: 0 это первый вариант, 1 это второй */
  function choose(s, idx, rng) {
    rng = rng || Math.random;
    if (!s.fork) return null;
    const id = s.fork, f = FORKS[id].make(s);
    const isGold = idx === 'gold';
    const o = isGold ? goldOption(s, id) : idx === 0 ? f.a : f.b;
    if (!o || (o.cost != null && s.money < o.cost) || (isGold && s.ads >= AD_LIMIT)) return null;
    if (isGold) { s._gold = true; s.ads += 1; }
    const before = s.money, h0 = s.health, sk = s.skill, nw = s.network, job0 = s.job, home0 = s.home, as0 = s.assets;
    const d0 = Object.assign({}, s.deck);
    let out;
    try { out = o.run ? o.run(s, rng) : { text: f.title + ': отказ', tone: 'plain' }; } finally { delete s._gold; }
    /* помним последние развилки, чтобы не повторяться; «!id» значит, что разовая уже была */
    s.lastForks.push(id);
    if (FORKS[id].once) s.lastForks.push('!' + id);
    const keep = s.lastForks.filter((x) => x[0] === '!'), tail = s.lastForks.filter((x) => x[0] !== '!').slice(-4);
    s.lastForks = keep.concat(tail);
    s.fork = null;
    if (idx === 0 || isGold) s.flags.yes += 1;
    if (isGold) s.flags.gold += 1;
    const delta = s.money - before;
    note(s, 'fork', { t: f.title, pick: isGold ? 'gold' : idx === 0 ? 'yes' : 'no', d: delta });
    if (s.job > job0) note(s, 'job', { i: s.job });
    if (s.home > home0) note(s, 'home', { i: s.home });
    if (s.assets > as0) note(s, 'asset', { i: s.assets - 1 });
    if (delta > 0) s.earned += delta;
    if (s.money > s.peak) s.peak = s.money;
    track(s);
    const cards = SYMBOLS.filter((k) => s.deck[k] !== d0[k]).map((k) => ({ sym: k, n: s.deck[k] - d0[k] }));
    const res = {
      text: out.text, tone: out.tone, delta, cards, gold: isGold, promoted: s.job !== job0, moved: s.home !== home0,
      gain: { health: Math.round(s.health - h0), skill: s.skill - sk, network: s.network - nw },
    };
    res.milestone = bumpMilestone(s);
    res.million = check(s);
    return res;
  }

  function bumpMilestone(s) {
    let hit = null;
    while (s.ms < MILESTONES.length && s.money >= MILESTONES[s.ms]) { hit = MILESTONES[s.ms]; s.ms += 1; s.deck.chance += 1; }
    return hit;
  }

  const TEXTS = {
    work: ['Премия', 'Годовой бонус', 'Двойной годовой бонус'],
    study: ['Выучил новое', 'Прорыв в учёбе', 'Двойной прорыв в учёбе'],
    health: ['Выспался и размялся', 'Отпуск у моря', 'Долгий отпуск у моря'],
    network: ['Полезное знакомство', 'Попал на закрытую тусовку', 'Собрал свой круг'],
    chance: ['Развилка', 'Джекпот, мем завирусился', 'Двойной джекпот'],
    coin: ['Дивиденды', 'Крупные дивиденды', 'Двойные крупные дивиденды'],
    bill: ['Счета и штрафы', 'Пришла налоговая', 'Налоговая пришла дважды'],
  };

  /* Один спин = один месяц. opts.auto: развилки не открываются (игрока нет рядом). opts.charged: символ «Своего месяца». */
  function spin(s, rng, opts) {
    rng = rng || Math.random;
    if (s.status !== 'playing' || s.fork || s.traitOptions || s.scOptions) return null;
    const reels = opts && opts.charged ? chargedReels(s, opts.charged, rng) : rollReels(s, rng);
    return reels ? resolve(s, reels, rng, opts) : null;
  }

  function resolve(s, reels, rng, opts) {
    rng = rng || Math.random;
    if (s.status !== 'playing' || s.fork || s.traitOptions || s.scOptions) return null;
    const ev = evaluate(s, reels);
    const before = s.money;
    /* «Удачный год»: зарплата, пассив и деньги хороших событий ×BOOST_K */
    const k = s.boost > 0 ? BOOST_K : 1;
    const pay = Math.round(salary(s) * k);
    const base = baseSalary(s);
    const inc = Math.round(passive(s) * k);
    const yearBefore = age(s);
    const parts = [];
    const levelUps = [];
    const gain = { skill: 0, network: 0, health: 0 };
    let chargeFull = false;

    s.money += pay + inc;
    const beforeEvent = s.money;

    const items = ev.combos.map((c) => ({ c, fx: effect(s, c.sym, c.count) })).concat(ev.sets.map((id) => ({ set: SET_BY[id], fx: Object.assign({}, SET_BY[id].fx) })));
    /* множитель крутится только в месяц с хорошим событием и умножает только хорошее: Счета он не трогает */
    const hasGood = items.some(({ fx }) => fx.salaries > 0 || (fx.months && inc > 0) || fx.skill || fx.network || fx.health > 0);
    const mult = s.up.mult && hasGood ? rollMult(s, rng) : null;
    const m = mult || 1;
    for (const { c, set, fx } of items) {
      if (fx.salaries > 0) fx.salaries *= m;
      if (fx.months) fx.months *= m;
      if (fx.skill) fx.skill *= m;
      if (fx.network) fx.network *= m;
      if (fx.health > 0) fx.health *= m;
      const part = c
        ? { sym: c.sym, count: c.count, wild: c.wild, text: TEXTS[c.sym][c.count - 2], tone: c.sym === 'bill' ? 'bad' : 'good', money: 0, gain: {} }
        : { sym: 'set', id: set.id, syms: set.syms, count: 3, text: `Сет «${set.name}»`, tone: 'good', money: 0, gain: {} };
      if (fx.fork) {
        if (opts && opts.auto) { part.text = 'Развилка прошла мимо'; part.tone = 'plain'; }
        else { if (!s.fork) s.fork = pickFork(s, rng); part.tone = 'fork'; }
      }
      if (fx.salaries) part.money += Math.round(base * fx.salaries * (fx.salaries > 0 ? k : 1));
      if (fx.months) part.money += inc * fx.months;
      s.money += part.money;
      if (c && c.sym === 'coin' && !part.money) { part.tone = 'plain'; part.text = 'Монеты сошлись, но вложений пока нет'; }
      if (fx.skill) { s.skill += fx.skill; part.gain.skill = fx.skill; gain.skill += fx.skill; }
      if (fx.network) { s.network += fx.network; part.gain.network = fx.network; gain.network += fx.network; }
      if (fx.health) {
        const was = s.health;
        s.health = Math.max(0, Math.min(100, s.health + fx.health));
        part.gain.health = Math.round(s.health - was);
        gain.health += part.gain.health;
      }
      if (c && LEVELED.includes(c.sym)) {
        const was = level(s, c.sym);
        s.xp[c.sym] += XP_GAIN[c.count] * (s.up.coach ? 2 : 1);
        if (level(s, c.sym) > was) levelUps.push({ sym: c.sym, level: level(s, c.sym) });
      }
      if (c && c.count >= 4) s.flags.quad = true;
      if (c && c.sym === 'chance' && c.count >= 3 && !(s.story || []).some((e) => e.k === 'jackpot')) note(s, 'jackpot');
      if (set && !s.flags.sets.includes(set.id)) s.flags.sets.push(set.id);
      parts.push(part);
    }

    /* пустой месяц заряжает «Свой месяц»; использованный заряд сгорает */
    if (opts && opts.charged) s.charge = 0;
    else if (!items.length && s.charge < chargeMax(s)) { s.charge += 1; chargeFull = s.charge === chargeMax(s); }

    /* event: сколько денег дали или забрали сами события, без зарплаты и пассива */
    const event = s.money - beforeEvent;
    s.health = Math.max(0, s.health - healthDecay(s));
    s.month += 1;
    if (s.boost > 0) s.boost -= 1;
    const delta = s.money - before;
    if (delta > 0) s.earned += delta;
    if (s.money > s.peak) s.peak = s.money;
    track(s);
    const milestone = bumpMilestone(s);
    const million = check(s);
    const tones = parts.map((x) => x.tone);
    const tone = !parts.length ? 'plain' : tones.includes('fork') ? 'fork' : tones.every((t) => t === 'bad') ? 'bad'
      : tones.every((t) => t === 'plain') ? 'plain' : tones.includes('bad') && event < 0 ? 'bad' : 'good';
    return {
      reels, combos: parts, combo: parts[0] || null, text: parts.length ? parts.map((x) => x.text).join('; ') : 'Обычный месяц',
      tone, delta, event, gain, pay, inc, milestone, levelUps, chargeFull, mult, boosted: k > 1, million,
      charged: !!(opts && opts.charged), birthday: age(s) !== yearBefore,
    };
  }

  /* Средний доход за месяц при текущей колоде, без развилок, «Своего месяца» и «Удачного года» */
  function expected(s) {
    const a = analyze(s), base = baseSalary(s), inc = passive(s), mean = multMean(s);
    return salary(s) + inc + base * (a.good * mean + a.bad) + inc * a.months * mean;
  }

  /* Миллион жизнь не заканчивает: можно выйти на пенсию или играть до 65. Возвращает true в момент первого миллиона. */
  function check(s) {
    if (s.status !== 'playing') return false;
    let crossed = false;
    if (s.wonAt == null && s.money >= GOAL) { s.wonAt = s.month; s.won = snapWon(s); crossed = true; note(s, 'million'); }
    if (s.month >= TOTAL) { s.status = s.wonAt != null ? 'won' : 'lost'; s.fork = null; }
    return crossed;
  }
  function retire(s) {
    if (s.status !== 'playing' || s.wonAt == null) return false;
    s.status = 'won'; s.fork = null;
    return true;
  }
  /* ---------- Рекламные бонусы ---------- */
  /* ready: кнопку можно нажать сейчас. Сам бонус выдаётся и тогда, когда за время ролика открылась развилка:
     досмотренная реклама всегда даёт обещанное. */
  const adsLeft = (s) => Math.max(0, AD_LIMIT - s.ads);
  const adOpen = (s) => s.status === 'playing' && !s.fork && !s.traitOptions && !s.scOptions;
  const boostCan = (s) => s.status === 'playing' && !s.scOptions && s.ads < AD_LIMIT && s.boost === 0 && s.month >= s.boostAt;
  const boostReady = (s) => adOpen(s) && boostCan(s);
  function startBoost(s) {
    if (!boostCan(s)) return false;
    s.boost = BOOST_LEN;
    s.boostAt = s.month + BOOST_LEN + BOOST_REST;
    s.ads += 1;
    return true;
  }
  const starCan = (s) => s.status === 'playing' && !s.scOptions && s.ads < AD_LIMIT && s.month >= s.starAt && s.charge < chargeMax(s);
  const starReady = (s) => adOpen(s) && starCan(s);
  function chargeStar(s) {
    if (!starCan(s)) return false;
    s.charge = chargeMax(s);
    s.starAt = s.month + STAR_REST;
    s.ads += 1;
    return true;
  }
  const saleCan = (s) => s.status === 'playing' && !s.scOptions && s.ads < AD_LIMIT && !s.sale && s.month >= s.saleAt;
  const saleReady = (s) => adOpen(s) && saleCan(s);
  function startSale(s) {
    if (!saleCan(s)) return false;
    s.sale = true;
    s.ads += 1;
    return true;
  }

  /* ---------- Покупки ---------- */
  const gymCost = (s) => price(s, Math.max(40, Math.round(baseSalary(s) * 0.2)));
  const homeCost = (s) => (s.home + 1 < HOMES.length ? price(s, HOMES[s.home + 1].cost) : null);
  const assetCost = (s) => (s.assets < ASSETS.length ? price(s, ASSETS[s.assets].cost) : null);
  const reelCost = (s) => (s.reels4 ? null : price(s, REEL4_COST));
  const upCost = (s, id) => (UPGRADES[id] && s.up[id] < UPGRADES[id].costs.length ? price(s, UPGRADES[id].costs[s.up[id]]) : null);
  const nextJob = (s) => (s.job + 1 < JOBS.length ? JOBS[s.job + 1] : null);
  /* Покупки вкладки «Покупки», на которые действует скидка за рекламу (должность бесплатная, колода в своей вкладке) */
  const onSale = (kind) => kind === 'gym' || kind === 'home' || kind === 'asset' || kind === 'reel' || (typeof kind === 'string' && kind.slice(0, 3) === 'up:');
  function listCost(s, kind) {
    switch (kind) {
      case 'gym': return s.health >= 100 ? null : gymCost(s);
      case 'home': return homeCost(s);
      case 'asset': return assetCost(s);
      case 'reel': return reelCost(s);
    }
    if (typeof kind !== 'string') return null;
    if (kind.slice(0, 4) === 'add:') return addCost(s, kind.slice(4));
    if (kind.slice(0, 4) === 'cut:') return removeCost(s, kind.slice(4));
    if (kind.slice(0, 3) === 'up:') return upCost(s, kind.slice(3));
    return null;
  }
  /* Цена покупки с учётом скидки за рекламу. Ей пользуются и кнопки, и сама покупка. */
  function costOf(s, kind) {
    const c = listCost(s, kind);
    return c != null && s.sale && onSale(kind) ? Math.round(c * (1 - SALE_CUT)) : c;
  }

  /* kind: job, gym, home, asset, reel, add:символ, cut:символ, up:улучшение */
  function act(s, kind) {
    if (s.status !== 'playing' || s.fork || s.traitOptions || s.scOptions) return false;
    if (kind === 'job') {
      const j = nextJob(s);
      if (!j || s.skill < j.skill) return false;
      s.job += 1;
      s.deck.work += 1;
      note(s, 'job', { i: s.job });
      return true;
    }
    const cost = costOf(s, kind);
    if (cost == null || s.money < cost) return false;
    s.money -= cost;
    if (s.sale && onSale(kind)) { s.sale = false; s.saleAt = s.month + SALE_REST; }
    if (kind === 'gym') s.health = Math.min(100, s.health + 20);
    else if (kind === 'home') { s.home += 1; note(s, 'home', { i: s.home }); }
    else if (kind === 'asset') { s.assets += 1; s.deck.coin += 1; note(s, 'asset', { i: s.assets - 1 }); }
    else if (kind === 'reel') { s.reels4 = true; note(s, 'reel'); }
    else if (kind.slice(0, 4) === 'add:') { const sym = kind.slice(4); s.deck[sym] += 1; s.bought[sym] += 1; }
    else if (kind.slice(0, 3) === 'up:') { s.up[kind.slice(3)] += 1; s.charge = Math.min(s.charge, chargeMax(s)); }
    else if (kind.slice(0, 4) === 'cut:') { const sym = kind.slice(4); s.deck[sym] -= 1; if (sym === 'bill') s.billsCut += 1; else s.cut += 1; }
    return true;
  }

  /* Автопокупки: нажимают ту же act(), что и игрок, по тем же ценам (costOf).
     Пока включена скидка за рекламу, платного не берут: скидку тратит сам игрок.
     Сначала бесплатное повышение, потом самое дешёвое из включённого, пока денег не меньше цены × запас.
     Запас не меньше 1, поэтому деньги автопокупка в минус не уводит.
     Возвращает купленное по порядку: { kind, cost, lvl } — lvl это должность, жильё, номер инвестиции или уровень улучшения после покупки. */
  const autoLvl = (s, k) => (k === 'job' ? s.job : k === 'home' ? s.home : k === 'asset' ? s.assets - 1 : k.slice(0, 3) === 'up:' ? s.up[k.slice(3)] : null);
  function autoBuy(s, rules) {
    const a = normAuto(rules), out = [];
    if (!a.on || s.status !== 'playing' || s.fork || s.traitOptions || s.scOptions) return out;
    if (a.job) while (act(s, 'job')) out.push({ kind: 'job', cost: 0, lvl: s.job });
    /* скидка за рекламу ждёт покупки, которую выберет сам игрок: пока она не потрачена, платного не берём */
    if (s.sale) return out;
    for (let guard = 0; guard < 24; guard++) {
      let best = null;
      for (const k of AUTO_KINDS) {
        if (!a.kinds[k]) continue;
        const c = costOf(s, k);
        if (c != null && s.money >= c * a.reserve && (!best || c < best[1])) best = [k, c];
      }
      if (!best || !act(s, best[0])) break;
      out.push({ kind: best[0], cost: best[1], lvl: autoLvl(s, best[0]) });
    }
    return out;
  }

  function setFocus(s, f) {
    if (s.status !== 'playing' || !FOCI.includes(f)) return false;
    s.focus = f;
    return true;
  }

  /* ---------- Летопись и эпитафия: итог жизни из записей s.story ---------- */
  const JOB_GEN = ['раздатчика листовок', 'курьера', 'баристы', 'джуна', 'мидла', 'сеньора', 'тимлида', 'техдира стартапа', 'фаундера', 'владельца единорога'];
  const ageAt = (m) => START_AGE + Math.floor(m / YEAR);
  const signedUsd = (d) => (d < 0 ? '−⁠' : '+⁠') + usd(Math.abs(d));
  function chronicle(s) {
    const st = s.story || [], last = (k) => st.filter((e) => e.k === k).pop(), first = (k) => st.find((e) => e.k === k);
    const forks = st.filter((e) => e.k === 'fork'), yes = forks.filter((e) => e.pick !== 'no');
    const lastJob = JOBS.length - 1, lastHome = HOMES.length - 1;

    /* заголовок окна уже говорит про миллион, эпитафия рассказывает, какой была жизнь */
    const head = s.job === lastJob ? 'Владел единорогом'
      : s.wonAt != null && s.job <= 2 ? `Разбогател в должности ${JOB_GEN[s.job]}`
      : s.home === lastHome ? 'Дожил до виллы у моря'
      : s.money < 0 ? 'Ушёл в минус'
      : s.job === 0 ? 'Всю жизнь раздавал листовки'
      : `Дорос до ${JOB_GEN[s.job]}`;
    const twist = s.home === 0 ? 'но так и не съехал со скамейки'
      : s.assets === 0 ? 'но ни разу ничего не вложил'
      : s.health < 30 ? 'но здоровье оставил на работе'
      : s.flags.debt && s.money >= 0 ? 'хотя однажды ушёл в минус'
      : forks.length >= 3 && !yes.length ? 'отказываясь от всех авантюр'
      : s.health >= 80 ? 'и до конца остался бодрячком'
      : s.wonAt != null && !s.flags.gold ? 'и ни разу не взял золото'
      : s.flags.yes >= 15 ? 'соглашаясь на всё подряд'
      : 'и ни о чём не жалел';

    const c = [];
    const add = (e, w, text, tone) => { if (e) c.push({ m: e.m, w, text, tone }); };
    const sc = SCENARIOS[s.sc], st0 = first('start');
    if (sc && st0) add(st0, 90, `Старт: ${sc.name}`, 'plain');
    add(first('million'), 100, 'Первый миллион', 'good');
    const j = last('job'); if (j) add(j, 50, `Повышение: ${JOBS[j.i].name}`, 'good');
    const h = last('home'); if (h) add(h, 40, `Переезд: ${HOMES[h.i].name}`, 'good');
    const a = last('asset'); if (a) add(a, 35, `Вложился: ${ASSETS[a.i].name}`, 'good');
    const best = yes.filter((e) => e.d > 0).sort((x, y) => y.d - x.d)[0];
    const worst = forks.filter((e) => e.d < 0).sort((x, y) => x.d - y.d)[0];
    if (best) add(best, 45, `${best.t}: ${signedUsd(best.d)}`, 'good');
    if (worst) add(worst, 44, `${worst.t}: ${signedUsd(worst.d)}`, 'bad');
    if (!best && !worst && yes.length) add(yes[0], 30, `${yes[0].t}: согласился`, 'plain');
    add(first('jackpot'), 42, 'Джекпот: мем завирусился', 'good');
    add(first('debt'), 38, 'Впервые ушёл в минус', 'bad');
    add(first('reel'), 20, 'Купил четвёртый барабан', 'good');
    const lines = c.sort((x, y) => y.w - x.w).slice(0, 5).sort((x, y) => x.m - y.m || y.w - x.w)
      .map((x) => ({ age: ageAt(x.m), text: x.text, tone: x.tone }));
    return { epitaph: (sc ? sc.epi + ' ' : '') + `${head}, ${twist}.`, lines };
  }

  /* ---------- Цели на жизнь: каждая один раз даёт +1 опыта ---------- */
  const wonBefore = (s, a) => s.wonAt != null && START_AGE + Math.floor(s.wonAt / YEAR) < a;
  const byAge = (id, a, note = '') => ({ id, name: `Миллион до ${a} лет${note}`, test: (s) => wonBefore(s, a), lost: (s) => (s.wonAt != null ? !wonBefore(s, a) : age(s) >= a) });
  /* цели «миллион без …» считаются по снимку в момент миллиона; до него смотрим, не сорвана ли цель уже сейчас */
  const atWin = (id, name, okWon, brokenNow) => ({ id, name, test: (s) => !!s.won && okWon(s.won), lost: (s) => (s.won ? !okWon(s.won) : brokenNow(s)) });
  const GOALS = [
    byAge('m50', 50), byAge('m40', 40, ' (с наследием)'), byAge('m35', 35, ' (с наследием)'), byAge('m30', 30),
    atWin('noreel', 'Миллион без четвёртого барабана', (w) => !w.reels4, (s) => s.reels4),
    atWin('noinvest', 'Миллион без единой инвестиции', (w) => w.assets === 0, (s) => s.assets > 0),
    atWin('nodebt', 'Миллион, ни разу не уйдя в минус', (w) => !w.debt, (s) => s.flags.debt),
    atWin('healthy', 'Миллион, не опуская здоровье ниже 50', (w) => !w.low, (s) => s.flags.low),
    atWin('thin', 'Миллион с колодой не больше 28 карт', (w) => w.deck <= 28, () => false),
    atWin('nogold', 'Миллион без единого золотого варианта', (w) => !w.gold, (s) => s.flags.gold > 0),
    { id: 'levels', name: 'Три символа на третьем уровне', test: (s) => LEVELED.filter((k) => level(s, k) === 3).length >= 3 },
    { id: 'villa', name: 'Дожить до виллы у моря', test: (s) => s.home === HOMES.length - 1 },
    { id: 'unicorn', name: 'Владелец единорога (с наследием)', test: (s) => s.job === JOBS.length - 1 },
    { id: 'yes10', name: 'Согласиться на 10 развилок за жизнь', test: (s) => s.flags.yes >= 10 },
    { id: 'sets', name: 'Собрать все шесть сетов за одну жизнь', test: (s) => s.flags.sets.length >= SETS.length },
    { id: 'quad', name: 'Собрать каре на четырёх барабанах', test: (s) => s.flags.quad },
    { id: 'w1', name: 'Накопить $5 млн за жизнь', test: (s) => s.peak >= WEALTH[0] },
    { id: 'w2', name: 'Накопить $25 млн за жизнь', test: (s) => s.peak >= WEALTH[1] },
    { id: 'w3', name: 'Накопить $100 млн за жизнь', test: (s) => s.peak >= WEALTH[2] },
  ];
  /* Какие цели выполнены этой жизнью (жизнь должна быть закончена) */
  const goalsMet = (s) => (s.status === 'playing' ? [] : GOALS.filter((g) => g.test(s)).map((g) => g.id));
  /* Цель в этой жизни уже недостижима */
  const goalLost = (s, id) => { const g = GOALS.find((x) => x.id === id); return !!(g && g.lost && g.lost(s)); };
  /* Опыт за жизнь: 1 за прожитую, 2 за миллион и ещё по одному за $5, $25 и $100 млн */
  const lifePoints = (s) => (s.status === 'playing' ? 0 : (s.wonAt != null ? 2 : 1) + WEALTH.filter((v) => s.peak >= v).length);
  const perkCost = (perks, id) => { const P = normPerks(perks); return P[id] < PERKS[id].costs.length ? PERKS[id].costs[P[id]] : null; };

  return {
    GOAL, START_AGE, END_AGE, YEAR, TOTAL, SYMBOLS, START_DECK, FOCI, BUYABLE, JOBS, HOMES, ASSETS,
    AD_LIMIT, STAR_REST, STAR_FIRST, SALE_CUT, SALE_REST, adsLeft, starReady, chargeStar, saleReady, startSale, onSale, traitMore, extraTrait,
    MILESTONES, PAY, CARD_BASE, CARD_GROW, BILL_REMOVE, SKILL_PCT, NET_PCT, NET_CAP, LUCK_CAP, FORK_IDS, SETS, WILD_COSTS, PERKS, PERK_IDS, WEALTH, BOOST_LEN, BOOST_REST, BOOST_K,
    evaluate, normPerks, perkCost, lifePoints, retire, boostReady, startBoost, TRAITS, TRAIT_IDS, GOALS, CARD_NAME,
    CHARGE_MAX, LEVELED, XP_LEVELS, LEVEL_MULT, REEL4_COST, UPGRADES, UP_IDS, MULT_TABLES, CHARGE_NEED, INSURE_CUT, GOLD_LUCK,
    chargeMax, multTable, multMean, upCost,
    migrate, reelCount, level, effect, canCharge, chargedReels, deckSize, addCost, removeCost, pickTrait, forkAllowed,
    newState, age, monthsLeft, weights, odds, healthFactor, incomeMult, baseSalary, salary, luck, passive, assetIncome,
    healthDecay, rollReels, resolve, spin, expected, fork, choose, act, setFocus, check,
    gymCost, homeCost, assetCost, reelCost, nextJob, costOf, goalsMet, goalLost, MIN_CARDS, chronicle,
    STORE, STORE_IDS, STORE_SHELVES, THEMES, THEME_BASE, normOwned, normTheme, ownsTheme, noAds,
    LOOK_BASE, LOOK_SLOTS, LOOK_SLOT_IDS, lookValues, ownsLook, normLook,
    AUTO_KINDS, AUTO_RESERVES, normAuto, autoBuy,
    SC_BASE, SCENARIOS, SC_IDS, ownedScenarios, pickScenario,
  };
})();
if (typeof module !== 'undefined') module.exports = Core;
