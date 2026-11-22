(() => {
  'use strict';
  const C = Core;
  const $ = (id) => document.getElementById(id);
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- Сохранение: localStorage, а если он недоступен, память вкладки ---------- */
  const KEY = 'zero-to-millionaire-v2';
  let memSave = null;
  const store = {
    get() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* хранилище недоступно */ }
      return memSave;
    },
    set(v) {
      memSave = v;
      try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* играем без сохранения */ }
    },
    clear() {
      memSave = null;
      try { localStorage.removeItem(KEY); } catch (e) { /* нечего стирать */ }
    },
  };

  const freshMeta = () => ({ auto: true, speed: 1, sound: false, best: null, log: [], seenHelp: false, tab: 'shop', goals: [], pts: 0, perks: {}, owned: [], theme: 'base' });
  let S = C.newState(null, 1);
  let M = freshMeta();

  function validState(s) {
    if (!s || s.v !== 6) return false;
    const nums = ['money', 'month', 'job', 'skill', 'health', 'network', 'home', 'assets', 'billsCut', 'cut', 'ms', 'life', 'peak', 'earned', 'charge', 'boost', 'boostAt'];
    const num = (v) => typeof v === 'number' && isFinite(v);
    if (!nums.every((k) => num(s[k]))) return false;
    if (!s.xp || !C.LEVELED.every((k) => num(s.xp[k])) || typeof s.reels4 !== 'boolean') return false;
    if (!s.deck || !C.SYMBOLS.every((k) => num(s.deck[k]) && s.deck[k] >= C.MIN_CARDS[k])) return false;
    if (!s.bought || !C.BUYABLE.every((k) => num(s.bought[k]))) return false;
    if (!s.flags || typeof s.flags.debt !== 'boolean' || typeof s.flags.low !== 'boolean' || !num(s.flags.yes) || !num(s.flags.gold)) return false;
    if (!s.up || !C.UP_IDS.every((k) => num(s.up[k]) && s.up[k] >= 0 && s.up[k] <= C.UPGRADES[k].costs.length)) return false;
    if (!Array.isArray(s.lastForks) || !Array.isArray(s.flags.sets)) return false;
    if (!s.perks || !C.PERK_IDS.every((k) => num(s.perks[k]))) return false;
    if (s.trait != null && !C.TRAIT_IDS.includes(s.trait)) return false;
    if (s.traitOptions != null && !(Array.isArray(s.traitOptions) && s.traitOptions.length && s.traitOptions.every((t) => C.TRAIT_IDS.includes(t)))) return false;
    if (!['playing', 'won', 'lost'].includes(s.status)) return false;
    if (!C.FOCI.includes(s.focus)) return false;
    if (s.fork != null && !C.FORK_IDS.includes(s.fork)) return false;
    if (!s.lastForks.every((x) => typeof x === 'string') || !s.flags.sets.every((x) => typeof x === 'string')) return false;
    if (s.month < 0 || s.health < 0 || s.health > 100 || s.life < 1 || s.charge < 0 || s.boost < 0 || !C.LEVELED.every((k) => s.xp[k] >= 0)) return false;
    if (s.wonAt != null && !num(s.wonAt)) return false;
    /* запись о начисленном опыте должна быть целой, иначе окно конца жизни её не прочитает */
    if (s.paid != null && !(typeof s.paid === 'object' && num(s.paid.pts) && Array.isArray(s.paid.goals))) delete s.paid;
    if (s.wonAt != null && (!s.won || typeof s.won !== 'object')) return false;
    return s.job >= 0 && s.job < C.JOBS.length && s.home >= 0 && s.home < C.HOMES.length && s.assets >= 0 && s.assets <= C.ASSETS.length;
  }
  /* пока игрок в меню после загрузки, время сохранения не трогаем: иначе пропал бы доход за отсутствие */
  let entered = false, bootT = null, away = 0;
  /* до первого входа в игру жизни ещё нет: покупка в магазине или настройка в меню сохраняют только метаданные,
     иначе пустая жизнь сохранилась бы и при следующем запуске «прокрутилась» за время отсутствия */
  const save = () => store.set({ S: entered || hasSave ? S : null, M, t: entered || bootT == null ? Date.now() : bootT });

  /* ---------- Формат ---------- */
  const nf = new Intl.NumberFormat('ru-RU');
  const pf = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  /* \u2060 не даёт строке переноситься между минусом и суммой */
  const money = (n) => { const r = Math.round(n); return (r < 0 ? '−\u2060$' : '$') + nf.format(Math.abs(r)); };
  const signed = (n) => { const r = Math.round(n); return (r < 0 ? '−\u2060$' : '+\u2060$') + nf.format(Math.abs(r)); };
  const short = (n) => {
    const a = Math.abs(n), sg = n < 0 ? '−' : '';
    if (a >= 1e6) return sg + '$' + pf.format(a / 1e6).replace(',0', '') + ' млн';
    if (a >= 1e4) return sg + '$' + Math.round(a / 1e3) + ' тыс';
    return sg + '$' + nf.format(Math.round(a));
  };
  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
  };
  const years = (n) => `${n} ${plural(n, 'год', 'года', 'лет')}`;
  const monthsTxt = (n) => `${n} ${plural(n, 'месяц', 'месяца', 'месяцев')}`;
  const span = (m) => (m < 24 ? `${m} мес.` : years(Math.round(m / 12)));
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  /* ---------- Иконки: гладкий вектор с тёмным контуром ---------- */
  const N = '#1B1F4B';
  const st = `stroke="${N}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;
  const ART = {
    work: `<path d="M24 22v-5a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v5" fill="none" ${st}/><rect x="7" y="21" width="50" height="34" rx="8" fill="#D08B4F" ${st}/><path d="M8.8 37h46.4v10a6.2 6.2 0 0 1-6.2 6.2H15a6.2 6.2 0 0 1-6.2-6.2z" fill="#B9773F"/><path d="M8 37h48" ${st}/><rect x="26" y="31" width="12" height="12" rx="3.5" fill="#FFD23F" ${st}/><path d="M15 28h9" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>`,
    study: `<path d="M16 30v12c0 7.5 32 7.5 32 0V30" fill="#2F57D0" ${st}/><path d="M32 11 60 25 32 39 4 25z" fill="#4D7BF3" ${st}/><path d="M22 22l9-4.5" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/><path d="M54 28v12" fill="none" ${st}/><circle cx="54" cy="45" r="4.5" fill="#FFD23F" ${st}/>`,
    health: `<path d="M32 55C9 39 5 27 11 17c6-9 17-7 21 2 4-9 15-11 21-2 6 10 2 22-21 38z" fill="#F0503C" ${st}/><path d="M17 22c2-4.500 6-5.500 9-3.500" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".7"/>`,
    network: `<path d="M15 8h20a9 9 0 0 1 9 9v8a9 9 0 0 1-9 9H22l-9 7v-8.200A9 9 0 0 1 6 25v-8a9 9 0 0 1 9-9z" fill="#17A865" ${st}/><circle cx="17" cy="21" r="2.6" fill="#fff"/><circle cx="25" cy="21" r="2.6" fill="#fff"/><circle cx="33" cy="21" r="2.6" fill="#fff"/><path d="M31 27h18a9 9 0 0 1 9 9v6a9 9 0 0 1-7 8.800V58l-8-7H31a9 9 0 0 1-9-9v-6a9 9 0 0 1 9-9z" fill="#fff" ${st}/><circle cx="33" cy="39" r="2.4" fill="${N}"/><circle cx="40" cy="39" r="2.4" fill="${N}"/><circle cx="47" cy="39" r="2.4" fill="${N}"/>`,
    chance: `<g transform="rotate(-9 32 32)"><rect x="10" y="10" width="44" height="44" rx="11" fill="#fff" ${st}/><circle cx="21" cy="21" r="4" fill="${N}"/><circle cx="43" cy="21" r="4" fill="${N}"/><circle cx="21" cy="43" r="4" fill="${N}"/><circle cx="43" cy="43" r="4" fill="${N}"/><circle cx="32" cy="32" r="4.6" fill="#F0503C"/></g>`,
    bill: `<path d="M15 7h34v49l-5.700-4.500-5.600 4.500-5.700-4.500-5.700 4.500-5.600-4.500L15 56z" fill="#fff" ${st}/><path d="M23 19h18M23 27h18M23 35h8" fill="none" stroke="#9AA3C4" stroke-width="3.5" stroke-linecap="round"/><rect x="33" y="38" width="12" height="6" rx="3" fill="#F0503C"/>`,
    coin: `<circle cx="32" cy="32" r="24" fill="#FFD23F" ${st}/><circle cx="32" cy="32" r="17" fill="none" stroke="#E0A800" stroke-width="3"/><path d="M38 26c-2-3.500-11-3.500-11 1.800 0 6.200 11.500 3 11.500 9.200 0 5.200-9.500 5.200-12 1M32 19v26" fill="none" ${st}/>`,
    home: `<path d="M13 30v24h38V30L32 13z" fill="#FFEBC4" ${st}/><path d="M5 33 32 9l27 24h-9L32 17 14 33z" fill="#E55A45" ${st}/><rect x="27" y="38" width="10" height="16" rx="2.5" fill="#A9683C" ${st}/>`,
    asset: `<rect x="8" y="38" width="12" height="18" rx="3.500" fill="#17A865" ${st}/><rect x="26" y="29" width="12" height="27" rx="3.500" fill="#17A865" ${st}/><rect x="44" y="20" width="12" height="36" rx="3.500" fill="#17A865" ${st}/><path d="M9 25 24 14l8 6 15-11M38 8h10v10" fill="none" ${st}/>`,
    finlit: `<path d="M32 7 54 15v15c0 14-9 22-22 27C19 52 10 44 10 30V15z" fill="#4D7BF3" ${st}/><path d="M22 31l7 7 13-14" fill="none" stroke="#fff" stroke-width="5.500" stroke-linecap="round" stroke-linejoin="round"/>`,
    gym: `<rect x="20" y="28" width="24" height="8" rx="3" fill="#9AA3C4" ${st}/><rect x="8" y="17" width="14" height="30" rx="5.500" fill="#F0503C" ${st}/><rect x="42" y="17" width="14" height="30" rx="5.500" fill="#F0503C" ${st}/>`,
    hourglass: `<path d="M20 11c0 12 8 15 12 21 4-6 12-9 12-21zM20 53c0-12 8-15 12-21 4 6 12 9 12 21z" fill="#BFEFF7" ${st}/><path d="M25.500 50c1-6 4.500-8 6.500-11 2 3 5.500 5 6.500 11z" fill="#FFD23F"/><path d="M16 9h32M16 55h32" fill="none" stroke="${N}" stroke-width="5" stroke-linecap="round"/>`,
    reel: `<path d="M50 36h6V20" fill="none" ${st}/><circle cx="56" cy="17" r="5" fill="#F0503C" ${st}/><rect x="5" y="14" width="46" height="40" rx="9" fill="#FFD23F" ${st}/><rect x="11" y="24" width="9.500" height="20" rx="3" fill="#fff" stroke="${N}" stroke-width="2.500"/><rect x="23.200" y="24" width="9.500" height="20" rx="3" fill="#fff" stroke="${N}" stroke-width="2.500"/><rect x="35.500" y="24" width="9.500" height="20" rx="3" fill="#fff" stroke="${N}" stroke-width="2.500"/>`,
    wild: `<g transform="rotate(8 32 32)"><rect x="13" y="7" width="38" height="50" rx="8" fill="#B56BE8" ${st}/><path d="M32 18l4 8.500 9.500 1.200-7 6.500 2 9.300-8.500-4.800-8.500 4.800 2-9.300-7-6.500 9.500-1.200z" fill="#FFD23F" stroke="${N}" stroke-width="2.500" stroke-linejoin="round"/></g>`,
    mult: `<rect x="8" y="8" width="48" height="48" rx="12" fill="#FFD23F" ${st}/><path d="M22 22l20 20M42 22 22 42" fill="none" stroke="${N}" stroke-width="6" stroke-linecap="round"/>`,
    coach: `<rect x="13" y="12" width="38" height="46" rx="7" fill="#fff" ${st}/><rect x="23" y="6" width="18" height="12" rx="4" fill="#9AA3C4" ${st}/><path d="M22 31l5 5 9-10M22 46h20" fill="none" stroke="#17A865" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    star: `<path d="M32 6l7.500 16.500 18 2.200-13.500 12.300 4 17.700L32 45.500 16 54.700l4-17.700L6.500 24.700l18-2.200z" fill="#FFD23F" ${st}/>`,
  };
  const ICON = {};
  Object.keys(ART).forEach((k) => {
    ICON[k] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${ART[k]}</svg>`);
  });
  /* У прокачанных символов в углу звёзды: одна на втором уровне, две на третьем */
  const ICONL = {};
  C.LEVELED.forEach((k) => {
    const badge = (x) => `<g transform="translate(${x} -1) scale(0.4)">${ART.star}</g>`;
    ICONL[k] = [ICON[k], ICON[k]].concat([badge(40), badge(22) + badge(40)].map((b) =>
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${ART[k]}${b}</svg>`)));
  });
  const icon = (sym) => (ICONL[sym] ? ICONL[sym][C.level(S, sym)] : ICON[sym]);
  const NAMES = { work: 'Работа', study: 'Учёба', health: 'Здоровье', network: 'Связи', chance: 'Шанс', coin: 'Монета', bill: 'Счета', wild: 'Джокер' };
  const cardsTxt = (n) => `${n} ${plural(n, 'карта', 'карты', 'карт')}`;
  const cardWord = (n) => `${n > 0 ? '+' : '−'}${Math.abs(n)} ${plural(n, 'карта', 'карты', 'карт')}`;

  /* ---------- Сцена: гладкий SVG, живёт своей жизнью между спинами ---------- */
  const scene = $('scene');
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => {
    const x = hex(a), y = hex(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  const SKY = [
    [0.00, ['#7FB8F5', '#FFD9B8']],
    [0.22, ['#4FA9F0', '#C4E8FB']],
    [0.60, ['#3D9BEA', '#B5E0FA']],
    [0.82, ['#5C6BD0', '#FFB36B']],
    [1.00, ['#1F2260', '#C0567A']],
  ];
  function skyAt(f) {
    for (let i = 1; i < SKY.length; i++) {
      if (f <= SKY[i][0]) {
        const t = (f - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]);
        return SKY[i][1].map((c, k) => mix(SKY[i - 1][1][k], c, t));
      }
    }
    return SKY[SKY.length - 1][1];
  }
  const cloud = (y, d, dl, sc) => `<g class="cloud" style="--y:${y}px;--d:${d}s;--dl:${dl}s;transform:translate(${(-dl / d) * 540 - 70}px,${y}px)"><g transform="scale(${sc})" fill="#fff" opacity=".92"><ellipse cx="0" cy="0" rx="22" ry="10"/><ellipse cx="-17" cy="4" rx="14" ry="8"/><ellipse cx="18" cy="4" rx="16" ry="8"/><ellipse cx="2" cy="-7" rx="13" ry="9"/></g></g>`;
  scene.innerHTML = `
    <defs>
      <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop id="sky0" offset="0"/><stop id="sky1" offset="1"/></linearGradient>
      <radialGradient id="sunG"><stop offset="0" stop-color="#FFF6C2" stop-opacity=".9"/><stop offset="1" stop-color="#FFE889" stop-opacity="0"/></radialGradient>
      ${Art.defs()}
    </defs>
    <rect width="400" height="180" fill="url(#skyG)"/>
    <g id="stars" fill="#fff">${[[30, 22], [70, 40], [118, 16], [160, 34], [205, 20], [250, 42], [300, 18], [345, 36], [380, 24], [95, 58], [275, 60]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1 : 1.5}"/>`).join('')}</g>
    <g id="sun"><circle class="anim glow" r="36" fill="url(#sunG)"/><circle id="sunDisc" r="15"/></g>
    ${cloud(34, 80, -10, 1)}${cloud(58, 110, -60, 0.7)}${cloud(24, 95, -75, 0.85)}
    <path id="hillFar" d="M0 126 Q55 94 120 116 T250 104 T400 114 V180 H0Z"/>
    <g id="backdrop"></g>
    <path id="hillNear" d="M0 136 Q90 114 190 132 T400 124 V180 H0Z"/>
    <path id="ground" d="M0 142 Q200 130 400 142 V180 H0Z"/>
    <path id="groundPath" d="M0 166 Q200 154 400 166 V180 H0Z" fill="#fff" opacity=".22"/>
    <g id="home" transform="translate(-12 0)"></g>
    <g id="tree"></g>
    <g id="vehicle"></g>
    <g id="coins"></g>
    <g id="char" transform="translate(329 161) scale(0.88)"><ellipse cx="0" cy="1" rx="15" ry="3.400" fill="#1B1F4B" opacity=".18"/><g id="charBody" class="body"></g><g id="charTag"></g></g>
    <g id="weather"></g>`;
  const el = (id) => scene.querySelector('#' + id);
  const coinCount = (s) => (s.money < 100 ? 0 : Math.min(5, Math.floor(Math.log10(s.money)) - 1));
  /* транспорт на сцене растёт вместе с рубежами по деньгам: это только вид */
  const vehicleTier = (s) => Math.min(6, s.ms);

  let lastDrawnMonth = 0;
  const keys = {};
  function part(id, key, build) {
    if (keys[id] === key) return false;
    keys[id] = key;
    el(id).innerHTML = build();
    return true;
  }
  function drawScene(firstTime) {
    const s = S;
    const f = Math.min(1, s.month / C.TOTAL);
    const villa = s.home === 5;
    const season = Math.floor((s.month % 12) / 3);
    const sky = skyAt(f);
    el('sky0').setAttribute('stop-color', sky[0]);
    el('sky1').setAttribute('stop-color', sky[1]);
    el('stars').setAttribute('opacity', Math.max(0, (f - 0.84) / 0.16).toFixed(2));
    const late = Math.max(0, (f - 0.6) / 0.4);
    if (firstTime || s.month < lastDrawnMonth) scene.classList.remove('live');
    lastDrawnMonth = s.month;
    el('sun').style.transform = `translate(${(30 + f * 340).toFixed(1)}px, ${(112 - Math.sin(Math.PI * f) * 88).toFixed(1)}px)`;
    if (!scene.classList.contains('live')) { void scene.getBoundingClientRect(); requestAnimationFrame(() => scene.classList.add('live')); }
    el('sunDisc').setAttribute('fill', mix('#FFE889', '#FF9A5C', late));
    const ground = villa ? '#F0DDA6' : ['#8FD66B', '#6CC455', '#D6B85A', '#EEF3FA'][season];
    el('ground').setAttribute('fill', ground);
    el('hillNear').setAttribute('fill', villa ? mix('#F0DDA6', '#C9A86A', 0.4) : mix(ground, '#2F7A5A', season === 3 ? 0.18 : 0.32));
    el('hillFar').setAttribute('fill', mix(sky[1], '#5B7FB0', 0.5));
    el('hillNear').style.display = villa ? 'none' : '';

    /* задний план: город, пригород или море; к вечеру в окнах зажигается свет */
    const bd = el('backdrop'), kind = villa ? 'sea' : s.home === 4 ? 'suburb' : 'city';
    part('backdrop', kind, () => Art.backdrop(kind));
    bd.setAttribute('transform', kind === 'suburb' ? 'translate(0 -9)' : 'translate(0 0)');
    bd.style.color = mix(sky[1], '#3A4A80', kind === 'sea' ? 0.35 : 0.5);
    bd.style.setProperty('--lit', Math.max(0, Math.min(1, (f - 0.6) / 0.2)).toFixed(2));

    const pop = (id) => { const n = el(id); n.classList.remove('pop'); void n.getBoundingClientRect(); n.classList.add('pop'); };
    if (part('home', 'h' + s.home, () => `<g>${Art.home(s.home)}</g>`) && !firstTime) pop('home');
    const vt = vehicleTier(s);
    if (part('vehicle', 'v' + vt, () => (vt ? Art.vehicle(vt) : '')) && !firstTime && vt) pop('vehicle');
    part('tree', villa ? 'palm' : 't' + season, () => (villa ? Art.palm(366, 142, 58, 'fade') : Art.tree(season)));
    part('coins', 'c' + coinCount(s), () => Art.coins(coinCount(s)));
    const a = C.age(s);
    part('charBody', [s.job, a < 45 ? 0 : a < 57 ? 1 : 2, s.health < 25 ? 0 : s.health < 50 ? 1 : 2].join(), () => Art.person({ job: s.job, age: a, health: s.health }));
    part('charTag', s.money < 0 ? 'debt' : 'ok', () => (s.money < 0 ? '<rect x="-16" y="-104" width="32" height="15" rx="7.500" fill="#F0503C"/><text x="0" y="-93" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="9.500" fill="#fff">долг</text>' : ''));
    part('weather', villa ? 'none' : season === 3 ? 'snow' : season === 2 ? 'leaves' : 'none', () => Art.weather(villa ? '' : season === 3 ? 'snow' : season === 2 ? 'leaves' : ''));
  }
  function charAct(cls) {
    const c = el('char');
    c.classList.remove('jump', 'shake');
    void c.getBoundingClientRect();
    c.classList.add(cls);
  }
  el('charBody').addEventListener('animationend', (e) => {
    if (e.target === el('charBody') && (e.animationName === 'jump' || e.animationName === 'shake')) el('char').classList.remove('jump', 'shake');
  });
  ['home', 'vehicle'].forEach((id) => el(id).addEventListener('animationend', (e) => { if (e.animationName === 'homepop') el(id).classList.remove('pop'); }));

  /* ---------- Эффекты поверх интерфейса ---------- */
  const fly = $('fly');
  /* at: необязательная точка в долях сцены, иначе подпись всплывает над персонажем */
  function floatLabel(text, tone, at) {
    const wrap = $('sceneWrap').getBoundingClientRect(), c = el('char').getBoundingClientRect();
    if (!at) $('fx').querySelectorAll('.float:not(.keep)').forEach((n) => n.remove());
    const d = document.createElement('div');
    d.className = 'float ' + (tone || '') + (at ? ' keep' : '');
    d.textContent = text;
    d.style.left = (at ? wrap.width * at.x : Math.max(60, Math.min(wrap.width - 60, c.left + c.width / 2 - wrap.left))) + 'px';
    d.style.top = (at ? wrap.height * at.y : Math.max(44, c.top - wrap.top + 6)) + 'px';
    $('fx').appendChild(d);
    setTimeout(() => d.remove(), reduceMotion ? 1100 : 1350);
  }
  function coinFly(n) {
    if (reduceMotion) return;
    const a = $('reels').getBoundingClientRect(), b = $('money').getBoundingClientRect();
    const tx = b.left + Math.min(b.width, 120) / 2, ty = b.top + b.height / 2;
    for (let i = 0; i < n; i++) {
      const im = new Image();
      im.src = ICON.coin;
      fly.appendChild(im);
      const sx = a.left + a.width * (0.2 + 0.6 * Math.random()), sy = a.top + a.height / 2;
      const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 120, my = Math.min(sy, ty) - 30 - Math.random() * 50;
      const an = im.animate([
        { transform: `translate(${sx}px, ${sy}px) scale(0.4)`, opacity: 0 },
        { transform: `translate(${sx}px, ${sy - 14}px) scale(1.1)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.5)`, opacity: 0.9 },
      ], { duration: 620 + i * 20, delay: i * 55, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'backwards' });
      an.onfinish = () => im.remove();
    }
  }
  function confetti(count, big) {
    if (reduceMotion) return;
    const r = $('sceneWrap').getBoundingClientRect();
    const cols = ['#FFD23F', '#F0503C', '#17A865', '#4D7BF3', '#FFFFFF', '#FF9FC2'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.style.background = cols[i % cols.length];
      fly.appendChild(p);
      const x0 = r.left + r.width * (0.3 + Math.random() * 0.4), y0 = r.top + r.height * 0.45;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = (big ? 150 : 90) + Math.random() * (big ? 190 : 110);
      const dx = Math.cos(ang) * v, dy = Math.sin(ang) * v;
      const an = p.animate([
        { transform: `translate(${x0}px, ${y0}px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${x0 + dx * 0.8}px, ${y0 + dy}px) rotate(${200 + Math.random() * 200}deg)`, opacity: 1, offset: 0.38, easing: 'cubic-bezier(.4,0,.9,.6)' },
        { transform: `translate(${x0 + dx * 1.15}px, ${y0 + dy + (big ? 420 : 260)}px) rotate(${500 + Math.random() * 300}deg)`, opacity: 0 },
      ], { duration: (big ? 1900 : 1300) + Math.random() * 400, easing: 'cubic-bezier(.1,.7,.3,1)' });
      an.onfinish = () => p.remove();
    }
  }
  let shownMoney = 0, moneyRaf = 0;
  function tweenMoney(to) {
    const m = $('money');
    cancelAnimationFrame(moneyRaf);
    const from = shownMoney, t0 = performance.now(), dur = reduceMotion || document.hidden ? 0 : Math.min(500, 420 / Math.sqrt(M.speed));
    const paint = (v) => { shownMoney = v; m.textContent = money(v); m.classList.toggle('debt', v < 0); };
    if (!dur || from === to) { paint(to); return; }
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      paint(from + (to - from) * e);
      if (k < 1) moneyRaf = requestAnimationFrame(step); else paint(to);
    };
    moneyRaf = requestAnimationFrame(step);
  }
  function pulse(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }

  /* ---------- Звук: выключен, пока игрок сам не включит ---------- */
  let audio = null;
  function tone(freq, dur, type, vol, delay) {
    if (!M.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime + (delay || 0);
      const o = audio.createOscillator(), gn = audio.createGain();
      o.type = type || 'triangle'; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol || 0.07, t0);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn).connect(audio.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* без звука */ }
  }
  const sfx = {
    stop: () => tone(220, 0.05, 'sine', 0.06),
    good: () => { tone(659, 0.1); tone(988, 0.16, 'triangle', 0.07, 0.08); },
    big: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, i * 0.08)),
    bad: () => { tone(220, 0.16, 'sawtooth', 0.04); tone(165, 0.24, 'sawtooth', 0.04, 0.11); },
    buy: () => { tone(784, 0.07, 'sine', 0.08); tone(1175, 0.1, 'sine', 0.07, 0.06); },
    fork: () => { tone(440, 0.12, 'sine', 0.08); tone(554, 0.12, 'sine', 0.08, 0.1); tone(659, 0.2, 'sine', 0.08, 0.2); },
    tick: () => tone(520, 0.03, 'sine', 0.04),
  };

  /* ---------- Барабаны ---------- */
  const reelEls = Array.from(document.querySelectorAll('.reel'));
  const strips = reelEls.map((r) => r.firstElementChild);
  let shown = ['work', 'study', 'health', 'network'];
  let anims = [];
  function cell(sym) {
    const im = new Image();
    im.src = icon(sym); im.alt = ''; im.draggable = false;
    return im;
  }
  function setReel(i, sym) { strips[i].style.transform = ''; strips[i].replaceChildren(cell(sym)); shown[i] = sym; }
  const multCell = $('multCell');
  function setMult(v) { multCell.className = 'mult' + (v ? ' on m' + v : ''); multCell.firstElementChild.textContent = v ? '×' + v : '×'; }
  function clearHits() { reelEls.forEach((r) => r.classList.remove('hit-good', 'hit-bad', 'hit-fork')); setMult(null); }
  function animateReels(target, dur, done) {
    clearHits();
    if (dur <= 0 || !strips[0].animate) {
      target.forEach((sym, i) => setReel(i, sym));
      done();
      return;
    }
    const n = target.length;
    let left = n;
    anims = strips.slice(0, n).map((strip, i) => {
      /* пролетающие символы берутся с теми же весами, что и настоящие */
      const filler = [];
      for (let k = 0; k < 2 + i; k++) filler.push(...C.rollReels(S));
      const cells = [cell(target[i]), ...filler.map(cell), cell(shown[i])];
      strip.replaceChildren(...cells);
      const h = reelEls[i].clientHeight;
      strip.style.transform = `translateY(${-h * (cells.length - 1)}px)`;
      const a = strip.animate([
        { transform: `translateY(${-h * (cells.length - 1)}px)`, filter: 'blur(1.6px)', easing: 'cubic-bezier(.35,.1,.45,1)' },
        { transform: `translateY(${h * 0.13}px)`, filter: 'blur(0px)', offset: 0.84, easing: 'ease-out' },
        { transform: 'translateY(0)', filter: 'blur(0px)' },
      ], { duration: dur * (0.62 + i * 0.38 / (n - 1)) });
      a.onfinish = () => {
        strip.style.transform = '';
        setReel(i, target[i]);
        sfx.stop();
        if (--left === 0) { anims = []; done(); }
      };
      return a;
    });
  }

  /* ---------- Цикл спинов ---------- */
  const SPEEDS = [1, 2, 4];
  let phase = 'idle';
  let timer = null;
  let pending = null;
  let pendingCharged = null;
  let wantCharge = false;
  let modalOpen = false;
  let forkOpen = false;
  let chargeOpen = false;
  let traitOpen = false;
  let adOpen = false;
  let menuOpen = true;
  let storeOpen = false;
  const spinMs = () => 1000 / M.speed;
  const holdMs = () => 800 / M.speed;
  const blocked = () => menuOpen || storeOpen || modalOpen || forkOpen || chargeOpen || traitOpen || adOpen || !!S.fork || !!S.traitOptions || S.status !== 'playing';

  /* chargedSym: символ «Своего месяца», если игрок потратил звезду */
  function startSpin(chargedSym) {
    if (blocked() || phase === 'spinning') return;
    clearTimeout(timer);
    const reels = typeof chargedSym === 'string' ? C.chargedReels(S, chargedSym) : C.rollReels(S);
    if (!reels) return;
    phase = 'spinning';
    pending = reels;
    pendingCharged = typeof chargedSym === 'string' ? chargedSym : null;
    animateReels(pending, reduceMotion ? 0 : spinMs(), finishSpin);
  }

  function finishSpin() {
    const prev = { job: S.job, home: S.home };
    const res = C.resolve(S, pending, undefined, pendingCharged ? { charged: pendingCharged } : null);
    pending = null;
    pendingCharged = null;
    phase = 'idle';
    if (!res) return;
    showResult(res);
    render(prev);
    save();
    if (S.status !== 'playing') { setTimeout(endLife, reduceMotion ? 0 : 500); return; }
    if (res.million) { setTimeout(maybeMillion, reduceMotion ? 0 : 500); return; }
    if (S.fork) { setTimeout(openFork, reduceMotion ? 0 : 450); return; }
    if (wantCharge && C.canCharge(S)) { openCharge(); return; }
    wantCharge = false;
    schedule(reduceMotion ? spinMs() : 0);
  }

  function schedule(extra) {
    clearTimeout(timer);
    if (M.auto && !blocked() && !document.hidden) timer = setTimeout(startSpin, holdMs() + (extra || 0));
  }

  function manualSpin() {
    if (blocked()) return;
    if (phase === 'spinning') anims.slice().forEach((a) => a.finish());
    else startSpin();
  }

  function gainText(gain) {
    const parts = [];
    if (gain.skill) parts.push(`навык ${gain.skill > 0 ? '+' : '−'}${Math.abs(gain.skill)}`);
    if (gain.network) parts.push(`связи ${gain.network > 0 ? '+' : '−'}${Math.abs(gain.network)}`);
    if (gain.health) parts.push(`здоровье ${gain.health > 0 ? '+' : '−'}${Math.abs(gain.health)}`);
    return parts.join(', ');
  }

  /* Слева что случилось, справа итог месяца: зарплата и пассив вместе с событием */
  function setMsg(text, delta, tone, label) {
    const m = $('msg');
    m.className = 'msg ' + (tone || 'plain');
    m.innerHTML = `<span>${esc(text)}</span>` + (delta == null ? '' : `<span class="delta ${delta < 0 ? 'neg' : 'pos'}"><small>${label == null ? 'за месяц' : label}</small>${signed(delta)}</span>`);
  }

  function pushLog(text, delta, tone) {
    M.log.unshift({ a: C.age(S), text, delta, tone });
    if (M.log.length > 40) M.log.length = 40;
  }

  function milestone(value) {
    if (!value) return;
    const ride = Art.VEHICLE_NAMES[vehicleTier(S)];
    pushLog(`Рубеж: на счету ${short(value)}. В колоду легла карта Шанса` + (ride ? `, новый транспорт: ${ride.toLowerCase()}` : ''), null, 'star');
    setTimeout(() => { floatLabel(`Рубеж ${short(value)}`, 'plain', { x: 0.3, y: 0.62 }); confetti(26, false); sfx.big(); }, reduceMotion ? 0 : 750);
  }

  function showResult(res) {
    const partText = (p) => {
      const bits = [];
      if (p.money) bits.push(signed(p.money));
      const g = gainText(p.gain);
      if (g) bits.push(g);
      return p.text + (bits.length ? ': ' + bits.join(', ') : '');
    };
    setMsg((res.mult > 1 ? `Множитель ×${res.mult}. ` : '') + (res.combos.length ? res.combos.map(partText).join('; ') : res.text), res.delta, res.tone);
    if (res.mult) {
      setMult(res.mult);
      pulse(multCell, 'hit');
      if (res.mult > 1) setTimeout(() => floatLabel(`Множитель ×${res.mult}`, 'plain', { x: 0.3, y: 0.56 }), reduceMotion ? 0 : 200);
      if (res.mult >= 5) { pushLog(`Множитель ×${res.mult}`, null, 'star'); confetti(30, false); }
    }
    if (res.birthday) pulse($('ageText'), 'pop');
    if (res.chargeFull) { sfx.tick(); pulse($('chargeBtn'), 'fresh'); floatLabel('Звезда готова', 'plain', { x: 0.72, y: 0.4 }); }
    if (!res.combos.length) { milestone(res.milestone); return; }

    const HIT = { good: 'hit-good', bad: 'hit-bad', fork: 'hit-fork' };
    res.combos.forEach((p) => {
      if (HIT[p.tone]) res.reels.forEach((sym, i) => { if (p.sym === 'set' ? p.syms.includes(sym) : sym === p.sym || (p.wild && sym === 'wild')) reelEls[i].classList.add(HIT[p.tone]); });
      if (p.tone === 'good' || p.tone === 'bad') pushLog(partText(p).replace(/: [+−]\u2060?\$[^,;]*(, )?/, (all, more) => (more ? ': ' : '')), p.money || null, p.tone);
    });
    const good = res.combos.filter((p) => p.tone === 'good');
    const bad = res.combos.filter((p) => p.tone === 'bad');
    const big = res.combos.some((p) => p.tone === 'good' && p.count >= 3);
    const cash = good.reduce((a, p) => a + p.money, 0);
    if (bad.length && (!good.length || res.event < 0)) {
      sfx.bad();
      charAct('shake');
      floatLabel(signed(res.event || bad[0].money), 'bad');
      pulse($('money'), 'hurt');
    } else if (good.length) {
      (big ? sfx.big : sfx.good)();
      charAct('jump');
      floatLabel(res.event > 0 ? signed(res.event) : gainText(res.gain) || good[0].text, '');
      if (cash > 0) { coinFly(big ? 9 : 5); setTimeout(() => pulse($('money'), 'bump'), reduceMotion ? 0 : 560); }
      if (big) confetti(22, false);
    } else if (res.tone === 'fork') sfx.fork();

    res.levelUps.forEach((u, i) => {
      pushLog(`${NAMES[u.sym]}: символ вырос до уровня ${u.level}`, null, 'star');
      setTimeout(() => { floatLabel(`${NAMES[u.sym]}: уровень ${u.level}`, 'plain', { x: 0.3, y: 0.36 + i * 0.2 }); confetti(16, false); sfx.big(); }, reduceMotion ? 0 : 650);
    });
    milestone(res.milestone);
  }

  /* ---------- Развилки ---------- */
  function openFork() {
    if (menuOpen || storeOpen) return;
    const f = C.fork(S);
    if (!f) { schedule(); return; }
    forkOpen = true;
    clearTimeout(timer);
    $('forkIcon').src = ICON.chance;
    $('forkTitle').textContent = f.title;
    $('forkText').textContent = f.text;
    [$('forkA'), $('forkB')].forEach((b, i) => {
      const o = f.options[i];
      b.firstElementChild.textContent = o.label;
      b.lastElementChild.textContent = o.enabled ? o.note : 'Не хватает денег';
      b.disabled = !o.enabled;
    });
    const g = $('forkG');
    g.hidden = !f.gold;
    if (f.gold) {
      g.children[0].textContent = ownsNoAds() ? 'Золотой: без рекламы' : 'Золотой: за рекламу';
      g.children[1].textContent = f.gold.label;
      g.children[2].textContent = f.gold.enabled ? f.gold.note : 'Не хватает денег';
      g.disabled = !f.gold.enabled;
    }
    $('forkLay').hidden = false;
    openedAt = Date.now();
    $('forkBox').focus();
    render();
  }
  /* Заглушка рекламы с таймером: когда он дойдёт до конца, срабатывает обещанный бонус. Уйти можно в любой момент. */
  const AD_MS = 5000;
  let adTimer = null, adTick = null, adDone = null;
  function stopAd() {
    clearTimeout(adTimer); clearInterval(adTick);
    adOpen = false; adDone = null;
    $('adLay').hidden = true;
  }
  function openAd(onDone) {
    if (adOpen) return;
    const ms = window.z2m && window.z2m.adMs != null ? window.z2m.adMs : AD_MS;
    adOpen = true; adDone = onDone;
    clearTimeout(timer);
    $('adIcon').src = ICON.star;
    const fill = $('adFill'), t0 = Date.now();
    fill.style.transition = 'none'; fill.style.width = '0%';
    $('adLay').hidden = false;
    void fill.offsetWidth;
    fill.style.transition = `width ${ms}ms linear`; fill.style.width = '100%';
    const left = () => { $('adLeft').textContent = `Осталось ${Math.max(0, Math.ceil((ms - (Date.now() - t0)) / 1000))} с`; };
    left();
    adTick = setInterval(left, 250);
    adTimer = setTimeout(() => { const fn = adDone; stopAd(); if (fn) fn(); }, ms);
    $('adBox').focus();
  }
  function closeAd() {
    if (!adOpen) return;
    stopAd();
    openedAt = Date.now();
    if (forkOpen) $('forkBox').focus(); else if (modalOpen) $('modalBox').focus(); else schedule();
  }
  /* Купленное «Без рекламы» отдаёт тот же бонус сразу, без ролика: суммы и ограничения не меняются */
  function ownsNoAds() { return C.noAds(M.owned); }
  function withAd(onDone) {
    if (adOpen) return;
    if (!ownsNoAds()) { openAd(onDone); return; }
    clearTimeout(timer);
    onDone();
  }
  function chooseFork(idx) {
    if (!forkOpen || adOpen || Date.now() - openedAt < GUARD) return;
    if (idx === 'gold') withAd(() => applyFork('gold')); else applyFork(idx);
  }
  function applyFork(idx) {
    if (!forkOpen) return;
    const prev = { job: S.job, home: S.home };
    const res = C.choose(S, idx);
    if (!res) return;
    forkOpen = false;
    $('forkLay').hidden = true;
    const cards = res.cards.map((c) => `${cardWord(c.n)} ${C.CARD_NAME[c.sym]}`).join(', ');
    const extra = [gainText(res.gain), cards].filter(Boolean).join(', ');
    setMsg(res.text + (extra ? ': ' + extra : ''), res.delta || null, res.tone, res.gold ? 'золотой вариант' : 'развилка');
    pushLog((res.gold ? 'Золотой вариант. ' : '') + res.text + (cards ? ': ' + cards : ''), res.delta || null, res.tone);
    if (res.promoted) { confetti(18, false); pulse($('jobText'), 'pop'); }
    if (res.tone === 'good') {
      sfx.good(); charAct('jump');
      floatLabel(res.delta > 0 ? signed(res.delta) : extra || 'Готово', '');
      if (res.delta > 0) { coinFly(7); setTimeout(() => pulse($('money'), 'bump'), reduceMotion ? 0 : 560); }
    } else if (res.tone === 'bad') {
      sfx.bad(); charAct('shake'); floatLabel(signed(res.delta), 'bad'); pulse($('money'), 'hurt');
    } else if (extra) floatLabel(extra, 'plain');
    milestone(res.milestone);
    render(prev);
    save();
    if (S.status !== 'playing') { setTimeout(endLife, reduceMotion ? 0 : 500); return; }
    if (res.million) { setTimeout(maybeMillion, reduceMotion ? 0 : 500); return; }
    if (wantCharge && C.canCharge(S)) { openCharge(); return; }
    schedule(300);
  }

  /* ---------- Свой месяц: звезда и выбор символа ---------- */
  function chargeNote(sym) {
    const fx = C.effect(S, sym, 3);
    if (sym === 'work') return `Годовой бонус: ${signed(Math.round(C.baseSalary(S) * fx.salaries))}`;
    if (sym === 'study') return `Прорыв в учёбе: навык +${fx.skill}`;
    if (sym === 'health') return `Отпуск у моря: здоровье +${fx.health}`;
    return `Закрытая тусовка: связи +${fx.network}`;
  }
  function openCharge() {
    wantCharge = false;
    if (!C.canCharge(S) || blocked()) return;
    chargeOpen = true;
    clearTimeout(timer);
    $('chargeIcon').src = ICON.star;
    $('chargeOpts').innerHTML = C.FOCI.map((k) =>
      `<button class="opt" type="button" data-sym="${k}"><img src="${icon(k)}" alt=""><b>${NAMES[k]}</b><span>${esc(chargeNote(k))}</span></button>`).join('');
    $('chargeLay').hidden = false;
    openedAt = Date.now();
    $('chargeBox').focus();
  }
  function closeCharge(sym) {
    if (!chargeOpen || Date.now() - openedAt < GUARD) return;
    chargeOpen = false;
    $('chargeLay').hidden = true;
    if (sym) { sfx.fork(); startSpin(sym); } else schedule();
  }
  function askCharge() {
    if (!C.canCharge(S) || modalOpen || forkOpen || chargeOpen || traitOpen) return;
    clearTimeout(timer);
    if (phase === 'spinning') { wantCharge = true; anims.slice().forEach((a) => a.finish()); } else openCharge();
  }

  /* ---------- Покупки и фокус ---------- */
  const LOGGED = {
    job: () => `Повышение: ${C.JOBS[S.job].name}. В колоду легла карта Работы`,
    home: () => `Переезд: ${C.HOMES[S.home].name}`,
    asset: () => `Инвестиция: ${C.ASSETS[S.assets - 1].name}. В колоду легла карта Монеты`,
    reel: () => 'Поставил четвёртый барабан',
  };
  const UP_FLOAT = { mult: 'Множитель!', star: 'Звезда быстрее', insure: 'Счета мягче', coach: 'Опыт ×2' };
  const FLOAT = { job: () => 'Повышение!', home: () => 'Новоселье!', asset: () => `+${money(C.assetIncome(S, S.assets - 1))} в мес.`, gym: () => 'здоровье +20', reel: () => 'Четыре барабана!' };
  function useBoost(li) {
    if (!C.boostReady(S) || modalOpen || forkOpen || chargeOpen || traitOpen) return;
    withAd(() => {
      if (!C.startBoost(S)) { schedule(); return; }
      sfx.big(); charAct('jump'); confetti(20, false);
      pushLog(`Удачный год: ${C.BOOST_LEN} месяцев все доходы вдвое`, null, 'star');
      floatLabel('Доходы ×2', '');
      pulse(li, 'flash');
      render(); save(); schedule(300);
    });
  }
  function buy(kind, li) {
    if (kind === 'boost') { useBoost(li); return; }
    const before = S.money, prev = { job: S.job, home: S.home };
    if (!C.act(S, kind)) return;
    sfx.buy();
    const card = kind.slice(0, 4) === 'add:' ? 1 : kind.slice(0, 4) === 'cut:' ? -1 : 0;
    if (kind.slice(0, 3) === 'up:') {
      const id = kind.slice(3), max = C.UPGRADES[id].costs.length;
      pushLog(`Улучшение: ${C.UPGRADES[id].name}` + (max > 1 ? `, уровень ${S.up[id]}` : ''), S.money - before, 'plain');
      floatLabel(UP_FLOAT[id], 'plain');
      if (id === 'mult') { charAct('jump'); confetti(20, false); }
    } else if (card) {
      const name = C.CARD_NAME[kind.slice(4)];
      pushLog(card > 0 ? `Карта ${name} легла в колоду` : `Карта ${name} убрана из колоды`, S.money - before, 'plain');
      floatLabel(`${cardWord(card)} ${name}`, 'plain');
    } else {
      if (LOGGED[kind]) pushLog(LOGGED[kind](), kind === 'job' ? null : S.money - before, kind === 'job' ? 'star' : 'plain');
      floatLabel(FLOAT[kind](), kind === 'job' || kind === 'home' ? '' : 'plain');
    }
    if (kind === 'job') { charAct('jump'); confetti(18, false); pulse($('jobText'), 'pop'); }
    if (kind === 'home') charAct('jump');
    if (kind === 'reel') { charAct('jump'); confetti(24, false); setReel(3, shown[3]); }
    pulse(li, 'flash');
    render(prev);
    save();
  }
  function setFocus(f) {
    if (!C.setFocus(S, f)) return;
    sfx.tick();
    render();
    save();
  }

  /* ---------- Отрисовка состояния ---------- */
  const shopRows = {}, deckRows = {};
  const rowOf = (li) => ({ li, h: li.querySelector('h3'), p: li.querySelector('p'), b: li.querySelector('.btn-buy'), hint: li.querySelector('small'), max: li.querySelector('.max-btn'), was: false });
  const SHOP_ICON = { boost: 'star', job: 'work', gym: 'gym', home: 'home', asset: 'asset', reel: 'reel', 'up-mult': 'mult', 'up-star': 'star', 'up-insure': 'finlit', 'up-coach': 'coach' };
  document.querySelectorAll('#shop li').forEach((li) => {
    li.querySelector('img').src = ICON[SHOP_ICON[li.dataset.kind]];
    shopRows[li.dataset.kind] = rowOf(li);
  });
  document.querySelectorAll('#deck li').forEach((li) => { deckRows[li.dataset.kind] = Object.assign(rowOf(li), { img: li.querySelector('img') }); });
  $('chargeBtn').querySelector('img').src = ICON.star;
  $('ticks').innerHTML = C.MILESTONES.filter((v) => v >= 100000).map((v) => `<i style="left:${v / C.GOAL * 100}%"></i>`).join('');

  /* o: title, desc, verb, price, enabled, progress 0..1, hint, done, link (текст ссылки под кнопкой), linkOn */
  function setRow(r, o) {
    if (r.h.textContent !== o.title) r.h.textContent = o.title;
    if (r.p.innerHTML !== o.desc) r.p.innerHTML = o.desc;
    const verb = r.b.firstElementChild, price = r.b.lastElementChild;
    if (verb.textContent !== o.verb) verb.textContent = o.verb || '';
    if (price.textContent !== (o.price || '')) price.textContent = o.price || '';
    r.b.disabled = !o.enabled;
    r.b.style.setProperty('--p', Math.round(Math.max(0, Math.min(1, o.progress || 0)) * 100) + '%');
    r.li.classList.toggle('can', !!o.enabled);
    if (r.max) {
      r.max.hidden = !o.link;
      r.max.disabled = !o.linkOn;
      if (o.link && r.max.textContent !== o.link) r.max.textContent = o.link;
    }
    if (o.enabled && !r.was) pulse(r.b, 'ready');
    if (!o.enabled) r.b.classList.remove('ready');
    r.was = !!o.enabled;
  }

  /* Кнопка с ценой: доступность, полоска накопления и «через сколько» */
  function payer() {
    const s = S, open = s.status === 'playing' && !s.fork && !s.traitOptions, ev = C.expected(s);
    return (cost) => {
      const ok = open && cost != null && s.money >= cost;
      const wait = cost != null && s.money < cost && ev > 0 ? Math.ceil((cost - s.money) / ev) : null;
      return { price: money(cost), enabled: ok, progress: cost ? s.money / cost : 0, hint: wait != null && wait <= 600 ? `через ${span(wait)}` : (s.money < 0 ? 'сначала закрой долг' : '') };
    };
  }

  function renderShop() {
    const s = S;
    const open = s.status === 'playing' && !s.fork && !s.traitOptions;
    const pay = payer();

    setRow(shopRows.boost, s.boost > 0
      ? { title: 'Удачный год идёт', desc: 'Зарплата, пассив и деньги хороших событий вдвое.', verb: 'Идёт', price: `ещё ${s.boost} мес.`, done: true, progress: 1 }
      : C.boostReady(s)
        ? { title: 'Удачный год', desc: `${C.BOOST_LEN} месяцев все доходы вдвое`, verb: ownsNoAds() ? 'Забрать' : 'Смотреть', price: ownsNoAds() ? 'без ролика' : 'рекламу', enabled: true }
        : { title: 'Удачный год', desc: `${C.BOOST_LEN} месяцев все доходы вдвое`, verb: 'Отдых', price: open ? `ещё ${Math.max(0, s.boostAt - s.month)} мес.` : 'позже', done: true, progress: open ? 1 - Math.max(0, s.boostAt - s.month) / C.BOOST_REST : 0 });

    const nj = C.nextJob(s);
    if (nj) {
      const after = C.baseSalary(Object.assign({}, s, { job: s.job + 1 }));
      const ready = s.skill >= nj.skill;
      const from = C.JOBS[s.job].skill;
      setRow(shopRows.job, {
        title: nj.name,
        desc: `Зарплата ${money(C.baseSalary(s))} → ${money(after)}`,
        verb: ready ? 'Повыситься' : 'Навык', price: ready ? 'бесплатно' : `${s.skill} из ${nj.skill}`,
        enabled: open && ready, progress: (s.skill - from) / (nj.skill - from), hint: 'растёт от Учёбы',
      });
    } else setRow(shopRows.job, { title: 'Вершина карьеры', desc: 'Выше только свой единорог, а он у тебя уже есть.', verb: 'Потолок', price: 'карьеры', done: true, progress: 1 });

    const hf = C.healthFactor(s), full = s.health >= 100;
    const less = hf === 0 ? ' <span class="warn">Зарплаты нет: здоровье на нуле.</span>' : hf < 1 ? ` <span class="warn">Зарплата урезана на ${Math.round((1 - hf) * 100)}%.</span>` : '';
    setRow(shopRows.gym, full
      ? { title: 'Спортзал', desc: 'Здоровье полное, качаться незачем.', verb: 'Здоров', price: '100 из 100', enabled: false, done: true, progress: 0 }
      : Object.assign({ title: 'Спортзал', desc: '+20 здоровья.' + less, verb: 'Сходить' }, pay(C.gymCost(s))));

    const hc = C.homeCost(s);
    if (hc != null) setRow(shopRows.home, Object.assign({ title: C.HOMES[s.home + 1].name, desc: '+6% к зарплате, здоровье тратится медленнее', verb: 'Переехать' }, pay(hc)));
    else setRow(shopRows.home, { title: 'Вилла у моря', desc: 'Жильё: лучше уже некуда.', verb: 'Куплено', price: 'максимум', done: true, progress: 1 });

    const ac = C.assetCost(s);
    if (ac != null) {
      const inc = C.assetIncome(s, s.assets);
      const late = Math.ceil(ac / inc) > C.monthsLeft(s);
      setRow(shopRows.asset, Object.assign({
        title: C.ASSETS[s.assets].name,
        desc: `+${money(inc)} в месяц и карта Монеты. ` + (late ? '<span class="warn">До 65 не окупится</span>' : `Окупится за ${span(Math.ceil(ac / inc))}`),
        verb: 'Вложить',
      }, pay(ac)));
    } else setRow(shopRows.asset, { title: 'Все инвестиции', desc: `Портфель приносит ${money(C.passive(s))} в месяц.`, verb: 'Куплено', price: 'максимум', done: true, progress: 1 });

    if (!s.reels4) setRow(shopRows.reel, Object.assign({ title: 'Четвёртый барабан', desc: 'Больше совпадений: две пары сразу и каре', verb: 'Поставить' }, pay(C.reelCost(s))));
    else setRow(shopRows.reel, { title: 'Четвёртый барабан', desc: `Стоит. Событие дают ${pf.format(C.odds(s).any * 100)}% спинов.`, verb: 'Куплено', price: 'стоит', done: true, progress: 1 });

    /* улучшения слота: уровни по порядку, шансы множителя видны до покупки */
    const table = (lvl) => C.multTable(s, lvl).filter((r) => r[0] > 1).map((r) => `×${r[0]} ${r[1]}%`).join(', ');
    const UP_TEXT = {
      mult: (lvl, max) => (lvl === 0 ? `Клетка у барабанов умножает хорошее событие: ${table(1)}.` : lvl < max ? `Сейчас: ${table(lvl)}. Станет: ${table(lvl + 1)}.` : `Шансы: ${table(lvl)}. Остальное ×1.`),
      star: (lvl, max) => (lvl < max ? `«Свой месяц» заряжается за ${C.CHARGE_NEED[lvl + 1]} пустых месяцев вместо ${C.CHARGE_NEED[lvl]}.` : `«Свой месяц» заряжается за ${C.CHARGE_NEED[lvl]} пустых месяцев.`),
      insure: (lvl, max) => (lvl < max ? `Счета забирают на ${Math.round(C.INSURE_CUT[lvl + 1] * 100)}% меньше денег` + (lvl ? `, сейчас на ${Math.round(C.INSURE_CUT[lvl] * 100)}%.` : '.') : `Счета забирают на ${Math.round(C.INSURE_CUT[lvl] * 100)}% меньше денег.`),
      coach: (lvl, max) => (lvl < max ? 'Символы получают вдвое больше опыта и быстрее растут в уровне.' : 'Символы получают вдвое больше опыта.'),
    };
    C.UP_IDS.forEach((id) => {
      const lvl = s.up[id], max = C.UPGRADES[id].costs.length, cost = C.upCost(s, id);
      const title = C.UPGRADES[id].name + (max > 1 && lvl ? `, уровень ${lvl} из ${max}` : '');
      if (cost != null) setRow(shopRows['up-' + id], Object.assign({ title, desc: UP_TEXT[id](lvl, max), verb: lvl ? 'Улучшить' : 'Купить' }, pay(cost)));
      else setRow(shopRows['up-' + id], { title, desc: UP_TEXT[id](lvl, max), verb: 'Куплено', price: 'максимум', done: true, progress: 1 });
    });

    const ready = Object.keys(shopRows).filter((k) => !shopRows[k].b.disabled).length;
    const badge = $('shopBadge');
    badge.dataset.empty = ready === 0 ? '1' : '0';
    badge.textContent = ready || '0';
  }

  /* Колода: по строке на символ. Основная кнопка кладёт карту (у Счетов убирает), ссылка под ней убирает карту. */
  const DECK_COLOR = { wild: '#B56BE8', work: '#D08B4F', study: '#4D7BF3', health: '#F0503C', network: '#17A865', chance: '#FFFFFF', coin: '#FFD23F', bill: '#9AA3C4' };
  const SOURCE = { work: ['Карьера', 'даёт карту'], coin: ['Вложения', 'дают карту'] };
  /* короткое описание эффекта: в строке колоды всего две строки текста */
  function deckDesc(sym) {
    const a = C.effect(S, sym, 2), b = C.effect(S, sym, 3);
    const body = {
      work: () => `Зарплат: пара ${num(a.salaries)}, тройка ${num(b.salaries)}.`,
      study: () => `Навык: пара +${a.skill}, тройка +${b.skill}.`,
      health: () => `Здоровье: пара +${a.health}, тройка +${b.health}.`,
      network: () => `Связи: пара +${a.network}, тройка +${b.network}.`,
      chance: () => `Пара: развилка. Тройка: джекпот, ${b.salaries} зарплат.`,
      coin: () => `Месяцев пассива: пара ${a.months}, тройка ${b.months}.`,
      wild: () => 'Достраивает самую большую группу, кроме Счетов.',
      bill: () => `Зарплат: пара −${num(-a.salaries)}, тройка −${num(-b.salaries)}. И здоровье.`,
    }[sym]();
    return body + (sym === S.focus ? ' В фокусе: карты ×2.' : '');
  }
  function renderDeck() {
    const s = S, o = C.odds(s), pay = payer();
    const open = s.status === 'playing' && !s.fork && !s.traitOptions;
    $('deckSize').textContent = `В колоде ${cardsTxt(C.deckSize(s))}`;
    const bar = C.SYMBOLS.filter((k) => o[k].weight > 0).map((k) => `<i style="flex-grow:${o[k].weight};background:${DECK_COLOR[k]}" title="${NAMES[k]}"></i>`).join('');
    if ($('deckBar').innerHTML !== bar) $('deckBar').innerHTML = bar;
    C.SYMBOLS.forEach((k) => {
      const r = deckRows[k], src = icon(k);
      if (r.img.getAttribute('src') !== src) r.img.src = src;
      r.li.classList.toggle('on', k === s.focus);
      const add = C.addCost(s, k), cutCost = C.removeCost(s, k);
      const base = { title: `${NAMES[k]} ×${s.deck[k]} · ${pf.format(o[k].p * 100)}%`, desc: deckDesc(k) };
      if (k === 'bill') {
        setRow(r, Object.assign(base, cutCost != null ? Object.assign({ verb: 'Убрать' }, pay(cutCost)) : { verb: 'Меньше', price: 'нельзя', done: true, progress: 1 }));
      } else if (add != null) {
        setRow(r, Object.assign(base, { verb: '+1 карта', link: cutCost != null ? `убрать за ${money(cutCost)}` : '', linkOn: open && cutCost != null && s.money >= cutCost }, pay(add)));
      } else if (SOURCE[k]) setRow(r, Object.assign(base, { verb: SOURCE[k][0], price: SOURCE[k][1], done: true, progress: 0 }));
      else setRow(r, Object.assign(base, { verb: 'Куплено', price: 'максимум', done: true, progress: 1 }));
    });
  }

  const num = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
  function descFor(sym, four) {
    const fx = [2, 3, 4].map((c) => C.effect(S, sym, c));
    const row = (f) => (four ? [f(fx[0]), f(fx[1]), f(fx[2])] : [f(fx[0]), f(fx[1])]);
    const tail = (a) => `пара ${a[0]}, тройка ${a[1]}` + (four ? `, каре ${a[2]}` : '');
    if (sym === 'work') return 'Премия в зарплатах: ' + tail(row((f) => num(f.salaries)));
    if (sym === 'study') return 'Навык: ' + tail(row((f) => '+' + f.skill));
    if (sym === 'health') return 'Здоровье: ' + tail(row((f) => '+' + f.health));
    if (sym === 'network') return 'Связи: ' + tail(row((f) => '+' + f.network));
    if (sym === 'chance') return `Пара открывает развилку, тройка даёт джекпот ${fx[1].salaries} зарплат` + (four ? `, каре ${fx[2].salaries}` : '');
    if (sym === 'coin') return 'Пассивный доход за месяцы: ' + tail(row((f) => f.months));
    if (sym === 'wild') return 'Достраивает самую большую группу, кроме Счетов. Свои события не даёт';
    return 'Зарплаты и здоровье: ' + tail(row((f) => `${num(f.salaries).replace('-', '−')} и −${Math.abs(f.health)}`));
  }
  let oddsKey = '';
  function renderOdds() {
    const key = [S.focus, S.reels4, S.up.mult, S.up.insure].concat(C.SYMBOLS.map((k) => S.deck[k]), C.LEVELED.map((k) => S.xp[k])).join(':');
    if (key === oddsKey) return;
    oddsKey = key;
    const o = C.odds(S), four = o.reels === 4;
    $('odds').innerHTML = C.SYMBOLS.map((k) => {
      const lv = C.level(S, k);
      const xp = !C.LEVELED.includes(k) ? '' : lv === 3 ? ' Уровень 3 из 3.' : ` Уровень ${lv} из 3, опыт ${S.xp[k]} из ${C.XP_LEVELS[lv]}.`;
      if (k === 'wild') return S.deck.wild ? `<li><img src="${icon(k)}" alt=""><div class="o-head">${NAMES[k]}<span>на барабане ${pf.format(o[k].p * 100)}%</span></div><div class="o-desc">${descFor(k, four)}. Его пары и тройки уже учтены в шансах других символов.</div></li>` : '';
      return `<li class="${k === S.focus ? 'on' : ''}"><img src="${icon(k)}" alt=""><div class="o-head">${NAMES[k]}${k === S.focus ? ' (в фокусе)' : ''}<span>пара ${pf.format(o[k].pair * 100)}%, тройка ${pf2.format(o[k].triple * 100)}%${four ? ', каре ' + pf2.format(o[k].quad * 100) + '%' : ''}</span></div><div class="o-desc">${descFor(k, four)}.${xp}</div></li>`;
    }).join('');
    const fxText = (fx) => [fx.salaries ? `${num(fx.salaries)} ${plural(fx.salaries, 'зарплата', 'зарплаты', 'зарплат')}` : '', fx.months ? `пассив за ${monthsTxt(fx.months)}` : '', fx.skill ? `навык +${fx.skill}` : '', fx.health ? `здоровье +${fx.health}` : '', fx.network ? `связи +${fx.network}` : ''].filter(Boolean).join(', ');
    $('sets').innerHTML = C.SETS.map((t) =>
      `<li><img src="${ICON.star}" alt=""><div class="o-head">${esc(t.name)}<span>${pf2.format(o.sets[t.id] * 100)}%</span></div><div class="o-desc"><span class="o-syms">${t.syms.map((k) => `<img src="${ICON[k]}" alt="">`).join('')}</span>${t.syms.map((k) => NAMES[k]).join(' + ')}: ${fxText(t.fx)}.</div></li>`).join('');
    $('oddsAny').textContent = `Барабанов ${o.reels}. Шанс, что спин даст хоть какое-то событие: ${pf.format(o.any * 100)}%.`
      + (S.up.mult ? ` Множитель в месяц с хорошим событием: ${C.multTable(S).map((r) => `×${r[0]} ${r[1]}%`).join(', ')}.` : '');
  }

  function renderLog() {
    const list = $('log');
    if (!M.log.length) { list.innerHTML = '<li class="empty">Пока тихо. События появятся после первых совпадений.</li>'; return; }
    list.innerHTML = M.log.map((e) =>
      `<li class="${e.tone}"><span class="when">${years(e.a)}</span><span>${esc(e.text)}</span><span class="amt">${e.delta == null ? '' : signed(e.delta)}</span></li>`
    ).join('');
  }

  const TRAIT_ICON = { scholar: 'study', social: 'network', athlete: 'health', heir: 'coin', lucky: 'chance', workaholic: 'work', frugal: 'finlit', financier: 'asset' };
  const PERK_ICON = { cash: 'coin', genes: 'asset', tough: 'health', ties: 'network', school: 'study', sale: 'finlit', star: 'star', traits: 'chance', joker: 'wild' };
  const PERK_TEXT = {
    cash: (l) => `Старт с ${money(C.PERKS.cash.vals[l])} на счету.`,
    genes: (l) => `Все доходы выше на ${l * 10}%.`,
    tough: (l) => `Здоровье тратится на ${l * 10}% медленнее.`,
    ties: (l) => `Старт с ${C.PERKS.ties.vals[l]} связями.`,
    school: (l) => `В стартовой колоде +${cardsTxt(l)} Учёбы.`,
    sale: (l) => `Все покупки дешевле на ${l * 5}%.`,
    star: () => 'Звезда «Своего месяца» заряжена с первого дня.',
    traits: (l) => `Выбор черты из ${3 + l} вариантов вместо трёх.`,
    joker: () => 'Джокер лежит в колоде с первого дня.',
  };
  const perkRows = {};
  document.querySelectorAll('#perks li').forEach((li) => {
    const id = li.dataset.kind.replace('perk-', '');
    li.querySelector('img').src = ICON[PERK_ICON[id]];
    perkRows[id] = rowOf(li);
  });
  function buyPerk(id, li) {
    const cost = C.perkCost(M.perks, id);
    if (cost == null || M.pts < cost) return;
    M.pts -= cost;
    M.perks[id] = (M.perks[id] || 0) + 1;
    sfx.buy();
    pulse(li, 'flash');
    goalsKey = '';
    render(); save();
  }
  let goalsKey = '';
  function renderGoals() {
    const s = S, P = C.normPerks(M.perks);
    const state = C.GOALS.map((g) => (M.goals.includes(g.id) ? 'done' : s.status === 'playing' && C.goalLost(s, g.id) ? 'dead' : 'open'));
    const key = [s.trait, s.life, s.status, s.wonAt, M.pts].concat(C.PERK_IDS.map((k) => P[k]), state).join(':');
    if (key === goalsKey) return;
    goalsKey = key;
    const over = s.status !== 'playing';
    /* место под кнопку занято всегда: до миллиона она выключена, после конца жизни её сменяет «Начать новую жизнь» */
    $('nextBtn').hidden = !over;
    $('retireBtn').hidden = over;
    /* кнопка появляется вместе с окном миллиона или конца жизни: сдвиг вкладки происходит под окном и игроку не виден */
    $('lifeBtns').hidden = !over && s.wonAt == null;
    $('retireBtn').disabled = false;
    $('retireBtn').textContent = 'Выйти на пенсию';
    const t = s.trait ? C.TRAITS[s.trait] : null;
    $('traitLine').hidden = !t;
    $('traitLine').innerHTML = t ? `<img src="${ICON[TRAIT_ICON[s.trait]]}" alt=""><div><b>Черта этой жизни: ${esc(t.name)}</b><span>${esc(t.note)}</span></div>` : '';
    $('ptsLine').textContent = `Наследие · опыт: ${M.pts}`;
    C.PERK_IDS.forEach((id) => {
      const lvl = P[id], max = C.PERKS[id].costs.length, cost = C.perkCost(M.perks, id);
      const title = C.PERKS[id].name, tag = (l) => (max > 1 ? `Ур. ${l} из ${max}: ` : '');
      if (cost != null) setRow(perkRows[id], { title, desc: tag(lvl + 1) + PERK_TEXT[id](lvl + 1), verb: lvl ? 'Улучшить' : 'Взять', price: `${cost} оп.`, enabled: M.pts >= cost, progress: M.pts / cost,  });
      else setRow(perkRows[id], { title, desc: tag(lvl) + PERK_TEXT[id](lvl), verb: 'Взято', price: 'максимум', done: true, progress: 1 });
    });
    const done = state.filter((x) => x === 'done').length;
    $('goalsLead').textContent = `Цели · ${done} из ${C.GOALS.length}`;
    $('goals').innerHTML = C.GOALS.map((g, i) => `<li class="${state[i]}"><i></i><span>${esc(g.name)}</span></li>`).join('');
  }

  function renderForecast() {
    const f = $('forecast');
    if (S.status !== 'playing') { f.className = 'forecast'; f.textContent = ''; return; }
    const ev = C.expected(S), left = C.monthsLeft(S);
    if (ev <= 0) {
      f.className = 'forecast late';
      f.innerHTML = '<b>Так миллион не накопить</b>: поправь здоровье.';
      return;
    }
    /* после миллиона прогноз считает до следующей ступени богатства */
    const next = S.wonAt == null ? C.GOAL : C.WEALTH.find((v) => v > S.money);
    if (next == null) { f.className = 'forecast ok'; f.innerHTML = `${signed(ev)} в месяц`; return; }
    const need = (next - S.money) / ev, name = next === C.GOAL ? 'миллион' : short(next);
    if (need <= left) {
      f.className = 'forecast ok';
      f.innerHTML = `${signed(ev)} в месяц · ${name} <b>в ${years(C.START_AGE + Math.floor((S.month + need) / C.YEAR))}</b>`;
    } else {
      f.className = 'forecast late';
      f.innerHTML = `${signed(ev)} в месяц · к 65 <b>${S.wonAt == null ? 'только ' : ''}${short(S.money + ev * left)}</b>`;
    }
  }

  function render(prev) {
    const s = S;
    tweenMoney(s.money);
    const mp = Math.max(0, Math.min(1, s.money / C.GOAL));
    const lp = Math.min(1, s.month / C.TOTAL);
    $('moneyFill').style.width = (mp * 100).toFixed(2) + '%';
    $('lifeFill').style.width = (lp * 100).toFixed(2) + '%';
    $('moneyPct').textContent = (mp > 0 && mp < 0.01 ? '<1' : Math.floor(mp * 100)) + '%';
    $('lifePct').textContent = Math.floor(lp * 100) + '%';
    $('ageText').textContent = years(C.age(s));
    $('jobText').textContent = C.JOBS[s.job].name;
    $('goalText').textContent = s.boost > 0 ? 'доходы ×2' : s.wonAt != null ? 'миллион есть, играешь до 65' : s.life > 1 ? `жизнь ${s.life}` : 'цель $1 000 000';
    $('goalText').classList.toggle('boost', s.boost > 0);

    const hf = C.healthFactor(s);
    const sal = $('stSalary');
    sal.textContent = short(C.salary(s));
    sal.classList.toggle('cut', hf < 1);
    sal.title = hf < 1 ? 'Зарплата урезана из-за здоровья' : 'Зарплата в месяц';
    $('stPassive').textContent = short(C.passive(s));
    const nj = C.nextJob(s);
    $('stSkill').innerHTML = s.skill + (nj ? `<small>/${nj.skill}</small>` : '');
    $('stNetwork').textContent = s.network;
    const hp = Math.round(s.health);
    $('stHealth').textContent = hp;
    const hpFill = $('hpFill');
    hpFill.style.width = hp + '%';
    hpFill.className = 'hp-fill' + (hp < 25 ? ' low' : hp < 50 ? ' mid' : '');

    $('spinBtn').disabled = s.status !== 'playing';
    $('autoBtn').textContent = M.auto ? 'Авто: вкл' : 'Авто: выкл';
    $('autoBtn').setAttribute('aria-pressed', String(M.auto));
    $('speedBtn').textContent = `×${M.speed}`;
    $('speedBtn').setAttribute('aria-label', `Скорость ×${M.speed}`);
    $('soundBtn').setAttribute('aria-pressed', String(M.sound));
    $('soundBtn').setAttribute('aria-label', M.sound ? 'Звук включён' : 'Звук выключен');
    document.querySelectorAll('.focus button[data-focus]').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.focus === s.focus));
      const im = b.querySelector('img'), src = icon(b.dataset.focus);
      if (im.getAttribute('src') !== src) im.src = src;
    });
    const cb = $('chargeBtn'), ready = C.canCharge(s);
    $('chargeVal').textContent = `${s.charge}/${C.chargeMax(s)}`;
    cb.style.setProperty('--c', Math.round(s.charge / C.chargeMax(s) * 100) + '%');
    cb.disabled = !ready;
    cb.classList.toggle('ready', ready);
    cb.setAttribute('aria-label', ready ? 'Свой месяц готов: выбрать символ' : `Свой месяц: заряд ${s.charge} из ${C.chargeMax(s)}, копится в пустые месяцы`);
    cb.title = cb.getAttribute('aria-label');
    /* в конце жизни входа в магазин нет: кнопка прячется без сдвига соседей */
    $('storeBtn').style.visibility = s.status === 'playing' ? '' : 'hidden';
    $('storeBtn').disabled = s.status !== 'playing';
    document.querySelector('.slot').classList.toggle('four', s.reels4);
    document.querySelector('.slot').classList.toggle('has-mult', s.up.mult > 0);

    /* спин мог закончиться уже под открытым меню: сводка в нём не должна отставать */
    if (menuOpen) renderMenu();
    renderForecast();
    renderShop();
    renderDeck();
    renderOdds();
    renderGoals();
    renderLog();
    drawScene(prev === 'first');
  }

  const TABS = ['shop', 'deck', 'log', 'goals'];
  function showTab(name) {
    M.tab = name;
    TABS.forEach((t) => {
      $('tab-' + t).hidden = t !== name;
      $('tabBtn-' + t).setAttribute('aria-selected', String(t === name));
    });
  }

  /* ---------- Окна ---------- */
  /* Окно может открыться под пальцем или под пробелом: первые мгновения нажатия не считаются */
  const GUARD = 350;
  let openedAt = 0;
  let modalAction = null;
  let modalAlt = null, altKeeps = false;
  function openModal(o) {
    modalOpen = true;
    clearTimeout(timer);
    $('modalArt').innerHTML = (o.art || []).map((k) => `<img src="${ICON[k]}" alt="">`).join('');
    $('modalTitle').textContent = o.title;
    $('modalBody').innerHTML = o.body;
    $('modalBtn').textContent = o.btn;
    modalAction = o.action;
    modalAlt = o.altAction || null; altKeeps = !!o.altKeeps;
    $('modalAlt').hidden = !o.alt;
    $('modalAlt').textContent = o.alt || '';
    $('overlay').hidden = false;
    openedAt = Date.now();
    $('modalBox').focus();
  }
  function hideModal() { $('overlay').hidden = true; modalOpen = false; modalAction = null; modalAlt = null; }
  function closeModal(alt) {
    if (!modalOpen || adOpen || Date.now() - openedAt < GUARD) return;
    const fn = alt === true ? modalAlt : modalAction;
    if (alt === true && altKeeps) { if (fn) fn(); return; }
    hideModal();
    if (fn) fn();
  }
  const resume = () => { if (menuOpen) return; if (S.traitOptions) openTrait(); else if (S.fork) openFork(); else schedule(); };

  function showHelp() {
    const row = (icon, text) => `<li><img src="${ICON[icon]}" alt=""><span>${text}</span></li>`;
    openModal({
      art: [],
      title: 'Как играть',
      body: '<ul class="how">'
        + row('hourglass', 'Цель: накопить $1 000 000 до 65 лет. Каждый спин это месяц жизни, приходит зарплата.')
        + row('work', 'Два или три одинаковых символа дают событие: премию, навык, здоровье, связи или счета.')
        + row('study', 'Фокус над барабанами удваивает карты нужного символа. Менять его можно когда угодно.')
        + row('coin', 'На барабанах крутится твоя колода. Карты можно докупать и убирать на вкладке «Колода», а инвестиции кладут в неё Монеты.')
        + row('chance', 'Пара кубиков открывает развилку: слот ждёт, решение за тобой.')
        + row('star', 'Пустые месяцы заряжают звезду рядом с фокусом. Полная звезда даёт выбрать символ, и он выпадет тройкой.')
        + row('asset', 'Три разных символа могут собрать бонусный сет. Сеты и все шансы есть на вкладке «Колода».')
        + '</ul>',
      btn: M.seenHelp ? 'Понятно' : 'Начать',
      action: () => { M.seenHelp = true; save(); resume(); },
    });
  }

  /* Первый миллион: жизнь продолжается, выбор за игроком */
  function maybeMillion() {
    if (menuOpen || storeOpen || S.status !== 'playing' || S.wonAt == null || S.asked) return false;
    S.asked = true;
    save();
    const at = C.START_AGE + Math.floor(S.wonAt / C.YEAR);
    sfx.big();
    confetti(70, true);
    openModal({
      art: ['coin', 'coin', 'coin'],
      title: 'Первый миллион!',
      body: `<p>Тебе ${years(at)}, цель взята. За миллион в конце жизни будет 2 опыта.</p><p>Можно выйти на пенсию сейчас. А можно играть до 65: за ${short(C.WEALTH[0])}, ${short(C.WEALTH[1])} и ${short(C.WEALTH[2])} дают ещё по 1 опыта. Выйти на пенсию можно в любой момент на вкладке «Цели».</p>`,
      btn: 'Играть дальше до 65',
      action: resume,
      alt: 'Выйти на пенсию',
      altAction: retireNow,
    });
    return true;
  }
  function retireNow() {
    if (!C.retire(S)) return;
    render(); save();
    endLife();
  }

  function endLife() {
    if (menuOpen || storeOpen) return;
    clearTimeout(timer);
    forkOpen = false;
    $('forkLay').hidden = true;
    stopAd();
    chargeOpen = false; wantCharge = false;
    $('chargeLay').hidden = true;
    /* опыт и цели начисляются один раз, в момент конца жизни */
    if (!S.paid) {
      const fresh = C.goalsMet(S).filter((id) => !M.goals.includes(id));
      S.paid = { pts: C.lifePoints(S) + fresh.length, goals: fresh, record: S.wonAt != null && (M.best == null || S.wonAt < M.best), prev: M.best };
      M.pts += S.paid.pts;
      M.goals = M.goals.concat(fresh);
      if (S.paid.record) M.best = S.wonAt;
      goalsKey = '';
      render();
      save();
    }
    const paid = S.paid, won = S.wonAt != null;
    const goalsHtml = paid.goals.length
      ? `<p><b>Новые цели, +1 опыта за каждую:</b></p><ul class="goals in-modal">${paid.goals.map((id) => `<li class="done"><i></i><span>${esc(C.GOALS.find((g) => g.id === id).name)}</span></li>`).join('')}</ul>`
      : '';
    const bonus = `Опыт за эту жизнь: +${paid.pts}. Всего на счету: ${M.pts}. Потрать его на наследие: оно действует со следующей жизни.`;
    const facts = (rows) => '<dl class="facts">' + rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('') + '</dl>';
    const at = (m) => C.START_AGE + Math.floor(m / C.YEAR);
    const common = [['Должность', C.JOBS[S.job].name], ['Жильё', C.HOMES[S.home].name]].concat(S.trait ? [['Черта', C.TRAITS[S.trait].name]] : [], [['На счету', money(S.money)]]);
    const toPerks = { alt: 'Потратить опыт', altAction: () => { showTab('goals'); save(); } };
    if (won) {
      sfx.big();
      confetti(70, true);
      openModal(Object.assign({
        art: ['coin', 'coin', 'coin'],
        title: `Миллион в ${years(at(S.wonAt))}`,
        body: `<p>Жизнь закончена в ${years(C.age(S))}.</p>` + facts(common.concat([
          ['Рекорд', paid.record ? (paid.prev == null ? 'первый миллион' : 'новый, прошлый был в ' + years(at(paid.prev))) : 'в ' + years(at(M.best))],
        ])) + goalsHtml + `<p>${bonus}</p>`,
        btn: 'Начать новую жизнь',
        action: newLife,
      }, toPerks));
    } else {
      openModal(Object.assign({
        art: ['hourglass'],
        title: '65 лет. Время вышло',
        body: `<p>На счету ${money(S.money)}. До миллиона не хватило ${money(C.GOAL - S.money)}.</p>` + facts(common.slice(0, -1)) + goalsHtml + `<p>${bonus}</p>`,
        btn: 'Начать новую жизнь',
        action: newLife,
      }, toPerks));
    }
  }

  function newLife() {
    if (S.status === 'playing') return;
    S = C.newState(M.perks, S.life + 1);
    M.log = [];
    oddsKey = ''; goalsKey = '';
    clearHits();
    shownMoney = S.money;
    setMsg(`Жизнь ${S.life}. Снова 18 лет` + (S.money ? ` и ${money(S.money)} от семьи.` : ' и ноль на счету.'), null, 'plain');
    showTab('shop');
    render();
    save();
    if (S.traitOptions) openTrait(); else schedule(600);
  }

  /* ---------- Черта: одна из трёх на старте жизни ---------- */
  function openTrait() {
    if (!S.traitOptions || menuOpen || storeOpen) return;
    traitOpen = true;
    clearTimeout(timer);
    $('traitIcon').src = ICON.star;
    $('traitKind').textContent = `Жизнь ${S.life}: новая попытка`;
    $('traitOpts').innerHTML = S.traitOptions.map((id) =>
      `<button class="opt" type="button" data-trait="${id}"><img src="${ICON[TRAIT_ICON[id]]}" alt=""><b>${esc(C.TRAITS[id].name)}</b><span>${esc(C.TRAITS[id].note)}</span></button>`).join('');
    $('traitLay').hidden = false;
    openedAt = Date.now();
    $('traitBox').focus();
  }
  function chooseTrait(id) {
    if (!traitOpen || Date.now() - openedAt < GUARD) return;
    if (!C.pickTrait(S, id)) return;
    traitOpen = false;
    $('traitLay').hidden = true;
    sfx.fork();
    pushLog(`Черта этой жизни: ${C.TRAITS[id].name}`, null, 'star');
    setMsg(`Черта: ${C.TRAITS[id].name}. ${C.TRAITS[id].note}.`, null, 'plain');
    render();
    save();
    schedule(600);
  }

  /* Пока вкладка закрыта или скрыта, жизнь идёт: месяц за минуту, не больше года за раз */
  function catchUp(ms) {
    if (!M.auto || S.status !== 'playing' || S.fork || S.traitOptions) return false;
    const n = Math.min(C.YEAR, Math.floor(ms / 60000));
    if (n < 1) return false;
    const before = S.money;
    let done = 0;
    while (done < n && S.status === 'playing') { C.spin(S, Math.random, { auto: true }); done++; }
    render();
    save();
    if (S.status !== 'playing') { endLife(); return true; }
    const got = S.money - before;
    openModal(Object.assign({
      art: ['hourglass'],
      title: 'Пока тебя не было',
      body: `<p>Слот крутился сам. Прошло: ${monthsTxt(done)}.</p><p>Баланс изменился на ${signed(got)}. Тебе ${years(C.age(S))}.</p>`,
      btn: 'Продолжить',
      action: () => { if (!maybeMillion()) schedule(); },
    }, got > 0 ? {
      alt: ownsNoAds() ? `Удвоить: ещё ${signed(got)}` : `Удвоить за рекламу: ещё ${signed(got)}`,
      altKeeps: true,
      altAction: () => withAd(() => {
        S.money += got; S.earned += got;
        if (S.money > S.peak) S.peak = S.money;
        C.check(S);
        hideModal();
        pushLog('Удвоил доход за время отсутствия', got, 'good');
        floatLabel(signed(got), ''); coinFly(7);
        render(); save();
        if (!maybeMillion()) schedule(300);
      }),
    } : {}));
    return true;
  }

  /* ---------- Управление ---------- */
  $('spinBtn').addEventListener('click', manualSpin);
  $('autoBtn').addEventListener('click', () => {
    M.auto = !M.auto;
    render(); save();
    if (M.auto) schedule(); else clearTimeout(timer);
  });
  $('speedBtn').addEventListener('click', () => {
    M.speed = SPEEDS[(SPEEDS.indexOf(M.speed) + 1) % SPEEDS.length];
    render(); save();
    if (phase !== 'spinning') schedule();
  });
  $('soundBtn').addEventListener('click', () => {
    M.sound = !M.sound;
    render(); save();
    if (M.sound) sfx.good();
  });
  $('helpBtn').addEventListener('click', () => { if (!menuOpen && !storeOpen && !modalOpen && !forkOpen && !chargeOpen && !traitOpen) showHelp(); });
  document.querySelector('.focus').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-focus]');
    if (b) setFocus(b.dataset.focus);
  });
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { showTab(b.id.replace('tabBtn-', '')); save(); }
  });
  $('shop').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const li = b.closest('li');
    buy(li.dataset.kind.replace('up-', 'up:'), li);
  });
  $('deck').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const li = b.closest('li'), sym = li.dataset.kind;
    buy((b.classList.contains('max-btn') || sym === 'bill' ? 'cut:' : 'add:') + sym, li);
  });
  $('traitOpts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) chooseTrait(b.dataset.trait); });
  $('modalBtn').addEventListener('click', () => closeModal(false));
  $('modalAlt').addEventListener('click', () => closeModal(true));
  $('nextBtn').addEventListener('click', () => { if (S.status !== 'playing' && !modalOpen) newLife(); });
  $('retireBtn').addEventListener('click', () => { if (!modalOpen && !forkOpen && !adOpen) retireNow(); });
  $('perks').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && !b.disabled) buyPerk(b.closest('li').dataset.kind.replace('perk-', ''), b.closest('li'));
  });
  $('chargeBtn').addEventListener('click', askCharge);
  $('chargeLater').addEventListener('click', () => closeCharge(null));
  $('chargeOpts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) closeCharge(b.dataset.sym); });
  $('forkG').addEventListener('click', () => chooseFork('gold'));
  $('adBack').addEventListener('click', closeAd);
  $('forkA').addEventListener('click', () => chooseFork(0));
  $('forkB').addEventListener('click', () => chooseFork(1));

  function resetAll() {
    clearTimeout(timer);
    anims.slice().forEach((a) => a.cancel());
    anims = []; phase = 'idle'; pending = null; pendingCharged = null; wantCharge = false; chargeOpen = false; traitOpen = false;
    $('chargeLay').hidden = true; $('traitLay').hidden = true; stopAd(); forkOpen = false; $('forkLay').hidden = true;
    store.clear();
    const keep = { sound: M.sound, seenHelp: true, auto: M.auto, speed: M.speed, owned: M.owned, theme: M.theme };
    S = C.newState(null, 1);
    M = Object.assign(freshMeta(), keep);
    hideModal();
    oddsKey = ''; goalsKey = '';
    ['work', 'study', 'health', 'network'].forEach((sym, i) => setReel(i, sym));
    clearHits();
    shownMoney = 0; away = 0;
    setMsg('Новая игра. Тебе 18 лет и ноль на счету.', null, 'plain');
    showTab('shop');
    render(); save(); schedule(600);
  }
  /* Кнопка с подтверждением: первое нажатие спрашивает, второе в течение четырёх секунд делает */
  function twoStep(btn, idle, ask, run) {
    let armed = 0;
    btn.addEventListener('click', () => {
      if (Date.now() < armed) { armed = 0; btn.textContent = idle; run(); return; }
      armed = Date.now() + 4000;
      btn.textContent = ask;
      setTimeout(() => { if (armed && Date.now() >= armed) { armed = 0; btn.textContent = idle; } }, 4100);
    });
  }

  /* ---------- Главное меню ---------- */
  let hasSave = false;
  function renderMenu() {
    const has = hasSave || entered;
    $('menuPlay').textContent = has ? 'Продолжить' : 'Новая игра';
    $('menuNew').hidden = !has;
    $('menuSave').textContent = has
      ? `Жизнь ${S.life} · ${S.status === 'playing' ? years(C.age(S)) : 'жизнь окончена'} · ${money(S.money)}`
      : 'Сохранения пока нет: начни первую жизнь.';
    const lived = S.life - 1 + (S.status !== 'playing' ? 1 : 0);
    $('menuStats').textContent = has
      ? `Прожито жизней: ${lived}. ` + (M.best != null ? `Лучший миллион: в ${years(C.START_AGE + Math.floor(M.best / C.YEAR))}. ` : '') + `Целей: ${M.goals.length} из ${C.GOALS.length}. Опыт: ${M.pts}.`
      : '';
    $('menuSound').textContent = M.sound ? 'Звук: вкл' : 'Звук: выкл';
    $('menuSound').setAttribute('aria-pressed', String(M.sound));
    $('menuAuto').textContent = M.auto ? 'Авто: вкл' : 'Авто: выкл';
    $('menuAuto').setAttribute('aria-pressed', String(M.auto));
    $('menuSpeed').textContent = `Скорость ×${M.speed}`;
    $('menuThanks').hidden = !M.owned.includes('thanks');
  }
  function showMenu() {
    menuOpen = true;
    clearTimeout(timer);
    renderMenu();
    $('menuLay').hidden = false;
    $('menuBox').focus();
  }
  function openMenu() {
    if (menuOpen || storeOpen || modalOpen || forkOpen || chargeOpen || traitOpen || adOpen) return;
    if (phase === 'spinning') anims.slice().forEach((a) => a.finish());
    save();
    showMenu();
  }
  /* Вход в игру из меню: продолжает ровно с того места, где жизнь остановилась */
  function enterGame() {
    if (modalOpen) return;
    menuOpen = false; entered = true;
    $('menuLay').hidden = true;
    pulse(document.querySelector('.app'), 'enter');
    const gone = away;
    away = 0;
    save();
    if (S.status !== 'playing') endLife();
    else if (!M.seenHelp) showHelp();
    else if (S.traitOptions) openTrait();
    else if (maybeMillion()) { /* окно первого миллиона */ }
    else if (S.fork) openFork();
    else if (!catchUp(gone)) schedule(600);
  }
  $('menuCoins').innerHTML = `<img src="${ICON.coin}" alt="">`.repeat(3);
  $('menuBtn').addEventListener('click', openMenu);
  $('menuPlay').addEventListener('click', enterGame);
  twoStep($('menuNew'), 'Новая игра', 'Стереть всё и начать заново? Нажми ещё раз', () => { if (modalOpen) return; resetAll(); enterGame(); });
  $('menuHelp').addEventListener('click', () => { if (!modalOpen) showHelp(); });
  $('menuSound').addEventListener('click', () => { $('soundBtn').click(); renderMenu(); });
  $('menuAuto').addEventListener('click', () => { $('autoBtn').click(); renderMenu(); });
  $('menuSpeed').addEventListener('click', () => { $('speedBtn').click(); renderMenu(); });

  /* ---------- Оплата: тонкий переходник к площадке ----------
     Контракт (его же описывает docs/DESIGN.md, раздел «Магазин»):
     Pay.price(id)  → строка цены для показа на кнопке («тест» в заглушке, «149 ₽» у площадки).
     Pay.buy(id)    → Promise<'bought' | 'cancelled' | 'error'>. Записывает купленное игра, не переходник.
     Pay.restore()  → Promise<string[]>: id разовых товаров, купленных на этом аккаунте; ошибка связи — reject.
     Настоящая оплата (Telegram, App Store, Google Play) меняет только внутренности этого объекта.
     Сейчас внутри заглушка: окно «Тестовая покупка. Деньги не списываются».
     Для тестов: window.z2m.pay = 'bought' | 'cancelled' | 'error' отвечает сразу без окна,
     window.z2m.payRestore = [id, …] — что «вернёт» восстановление. */
  let payOpen = false;
  const Pay = (() => {
    let done = null;
    function finish(r) {
      if (!done) return;
      const fn = done;
      done = null; payOpen = false;
      $('payLay').hidden = true;
      $('storeBox').focus();
      fn(r);
    }
    $('payOk').addEventListener('click', () => finish('bought'));
    $('payCancel').addEventListener('click', () => finish('cancelled'));
    return {
      price: () => 'тест',
      buy(id) {
        const auto = window.z2m && window.z2m.pay;
        if (auto) return Promise.resolve(auto);
        if (done || !C.STORE[id]) return Promise.resolve('error');
        return new Promise((res) => {
          done = res; payOpen = true;
          $('payTitle').textContent = C.STORE[id].name;
          $('payText').textContent = C.STORE[id].note + '.';
          $('payPrice').textContent = Pay.price(id);
          $('payLay').hidden = false;
          $('payBox').focus();
        });
      },
      restore() {
        const list = window.z2m && Array.isArray(window.z2m.payRestore) ? window.z2m.payRestore.slice() : [];
        return Promise.resolve(list);
      },
    };
  })();

  /* ---------- Магазин: окно поверх игры и меню ---------- */
  function applyTheme() {
    M.theme = C.normTheme(M.theme, M.owned);
    const root = document.documentElement;
    if (M.theme === C.THEME_BASE) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', M.theme);
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', getComputedStyle(root).getPropertyValue('--blue').trim() || '#2B45D4');
  }
  let storeFrom = 'menu';
  const storeNote = (t) => { $('storeNote').textContent = t || ''; };
  function themeBtn(theme) {
    const on = M.theme === theme;
    return `<button class="btn btn-buy" type="button" data-pick="${theme}"${on ? ' disabled' : ''}><b>${on ? 'Выбрано' : 'Выбрать'}</b></button>`;
  }
  function storeRow(id, name, note, btn) {
    return `<li data-item="${id}"><div><b class="st-name">${esc(name)}</b><span class="st-note">${esc(note)}</span></div>${btn}</li>`;
  }
  function renderStore() {
    $('storeShelves').innerHTML = C.STORE_SHELVES.map((sh) => {
      const rows = C.STORE_IDS.filter((id) => C.STORE[id].shelf === sh.id).map((id) => {
        const it = C.STORE[id], has = M.owned.includes(id);
        const btn = has && it.theme ? themeBtn(it.theme)
          : has ? '<button class="btn btn-buy" type="button" disabled><b>Куплено</b></button>'
            : `<button class="btn btn-buy" type="button" data-buy="${id}"><b>Купить</b><span>${esc(Pay.price(id))}</span></button>`;
        return storeRow(id, it.name, it.note, btn);
      });
      if (sh.id === 'look') rows.unshift(storeRow('theme-base', 'Стандартная тема', 'Синяя, как с самого начала. Доступна всегда', themeBtn(C.THEME_BASE)));
      return `<section class="store-shelf"><h3>${esc(sh.name)}</h3><ul>${rows.join('')}</ul></section>`;
    }).join('');
  }
  function openStore() {
    if (storeOpen || modalOpen || forkOpen || chargeOpen || traitOpen || adOpen) return;
    if (!menuOpen && S.status !== 'playing') return;
    storeFrom = menuOpen ? 'menu' : 'game';
    clearTimeout(timer);
    if (phase === 'spinning') anims.slice().forEach((a) => a.finish());
    storeOpen = true;
    storeNote('');
    renderStore();
    $('storeLay').hidden = false;
    $('storeBox').focus();
  }
  function closeStore() {
    if (!storeOpen || payOpen) return;
    storeOpen = false;
    $('storeLay').hidden = true;
    save();
    if (storeFrom === 'menu') { renderMenu(); $('menuBox').focus(); return; }
    if (S.status !== 'playing') { endLife(); return; }
    if (maybeMillion()) return;
    const gone = away;
    away = 0;
    if (S.traitOptions) openTrait(); else if (S.fork) openFork(); else if (!catchUp(gone)) schedule(300);
  }
  function storeBuy(id) {
    if (payOpen || !C.STORE[id] || M.owned.includes(id)) return;
    storeNote('');
    Pay.buy(id).then((res) => {
      if (res === 'bought') {
        M.owned = C.normOwned(M.owned.concat(id));
        storeNote(`Куплено: ${C.STORE[id].name}`);
        render(); save();
      } else if (res === 'error') storeNote('Покупка не прошла. Деньги не списаны');
      if (storeOpen) renderStore();
    }, () => { storeNote('Покупка не прошла. Деньги не списаны'); });
  }
  function storePick(theme) {
    if (!C.ownsTheme(M.owned, theme)) return;
    M.theme = theme;
    applyTheme();
    save();
    renderStore();
  }
  function storeRestore() {
    if (payOpen) return;
    Pay.restore().then((list) => {
      const add = C.normOwned(list).filter((id) => C.STORE[id].once && !M.owned.includes(id));
      M.owned = C.normOwned(M.owned.concat(add));
      storeNote(add.length ? `Восстановлено: ${add.map((id) => C.STORE[id].name).join(', ')}` : 'Новых покупок не найдено');
      render(); save();
      if (storeOpen) renderStore();
    }, () => { storeNote('Не удалось связаться с магазином. Попробуй позже'); });
  }
  $('storeBtn').addEventListener('click', openStore);
  $('menuStore').addEventListener('click', () => { if (!modalOpen) openStore(); });
  $('storeClose').addEventListener('click', closeStore);
  $('storeLay').addEventListener('click', (e) => { if (e.target === $('storeLay')) closeStore(); });
  $('storeRestore').addEventListener('click', storeRestore);
  $('storeShelves').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.buy) storeBuy(b.dataset.buy); else if (b.dataset.pick) storePick(b.dataset.pick);
  });

  /* ---------- Загрузка: ждём шрифты и картинки, полоска показывает настоящую долю готового ---------- */
  function boot() {
    const t0 = Date.now(), fill = $('bootFill');
    const srcs = Array.from(new Set(Object.values(ICON).concat(...Object.values(ICONL))));
    const total = srcs.length + 1;
    let ready = 0, shown = false;
    const tick = () => { ready += 1; fill.style.width = Math.round(ready / total * 100) + '%'; };
    const finish = () => {
      if (shown) return;
      shown = true;
      $('boot').hidden = true;
      showMenu();
    };
    const jobs = srcs.map((src) => {
      const im = new Image();
      im.src = src;
      const loaded = im.decode ? im.decode() : new Promise((res) => { im.onload = im.onerror = res; });
      return Promise.resolve(loaded).catch(() => {}).then(tick);
    });
    jobs.push(Promise.resolve(document.fonts && document.fonts.ready).catch(() => {}).then(tick));
    /* экран не мелькает: держим его не меньше полусекунды; если что-то зависло, через четыре секунды пускаем в игру */
    Promise.all(jobs).then(() => setTimeout(finish, Math.max(0, 500 - (Date.now() - t0))));
    setTimeout(finish, 4000);
  }

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    const tag = e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A') return;
    e.preventDefault();
    manualSpin();
  });

  let hiddenAt = null;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      clearTimeout(timer);
      anims.slice().forEach((a) => a.finish());
      save();
    } else {
      const gone = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = null;
      if (menuOpen || storeOpen) { if (entered) away += gone; }
      else if (!modalOpen && !forkOpen && !chargeOpen && !traitOpen && !catchUp(gone)) schedule();
    }
  });
  window.addEventListener('pagehide', save);

  /* ---------- Запуск ---------- */
  const saved = store.get();
  let returning = false;
  if (saved && saved.M && typeof saved.M === 'object') {
    M = Object.assign(freshMeta(), saved.M);
    if (!SPEEDS.includes(M.speed)) M.speed = 1;
    if (!Array.isArray(M.log)) M.log = [];
    if (!TABS.includes(M.tab)) M.tab = 'shop';
    if (!Array.isArray(M.goals)) M.goals = [];
    if (typeof M.pts !== 'number' || !isFinite(M.pts) || M.pts < 0) M.pts = 0;
    M.pts = Math.floor(M.pts);
    if (typeof M.best !== 'number' || !isFinite(M.best) || M.best < 0) M.best = null;
    M.log = M.log.filter((e) => e && typeof e.text === 'string' && typeof e.a === 'number' && isFinite(e.a) && (e.delta == null || (typeof e.delta === 'number' && isFinite(e.delta)))).slice(0, 40);
    M.goals = Array.from(new Set(M.goals.filter((id) => C.GOALS.some((g) => g.id === id))));
    M.sound = M.sound === true; M.auto = M.auto !== false; M.seenHelp = M.seenHelp === true;
    M.perks = C.normPerks(M.perks);
    M.owned = C.normOwned(M.owned);
    M.theme = C.normTheme(M.theme, M.owned);
  }
  applyTheme();
  /* опыт из прошлых версий был процентом к доходу: теперь это очки, которые можно потратить */
  const oldPts = saved && saved.S && saved.S.v < 6 && typeof saved.S.legacy === 'number' && isFinite(saved.S.legacy) ? Math.max(0, Math.round(saved.S.legacy)) : 0;
  if (saved && validState(C.migrate(saved.S))) {
    S = saved.S;
    M.pts += oldPts;
    away = saved.t ? Date.now() - saved.t : 0;
    bootT = saved.t || Date.now();
    returning = true;
  } else M.log = [];
  shown.forEach((sym, i) => setReel(i, sym));
  shownMoney = S.money;
  showTab(M.tab);
  setMsg(returning ? `С возвращением. Тебе ${years(C.age(S))}.` : 'Слот крутит месяцы твоей жизни.', null, 'plain');
  render('first');
  $('money').textContent = money(S.money);
  hasSave = returning;
  boot();

  /* Для тестов прототипа из консоли: z2m.skip(120) проматывает десять лет без покупок и развилок */
  window.z2m = {
    adMs: null,
    pay: null,
    payRestore: null,
    state: () => S,
    refresh: () => { render(); save(); },
    skip(n) {
      for (let i = 0; i < n && S.status === 'playing'; i++) C.spin(S, Math.random, { auto: true });
      render(); save();
      if (S.status !== 'playing') endLife(); else maybeMillion();
    },
  };
})();
