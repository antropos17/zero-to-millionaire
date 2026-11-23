/* Проверка страницы звуков: каждая кнопка создаёт звуковые узлы без ошибок, и замер громкости
   каждого звука через OfflineAudioContext. Запуск: node tests/sound-check.js dist/sound-check.html */
const path = require('path');
const { chromium } = require('playwright');

/* Звуки настоящей игры: какие sfx сыграли (по осцилляторам синтеза: stop — 220 Гц, big — первая нота 523 Гц) */
async function gameSounds(browser, file, reduced, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(() => {
    window.__osc = [];
    const st = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when) { window.__osc.push({ f: this.frequency.value, type: this.type, at: when }); return st.apply(this, arguments); };
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push('игра: ' + e.message));
  await p.goto('file:///' + file.replace(/\\/g, '/'));
  await p.waitForSelector('#menuPlay', { state: 'visible' }); await p.click('#menuPlay'); await p.waitForTimeout(500);
  await p.click('#modalBtn').catch(() => {});
  if (await p.evaluate(() => JSON.parse(localStorage.getItem('zero-to-millionaire-v2')).M.auto)) await p.click('#autoBtn');
  await p.click('#soundBtn');
  await p.waitForTimeout(800);
  const D0 = { work: 6, study: 3, health: 3, network: 2, chance: 3, coin: 0, bill: 4, wild: 0 };
  const fix = (patch) => p.evaluate((x) => { const s = window.z2m.state(); Object.assign(s, { deck: Object.assign({}, x.d), ms: 6, fork: null, focus: 'work' }, x.patch); window.z2m.refresh(); }, { d: D0, patch });
  const force = (q) => p.evaluate((arr) => { const q = arr.slice(); const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); }, q);
  const res = {};
  if (!reduced) {
    await fix({ money: 500 });
    await force([0.1, 0.5, 0.75]);
    await p.evaluate(() => { window.__osc = []; });
    await p.click('#spinBtn'); await p.waitForTimeout(120); await p.click('#spinBtn');
    await p.waitForTimeout(900);
    const stops = (await p.evaluate(() => window.__osc)).filter((x) => x.f === 220 && x.type === 'sine');
    res.rushStops = stops.length;
    res.rushPeak = await p.evaluate(async (offs) => {
      const sr = 48000, c = new OfflineAudioContext(1, sr, sr);
      for (const t of offs) { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = 220; g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.07); }
      const d = (await c.startRendering()).getChannelData(0); let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v)); return +pk.toFixed(4);
    }, stops.map((x) => x.at - stops[0].at));
    await p.waitForTimeout(1500);
  }
  await fix({ money: 990, ms: 0, xp: Object.assign({}, await p.evaluate(() => window.z2m.state().xp), { work: 24 }) });
  await force([0.1, 0.1, 0.1]);
  await p.evaluate(() => { window.__osc = []; });
  await p.click('#spinBtn');
  await p.waitForTimeout(3000);
  res.bigs = (await p.evaluate(() => window.__osc)).filter((x) => x.f === 523).length;
  const s = await p.evaluate(() => { const s = window.z2m.state(); return { ms: s.ms, lvl: Core.level(s, 'work') }; });
  if (s.ms !== 1 || s.lvl !== 2) errors.push('игра: спин не дал рубеж и рост уровня ' + JSON.stringify(s));
  await ctx.close();
  return res;
}

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

  /* Игра: досрочная остановка даёт один stop, спин с тройкой, ростом уровня и рубежом — один big */
  const game = path.resolve(process.argv[3] || path.join(path.dirname(file), 'zero-to-millionaire.html'));
  const single = rows.stop.peak;
  for (const reduced of [false, true]) {
    const g = await gameSounds(browser, game, reduced, errors);
    const tag = reduced ? 'без анимаций' : 'обычно';
    if (!reduced) {
      const okR = g.rushStops === 1 && g.rushPeak <= single * 1.05;
      if (!okR) bad++;
      console.log(`${okR ? 'ok  ' : 'НЕТ '} досрочная остановка (${tag}): stop ${g.rushStops}, пик ${g.rushPeak} при одиночном ${single}`);
    }
    const okB = g.bigs === 1;
    if (!okB) bad++;
    console.log(`${okB ? 'ok  ' : 'НЕТ '} тройка + рост уровня + рубеж (${tag}): big ${g.bigs}`);
  }
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок в консоли нет, сетевых запросов нет');
  await browser.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
