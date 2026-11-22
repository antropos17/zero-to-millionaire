/* Каждая развилка открывается в окне на маленьком телефоне: помещается, оба варианта работают. */
const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(process.argv[2]);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(file);
  await p.click('#menuPlay'); await p.waitForTimeout(500); await p.click('#modalBtn'); await p.click('#autoBtn');
  const ids = await p.evaluate(() => Core.FORK_IDS);
  let bad = 0, longest = 0;
  for (const id of ids) for (const idx of [0, 1, 'g']) {
    await p.evaluate((x) => { const s = window.z2m.state(); Object.assign(s, { fork: x, money: 400000, job: 5, skill: 100, home: 2, health: 60, network: 8, month: 12 * 12, ms: 3, status: 'playing' }); s.deck = { work: 11, study: 5, health: 3, network: 2, chance: 6, coin: 2, bill: 4, wild: 0 }; s.lastForks = []; }, id);
    await p.reload(); await p.click('#menuPlay'); await p.waitForTimeout(250);
    const m = await p.evaluate(() => { const b = document.getElementById('forkBox').getBoundingClientRect(); return { vis: !document.getElementById('forkLay').hidden, top: Math.round(b.top), bottom: Math.round(b.bottom), over: document.getElementById('forkBox').scrollHeight - document.getElementById('forkBox').clientHeight, wide: document.documentElement.scrollWidth - innerWidth, text: document.getElementById('forkBox').innerText }; });
    longest = Math.max(longest, m.bottom - m.top);
    if (!m.vis || m.top < 0 || m.bottom > 640 || m.over > 1 || m.wide > 0 || /undefined|NaN|null/.test(m.text)) { bad++; console.log('ПЛОХО', id, JSON.stringify(m).slice(0, 300)); }
    const bid = idx === 'g' ? 'forkG' : idx ? 'forkB' : 'forkA';
    const dis = await p.evaluate((i) => { const b = document.getElementById(i); return b.disabled || b.hidden; }, bid);
    if (dis) { console.log('вариант недоступен', id, idx); continue; }
    await p.evaluate(() => { window.z2m.adMs = 60; });
    await p.click('#' + bid);
    if (idx === 'g') await p.waitForTimeout(220);
    const after = await p.evaluate(() => { const s = window.z2m.state(); return { fork: s.fork, ok: isFinite(s.money) && isFinite(s.health) && Core.SYMBOLS.every((k) => s.deck[k] >= Core.MIN_CARDS[k]), msg: document.getElementById('msg').innerText, status: s.status }; });
    if (after.fork !== null || !after.ok || /undefined|NaN/.test(after.msg)) { bad++; console.log('ПЛОХОЙ ИТОГ', id, idx, JSON.stringify(after)); }
    if (idx === 'g' && process.argv.includes('--print')) console.log(id.padEnd(12), after.msg.replace(/\n/g, ' | '));
  }
  console.log(`развилок ${ids.length}, проблем ${bad}, самое высокое окно ${longest}px, ошибок в консоли ${errors.length}`, errors.slice(0, 3));
  await browser.close();
})();
