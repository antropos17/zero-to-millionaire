/* Проверка страницы звуков: каждая кнопка создаёт звуковые узлы без ошибок, и замер громкости
   каждого звука через OfflineAudioContext. Запуск: node tests/sound-check.js dist/sound-check.html */
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const file = path.resolve(process.argv[2] || 'dist/sound-check.html');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (!r.url().startsWith('file:')) errors.push('сетевой запрос: ' + r.url()); });
  await page.addInitScript(() => {
    window.__osc = 0;
    const orig = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () { window.__osc++; return orig.call(this); };
  });
  await page.goto('file:///' + file.replace(/\\/g, '/'));

  let bad = 0;
  const buttons = await page.$$eval('button', (bs) => bs.map((b, i) => ({ i, text: b.textContent, minute: !!b.dataset.minute })));
  for (const b of buttons) {
    const before = await page.evaluate(() => window.__osc);
    await page.locator('button').nth(b.i).click();
    await page.waitForTimeout(b.minute ? 2500 : 1200);
    const made = (await page.evaluate(() => window.__osc)) - before;
    if (b.minute) await page.locator('button').nth(b.i).click();
    const ok = made > 0;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'НЕТ '} ${b.text.padEnd(18)} осцилляторов: ${made}`);
  }
  const state = await page.evaluate(() => { const c = new AudioContext(); const s = c.state; c.close(); return s; });

  /* Замер: OfflineAudioContext, 48 кГц. peak — пик сэмпла, rms — по звучащей части, energy — сумма квадратов × 1000 / sr,
     len — пока сигнал выше −60 дБ от пика, jump — самый резкий скачок между соседними сэмплами (признак щелчка) */
  const rows = await page.evaluate(async () => {
    const sr = 48000;
    async function measure(fn) {
      let ctx;
      const fake = { AudioContext: function () { ctx = new OfflineAudioContext(1, sr * 2, sr); return ctx; } };
      const sfx = window.soundCheck.makeSounds(fake);
      fn(sfx);
      const d = (await ctx.startRendering()).getChannelData(0);
      let peak = 0, sum = 0, jump = 0, last = 0;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; if (i) jump = Math.max(jump, Math.abs(d[i] - d[i - 1])); }
      for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak * 0.001) last = i;
      let first = 0; while (first < d.length && Math.abs(d[first]) < 1e-6) first++;
      const len = (last - first) / sr;
      return { peak: +peak.toFixed(4), rms: +Math.sqrt(sum / Math.max(1, last - first)).toFixed(4), energy: +(sum * 1000 / sr).toFixed(3), len: +len.toFixed(3), jump: +jump.toFixed(4), firstSample: +Math.abs(d[first] || 0).toFixed(4) };
    }
    const out = {};
    for (const [k] of window.soundCheck.SOUNDS) out[k] = await measure((s) => s[k]());
    out['stop×4 разом'] = await measure((s) => { for (let i = 0; i < 4; i++) s.stop(); });
    out['stop + big'] = await measure((s) => { s.stop(); s.big(); });
    return out;
  });
  console.log('\nзвук          peak    rms     energy  len,с  jump    1-й сэмпл');
  for (const [k, r] of Object.entries(rows)) console.log(`${k.padEnd(13)} ${String(r.peak).padEnd(7)} ${String(r.rms).padEnd(7)} ${String(r.energy).padEnd(7)} ${String(r.len).padEnd(6)} ${String(r.jump).padEnd(7)} ${r.firstSample}`);

  const plans = await page.evaluate(() => Object.fromEntries(Object.entries(window.soundCheck.plans).map(([sp, p]) => {
    const c = {}; p.events.forEach(([, k]) => { c[k] = (c[k] || 0) + 1; });
    let close = 0; for (let i = 1; i < p.events.length; i++) if (p.events[i][0] - p.events[i - 1][0] < 60) close++;
    return [sp, { spins: p.spins, sounds: p.events.length, counts: c, gapsUnder60ms: close }];
  })));
  console.log('\nтипичная минута (одна случайная жизнь):', JSON.stringify(plans));
  console.log('AudioContext после нажатий:', state);
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок в консоли нет, сетевых запросов нет');
  await browser.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
