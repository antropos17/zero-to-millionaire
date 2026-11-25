/* Проходит целую жизнь по кадру на месяц с покупками и ловит любые сдвиги элементов на всём пути. */
const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(process.argv[2]);
(async () => {
  const browser = await chromium.launch();
  let grand = 0, vert = 0;
  for (const tab of (process.env.TAB ? [process.env.TAB] : ['shop', 'deck', 'goals'])) for (const [name, vp] of [['телефон 412×839', { width: 412, height: 839 }], ['телефон 360×640', { width: 360, height: 640 }], ['десктоп 1280×900', { width: 1280, height: 900 }]].filter((v) => !process.env.VP || v[0].includes(process.env.VP))) {
    const ctx = await browser.newContext({ viewport: vp });
    /* THEME=bill|dusk — купленная тема; LOOK=герой,дом,эпитафия (например street,nord,paper) — купленная косметика */
    /* COMFORT=1 — куплено «Удобство»: скорость ×8 и автопокупки всего, что есть в правилах, вместо ручных покупок */
    const COMFORT = !!process.env.COMFORT;
    /* SCENARIO=loan|late|flat — куплен сценарий старта («Новые жизни»), жизнь начинается с него */
    const SCN = process.env.SCENARIO || '';
    if (process.env.THEME || process.env.LOOK || COMFORT || SCN) await ctx.addInitScript(([t, lk, comfort, scn]) => {
      if (sessionStorage.getItem('z2m-theme')) return;
      sessionStorage.setItem('z2m-theme', '1');
      const [hero, home, epitaph] = (lk || 'base,base,base').split(',');
      const owned = [t && 'theme-' + t, hero !== 'base' && 'hero-' + hero, home !== 'base' && 'home-' + home, epitaph !== 'base' && 'epitaph-' + epitaph].filter(Boolean);
      const M = { owned, look: { theme: t || 'base', hero, home, epitaph } };
      if (comfort) Object.assign(M, { owned: owned.concat(['speed8', 'autobuy']), speed: 8, autobuy: { on: true, reserve: 3, job: true, kinds: { gym: true, home: true, asset: true, reel: true, 'up:mult': true, 'up:star': true, 'up:insure': true, 'up:coach': true } } });
      if (scn) M.owned = M.owned.concat(['sc-' + scn]);
      localStorage.setItem('zero-to-millionaire-v2', JSON.stringify({ M }));
    }, [process.env.THEME || '', process.env.LOOK || '', COMFORT, SCN]);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(file);
    await p.waitForSelector('#menuPlay', { state: 'visible' });
    /* THEME=bill|dusk: та же жизнь в купленной теме магазина (тема меняет только цвета) */
    if (process.env.THEME && (await p.evaluate(() => document.documentElement.dataset.theme)) !== process.env.THEME) console.log('   ТЕМА НЕ ПРИМЕНИЛАСЬ: ' + process.env.THEME);
    if (process.env.LOOK && (await p.evaluate(() => { const L = window.z2m.meta().look; return [L.hero, L.home, L.epitaph].join(','); })) !== process.env.LOOK) console.log('   КОСМЕТИКА НЕ ПРИМЕНИЛАСЬ: ' + process.env.LOOK);
    await p.click('#menuPlay');
    await p.waitForTimeout(500);
    await p.click('#modalBtn');
    if (SCN) {
      await p.waitForTimeout(500); await p.click(`#scOpts [data-sc="${SCN}"]`); await p.waitForTimeout(300);
      if ((await p.evaluate(() => window.z2m.state().sc)) !== SCN) console.log('   СЦЕНАРИЙ НЕ ПРИМЕНИЛСЯ: ' + SCN);
    }
    await p.evaluate(() => document.getElementById('autoBtn').click());
    await p.click('#tabBtn-' + tab);
    await p.waitForTimeout(1500);
    if (COMFORT && ((await p.textContent('#speedBtn')) !== '×8' || !(await p.evaluate(() => window.z2m.meta().autobuy.on)))) console.log('   «УДОБСТВО» НЕ ПРИМЕНИЛОСЬ');
    const out = await p.evaluate(([tab, comfort]) => new Promise((done) => {
      const shifts = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) for (const s of e.sources || []) {
          const n = s.node && (s.node.nodeType === 1 ? s.node : s.node.parentElement);
          if (!n) continue;
          let label = n.id ? '#' + n.id : n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className ? '.' + n.className.split(' ')[0] : '');
          if (!n.id && !n.className && n.parentElement) label = (n.parentElement.id ? '#' + n.parentElement.id : '.' + String(n.parentElement.className).split(' ')[0]) + ' › ' + label + ' «' + (n.textContent || '').slice(0, 14) + '»';
          const li = n.closest && n.closest('li[data-kind]');
          if (li) label = 'покупка ' + li.dataset.kind + ' › ' + label;
          shifts.push({ label, dx: Math.round(s.currentRect.x - s.previousRect.x), dy: Math.round(s.currentRect.y - s.previousRect.y), dh: Math.round(s.currentRect.height - s.previousRect.height), month: window.z2m.state().month });
        }
      }).observe({ type: 'layout-shift' });
      const SEL = { 'cut:bill': 'bill', 'add:study': 'study', 'up:mult': 'up-mult', 'up:star': 'up-star', 'up:insure': 'up-insure', 'up:coach': 'up-coach', 'add:wild': 'wild' };
      const q = (k) => document.querySelector(`li[data-kind="${SEL[k] || k}"] .btn-buy`);
      const rows = () => Array.from(document.querySelectorAll(tab === 'deck' ? '#deck li' : '#shop li')).map((li) => Math.round(li.getBoundingClientRect().height));
      const seen = new Set();
      let frames = 0;
      const step = () => {
        const S = window.z2m.state();
        seen.add(rows().join(','));
        /* открытое окно (например «Первый миллион!») игрок закрывает, а не мотает месяцы под ним; кнопка продолжает жизнь.
           Первые 350 мс окно нажатий не принимает, поэтому жмём каждый кадр, пока не закроется */
        const box = document.getElementById('modalBox');
        if (S.status === 'playing' && box.offsetParent) { document.getElementById('modalBtn').click(); requestAnimationFrame(step); return; }
        if (S.status !== 'playing' || frames++ > 700) { setTimeout(() => done({ shifts, rowSets: Array.from(seen), months: S.month, status: S.status }), 300); return; }
        if (comfort) {
          /* автопокупки за месяц; иногда выключаются и включаются в одно касание */
          window.z2m.autoStep();
          if (frames % 61 === 0) document.getElementById('autoToggle').click();
        }
        if (!comfort && !q('job').disabled) q('job').click();
        if (!comfort && S.health < 45 && !q('gym').disabled) q('gym').click();
        const opts = ['asset', 'home', 'cut:bill', 'add:study', 'reel', 'up:mult', 'up:star', 'up:insure', 'up:coach', 'add:wild'].filter((k) => k !== 'add:study' || S.bought.study < 6).map((k) => ({ b: q(k), cost: Core.costOf(S, k) })).filter((o) => o.cost != null && !o.b.disabled && S.money >= o.cost * 1.5 && S.money < 700000).sort((a, b) => a.cost - b.cost);
        if (opts.length && !comfort) opts[0].b.click();
        const f = S.health < 35 ? 'health' : (Core.nextJob(S) && Core.age(S) < 40 ? 'study' : 'work');
        if (S.focus !== f) document.querySelector(`.focus button[data-focus="${f}"]`).click();
        /* деньги иногда уходят в минус и возвращаются: так проверяются подписи долга и подсказки */
        if (frames % 97 === 0) S.money -= Core.baseSalary(S) * 3;
        /* иногда докупаем и убираем карту связей: так проверяется ссылка «убрать» */
        if (frames % 53 === 0 && !q('network').disabled) q('network').click();
        if (frames % 131 === 0) { const c = document.querySelector('li[data-kind="network"] .max-btn'); if (!c.hidden && !c.disabled) c.click(); }
        /* бонусы за рекламу без ролика: так проверяются все состояния строк раздела «Бонусы», включая лимит */
        if (frames % 29 === 0) Core.startBoost(S);
        if (frames % 37 === 0) Core.startSale(S);
        if (frames % 41 === 0) Core.chargeStar(S);
        /* звезда тратится сразу: так проверяются её состояния и уровни символов */
        if (Core.canCharge(S)) Core.spin(S, Math.random, { charged: S.focus });
        window.z2m.skip(1);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }), [tab, COMFORT]);
    const by = {};
    for (const s of out.shifts) { by[s.label] = by[s.label] || { n: 0, dy: 0, dx: 0, dh: 0 }; const b = by[s.label]; b.n++; b.dy = Math.max(b.dy, Math.abs(s.dy)); b.dx = Math.max(b.dx, Math.abs(s.dx)); b.dh = Math.max(b.dh, Math.abs(s.dh)); }
    const notJob = out.shifts.filter((s) => s.label !== '#jobText').length;
    grand += notJob;
    vert += out.shifts.filter((s) => s.label !== '#jobText' && s.dy).length;
    console.log(`\n== вкладка ${tab}, ${name}: жизнь до ${out.status} (${out.months} мес.), сдвигов всего ${out.shifts.length}, кроме смены названия должности: ${notJob}`);
    console.log('   высоты строк за всю жизнь:', out.rowSets.length === 1 ? 'одни и те же: ' + out.rowSets[0] : out.rowSets.length + ' вариантов: ' + out.rowSets.slice(0, 4).join(' | '));
    for (const [k, v] of Object.entries(by).sort((a, b) => b[1].n - a[1].n).slice(0, 8)) console.log(`   ${String(v.n).padStart(4)}×  ${k}   до ${v.dy}px по вертикали, ${v.dx}px по горизонтали, высота ±${v.dh}px`);
    /* все вертикальные сдвиги, даже разовые, которые не попали в 8 самых частых */
    for (const s of out.shifts.filter((s) => s.dy)) console.log(`   ВЕРТИКАЛЬНО: ${s.label}, вкладка ${tab}, ${name}, ${s.dy}px (месяц ${s.month})`);
    if (errors.length) console.log('   ошибки:', errors);
    await ctx.close();
  }
  await browser.close();
  console.log('\nлишних сдвигов:', grand, `(вертикальных ${vert}, горизонтальных ${grand - vert})`);
})();
