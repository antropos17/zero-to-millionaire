/* Снимки после чистки: покупки, колода, цели, меню на телефоне и десктопе */
const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(process.argv[2]);
const out = process.argv[3];
(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h, scale] of [['d', 1280, 900, 1], ['m', 390, 844, 2]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
    const p = await ctx.newPage();
    await p.goto(file);
    await p.click('#menuPlay'); await p.waitForTimeout(500); await p.click('#modalBtn'); await p.click('#autoBtn');
    await p.evaluate(() => { const s = window.z2m.state(); Object.assign(s, { money: 23400, month: 150, job: 4, skill: 120, health: 71, network: 6, home: 2, assets: 3, ms: 3, focus: 'study', trait: 'scholar', life: 2 }); s.deck = { work: 10, study: 6, health: 3, network: 2, chance: 5, coin: 3, bill: 3, wild: 0 }; s.up.mult = 1; window.z2m.refresh(); });
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}/${name}9-shop.png` });
    await p.click('#tabBtn-deck'); await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/${name}9-deck.png` });
    await p.click('#tabBtn-goals'); await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/${name}9-goals.png` });
    const m = await p.evaluate(() => ({ page: document.documentElement.scrollHeight - innerHeight, desk: Math.round(document.querySelector('.desk').getBoundingClientRect().height) }));
    console.log(name, JSON.stringify(m));
    await ctx.close();
  }
  await browser.close();
})();
