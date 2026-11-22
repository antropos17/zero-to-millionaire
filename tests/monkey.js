/* «Обезьяний» тест: случайные нажатия по всему, что видно и доступно, с перезагрузками. Ловит ошибки, мусор в тексте, тупики и застревания. */
const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(process.argv[2]);
const SECONDS = +process.argv[3] || 70;
(async () => {
  const browser = await chromium.launch();
  let total = 0;
  for (const [name, vp, extra] of [['телефон 390×844', { width: 390, height: 844 }, {}], ['десктоп 1280×900', { width: 1280, height: 900 }, {}], ['телефон 360×640, без анимаций', { width: 360, height: 640 }, { reducedMotion: 'reduce' }]].filter((v) => !process.env.VP || v[0].includes(process.env.VP))) {
    const ctx = await browser.newContext(Object.assign({ viewport: vp }, extra));
    const p = await ctx.newPage();
    const issues = {}, stats = { clicks: 0, reloads: 0, lives: 0 };
    const add = (k) => { issues[k] = (issues[k] || 0) + 1; };
    p.on('pageerror', (e) => add('ошибка страницы: ' + e.message.slice(0, 140)));
    p.on('console', (m) => { if (m.type() === 'error') add('ошибка в консоли: ' + m.text().slice(0, 140)); });
    await p.exposeFunction('report', (k) => add(k));
    await p.exposeFunction('count', (k, v) => { stats[k] = k === 'lives' ? Math.max(stats[k], v) : stats[k] + 1; });
    await ctx.addInitScript(() => {
      window.addEventListener('load', () => setTimeout(() => {
        const rnd = (n) => Math.floor(Math.random() * n);
        let lastMonth = -1, lastLife = 0, lastChange = Date.now(), orphanAt = 0, deadAt = 0;
        const shown = (id) => { const e = document.getElementById(id); return !!e && !e.hidden; };
        setInterval(() => {
          const z = window.z2m;
          if (!z) return;
          z.adMs = 250;
          const s = z.state();
          window.count('lives', s.life);
          const bad = document.body.innerText.match(/.{0,24}(undefined|NaN|\[object|Infinity|null).{0,24}/);
          if (bad) window.report('мусор в тексте: «' + bad[0].replace(/\s+/g, ' ') + '»');
          if (document.documentElement.scrollWidth > window.innerWidth + 1) window.report('горизонтальная прокрутка страницы');
          const layers = ['boot', 'menuLay', 'overlay', 'forkLay', 'adLay', 'chargeLay', 'traitLay'].filter(shown);
          if (s.month !== lastMonth || s.life !== lastLife) { lastMonth = s.month; lastLife = s.life; lastChange = Date.now(); }
          const auto = document.getElementById('autoBtn').getAttribute('aria-pressed') === 'true';
          /* отсчёт идёт только пока игра обязана крутиться сама: окно, пауза или скрытая вкладка его сбрасывают */
          const mustRun = !layers.length && auto && s.status === 'playing' && !s.fork && !s.traitOptions && !document.hidden;
          if (!mustRun) lastChange = Date.now();
          else if (Date.now() - lastChange > 7000) { window.report(`застрял: авто включено, окон нет, месяц ${s.month} не меняется`); lastChange = Date.now(); }
          /* развилка или выбор черты ждут ответа, а окна нет */
          if (!layers.length && s.status === 'playing' && (s.fork || s.traitOptions)) { if (!orphanAt) orphanAt = Date.now(); else if (Date.now() - orphanAt > 2500) { window.report('ждёт ответа без окна: ' + (s.fork ? 'развилка ' + s.fork : 'черта')); orphanAt = 0; } } else orphanAt = 0;
          /* жизнь кончилась, а начать новую негде */
          if (!layers.length && s.status !== 'playing') { const nb = document.getElementById('nextBtn'); if (!nb || nb.hidden) window.report('жизнь окончена, кнопки новой жизни нет'); }
          const hit = (b) => { const r = b.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const x = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2)); const top = document.elementFromPoint(x, y); return !!top && (top === b || b.contains(top)); };
          const btns = Array.from(document.querySelectorAll('button, summary')).filter((b) => !b.disabled && hit(b));
          if (layers.length && !layers.includes('boot') && !btns.length) { if (!deadAt) deadAt = Date.now(); else if (Date.now() - deadAt > 3000) { window.report('тупик: открыто ' + layers.join('+') + ', нажать нечего'); deadAt = 0; } } else deadAt = 0;
          const r = Math.random();
          if (r < 0.008) { window.count('reloads', 1); location.reload(); return; }
          if (!layers.length && r < 0.03) { s.money += rnd(250000); if (Math.random() < 0.3) s.skill += rnd(60); z.refresh(); return; }
          if (!layers.length && r < 0.04) { z.skip(1 + rnd(10)); return; }
          if (!layers.length && r < 0.045) { s.month = Math.max(s.month, 47 * 12 - 3); z.refresh(); return; }
          if (r < 0.07) { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); return; }
          if (!btns.length) return;
          const b = btns[rnd(btns.length)];
          if (b.id === 'menuNew' && Math.random() < 0.93) return;
          if (b.id === 'autoBtn' && auto && Math.random() < 0.8) return;
          window.count('clicks', 1);
          b.click();
        }, 80);
      }, 300));
    });
    await p.goto(file);
    await p.waitForTimeout(SECONDS * 1000);
    const end = await p.evaluate(() => { const s = window.z2m && window.z2m.state(); return s ? { life: s.life, month: s.month, status: s.status, money: Math.round(s.money) } : null; }).catch(() => null);
    const keys = Object.keys(issues);
    total += keys.length;
    console.log(`== ${name}: ${SECONDS} с, нажатий ${stats.clicks}, перезагрузок ${stats.reloads}, дошёл до жизни ${stats.lives}, конец: ${JSON.stringify(end)}`);
    console.log(keys.length ? keys.map((k) => `   ${issues[k]}×  ${k}`).join('\n') : '   проблем нет');
    await ctx.close();
  }
  await browser.close();
  console.log('видов проблем всего:', total);
})();
