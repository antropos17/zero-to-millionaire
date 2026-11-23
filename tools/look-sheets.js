/* Листы-сравнения косметики магазина для автора: сцена в разных обликах и стилях дома, окно конца жизни
   в трёх оформлениях эпитафии, окно магазина с предпросмотрами. Запуск: node tools/look-sheets.js <html> <папка> */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const file = 'file://' + path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3] || 'look-sheets');
fs.mkdirSync(out, { recursive: true });
const KEY = 'zero-to-millionaire-v2';
const ALL = ['theme-bill', 'theme-dusk', 'hero-street', 'hero-curls', 'home-terra', 'home-nord', 'epitaph-paper', 'epitaph-postcard'];
const base = { theme: 'base', hero: 'base', home: 'base', epitaph: 'base' };
const LOOKS = [['стандарт', base], ['облик «Двор»', { hero: 'street' }], ['облик «Кудри»', { hero: 'curls' }], ['дом «Терракота»', { home: 'terra' }], ['дом «Север»', { home: 'nord' }]];
/* уровень жилья, должность, возраст в месяцах от 18, здоровье: молодой здоровый, средних лет уставший, старый больной */
const SHOTS = [[0, 0, 24, 90], [2, 3, 12 * 30, 40], [4, 6, 12 * 42, 90], [5, 9, 12 * 44, 15], [1, 1, 12 * 3, 20], [3, 5, 12 * 41, 60]];

(async () => {
  const browser = await chromium.launch();
  const open = async (vp, look) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
    await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('z2m-look')) { sessionStorage.setItem('z2m-look', '1'); localStorage.setItem(k, v); } }, [KEY, JSON.stringify({ M: { owned: ALL, look: Object.assign({}, base, look), seenHelp: true } })]);
    const p = await ctx.newPage();
    await p.goto(file);
    await p.waitForSelector('#menuPlay', { state: 'visible' });
    await p.click('#menuPlay');
    await p.waitForTimeout(400);
    if (await p.locator('#modalBtn').isVisible()) await p.click('#modalBtn');
    await p.evaluate(() => { const a = document.getElementById('autoBtn'); if (a.getAttribute('aria-pressed') === 'true') a.click(); });
    return p;
  };
  const html = ['<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;margin:16px;background:#eee}table{border-collapse:collapse}td,th{padding:4px;vertical-align:top}img{width:300px;display:block;border-radius:8px}th{text-align:left}</style><h1>Сцена: облики и стили дома</h1><table><tr><th></th>'];
  SHOTS.forEach(([h, j, m, hp]) => html.push(`<th>жильё ${h}, должность ${j}, ${18 + Math.floor(m / 12)} лет, здоровье ${hp}</th>`));
  html.push('</tr>');
  for (const [name, look] of LOOKS) {
    const p = await open({ width: 412, height: 839 }, look);
    html.push(`<tr><th>${name}</th>`);
    for (const [k, [h, j, m, hp]] of SHOTS.entries()) {
      await p.evaluate(([h, j, m, hp]) => { const s = window.z2m.state(); s.home = h; s.job = j; s.month = m; s.health = hp; window.z2m.refresh(); }, [h, j, m, hp]);
      await p.waitForTimeout(700);
      const f = `scene-${LOOKS.findIndex((x) => x[0] === name)}-${k}.png`;
      await p.locator('#scene').screenshot({ path: path.join(out, f) });
      html.push(`<td><img src="${f}"></td>`);
    }
    html.push('</tr>');
    await p.context().close();
  }
  html.push('</table><h1>Окно конца жизни</h1><table><tr>');
  for (const ep of ['base', 'paper', 'postcard']) {
    const p = await open({ width: 412, height: 839 }, { epitaph: ep });
    await p.evaluate(() => window.z2m.skip(600));
    await p.waitForTimeout(1200);
    const f = `end-${ep}.png`;
    await p.locator('#modalBox').screenshot({ path: path.join(out, f) });
    html.push(`<td><b>${ep}</b><img src="${f}" style="width:360px"></td>`);
    await p.context().close();
  }
  html.push('</tr></table><h1>Магазин</h1><table><tr>');
  for (const [w, h] of [[360, 640], [412, 839], [1280, 900]]) {
    const p = await open({ width: w, height: h }, { hero: 'street', home: 'nord' });
    await p.evaluate(() => { const s = window.z2m.state(); s.home = 3; s.job = 4; s.month = 12 * 20; window.z2m.refresh(); });
    await p.click('#storeBtn');
    await p.evaluate(() => document.querySelectorAll('.store-group').forEach((d) => { d.open = true; }));
    await p.waitForTimeout(300);
    const hscroll = await p.evaluate(() => document.getElementById('storeBox').scrollWidth > document.getElementById('storeBox').clientWidth || document.documentElement.scrollWidth > innerWidth);
    html.push(`<td><b>${w}×${h}${hscroll ? ' ГОРИЗОНТАЛЬНАЯ ПРОКРУТКА' : ''}</b>`);
    for (let k = 0; k < 8; k++) {
      const f = `store-${w}x${h}-${k}.png`;
      await p.screenshot({ path: path.join(out, f) });
      html.push(`<img src="${f}" style="width:${Math.min(w, 420)}px">`);
      const more = await p.evaluate(() => { const b = document.getElementById('storeBox'); const t = b.scrollTop; b.scrollTop += b.clientHeight * 0.85; return b.scrollTop > t; });
      if (!more) break;
      await p.waitForTimeout(150);
    }
    html.push('</td>');
    await p.context().close();
  }
  html.push('</tr></table>');
  fs.writeFileSync(path.join(out, 'index.html'), html.join(''));
  await browser.close();
  console.log('листы: ' + path.join(out, 'index.html'));
})();
