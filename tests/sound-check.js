/* Проверка звука. Страница прослушивания: каждая кнопка создаёт звук без ошибок; замер каждого выбранного дубля,
   каждого варианта и прежнего синтеза через OfflineAudioContext; время декодирования.
   Настоящая игра: досрочная остановка даёт один stop, спин с тройкой, ростом уровня и рубежом — один big,
   выключенный звук ничего не декодирует и не играет, месяц проигрыша звучит только остановками.
   Запуск: node tests/sound-check.js dist/sound-check.html [dist/zero-to-millionaire.html] */
const path = require('path');
const { chromium } = require('playwright');

const url = (f) => 'file:///' + f.split(path.sep).join('/');
let bad = 0;
const check = (name, cond, extra) => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'НЕТ '} ${name}${extra ? '  ' + extra : ''}`); };

/* Игра: sfx пишет сыгранное в window.__sfxLog ([звук, 'take' | 'synth']), если журнал заведён */
async function openGame(browser, file, errors, { reduced = false, sound = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(() => {
    window.__sfxLog = []; window.__decodes = 0; window.__sources = 0;
    const dec = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function () { window.__decodes++; return dec.apply(this, arguments); };
    for (const m of ['createOscillator', 'createBufferSource']) {
      const f = BaseAudioContext.prototype[m];
      BaseAudioContext.prototype[m] = function () { window.__sources++; return f.apply(this, arguments); };
    }
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push('игра: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('игра: ' + m.text()); });
  p.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errors.push('игра, сетевой запрос: ' + r.url()); });
  await p.goto(url(file));
  await p.waitForSelector('#menuPlay', { state: 'visible' }); await p.click('#menuPlay'); await p.waitForTimeout(500);
  await p.click('#modalBtn').catch(() => {});
  if (await p.evaluate(() => JSON.parse(localStorage.getItem('zero-to-millionaire-v2')).M.auto)) await p.click('#autoBtn');
  if (sound) await p.click('#soundBtn');
  await p.waitForTimeout(800);
  const D0 = { work: 6, study: 3, health: 3, network: 2, chance: 3, coin: 0, bill: 4, wild: 0 };
  p.fix = (patch) => p.evaluate((x) => { const s = window.z2m.state(); Object.assign(s, { deck: Object.assign({}, x.d), ms: 6, fork: null, focus: 'work' }, x.patch); window.z2m.refresh(); }, { d: D0, patch });
  p.force = (q) => p.evaluate((arr) => { const q = arr.slice(); const r = Math.random; Math.random = () => (q.length ? q.shift() : r()); }, q);
  p.heard = () => p.evaluate(() => window.__sfxLog.splice(0));
  p.close2 = () => ctx.close();
  return p;
}

(async () => {
  const file = path.resolve(process.argv[2] || 'dist/sound-check.html');
  const game = path.resolve(process.argv[3] || path.join(path.dirname(file), 'zero-to-millionaire.html'));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errors.push('сетевой запрос: ' + r.url()); });
  await page.addInitScript(() => {
    window.__src = 0;
    for (const m of ['createOscillator', 'createBufferSource']) {
      const f = BaseAudioContext.prototype[m];
      BaseAudioContext.prototype[m] = function () { window.__src++; return f.apply(this, arguments); };
    }
  });
  await page.goto(url(file));

  /* 1. Каждая кнопка страницы что-то играет */
  const buttons = await page.$$eval('button', (bs) => bs.map((b, i) => ({ i, text: b.firstChild.textContent.trim(), minute: !!b.dataset.minute })));
  let silent = [];
  for (const b of buttons) {
    const before = await page.evaluate(() => window.__src);
    await page.locator('button').nth(b.i).click();
    await page.waitForTimeout(b.minute ? 2500 : 1200);
    if (b.minute) await page.locator('button').nth(b.i).click();
    if ((await page.evaluate(() => window.__src)) - before <= 0) silent.push(b.text);
  }
  check(`страница: все ${buttons.length} кнопок играют звук`, !silent.length, silent.join(', '));

  /* 2. Замер: OfflineAudioContext, 48 кГц. peak — пик сэмпла, loud — самые громкие 50 мс (RMS), len — пока выше −60 дБ от пика */
  const M = await page.evaluate(async () => {
    const sr = 48000;
    const stats = (d) => {
      let peak = 0, s = 0, best = 0, last = 0, first = -1;
      const w = 2400;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; s += d[i] * d[i]; if (i >= w) s -= d[i - w] * d[i - w]; if (s > best) best = s; }
      for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak * 0.001) { last = i; if (first < 0) first = i; }
      return { peak: +peak.toFixed(4), loud: +Math.sqrt(best / w).toFixed(4), len: +((last - first) / sr).toFixed(3), lead: +(first / sr * 1000).toFixed(1) };
    };
    /* свой экземпляр звуков на каждый замер: в нём синтез, выбранные дубли и любой вариант */
    async function render(fn, data) {
      let ctx;
      const fake = { AudioContext: function () { ctx = new OfflineAudioContext(1, sr * 2, sr); return ctx; } };
      const S = window.soundCheck.makeSounds(fake, data || {});
      S.wake();
      const all = Object.values(data || {});
      while (all.some((t) => t.state === 'decoding')) await new Promise((r) => setTimeout(r, 5));
      fn(S);
      return stats((await ctx.startRendering()).getChannelData(0));
    }
    const copy = (v) => ({ d: v.d, g: v.g });
    const out = { synth: {}, take: {}, variants: {} };
    for (const [k] of window.soundCheck.SOUNDS) {
      out.synth[k] = await render((S) => S.SYNTH[k]());
      const e = window.soundCheck.EVENTS[k];
      out.variants[k] = [];
      for (const v of e.variants) { const d = { [k]: copy(v) }; out.variants[k].push(Object.assign(await render((S) => S.sfx[k](), d), { sound: v.sound })); }
      out.take[k] = e.pick === 'synth' ? null : out.variants[k][e.pick - 1];
    }
    const chosen = () => Object.fromEntries(Object.entries(window.soundCheck.chosen).map(([k, v]) => [k, copy(v)]));
    out.stack = await render((S) => { for (let i = 0; i < 4; i++) S.sfx.stop(); }, chosen());
    /* время декодирования всех выбранных дублей настоящим AudioContext */
    const real = window.soundCheck.makeSounds(window, chosen());
    const t0 = performance.now();
    real.wake();
    const ts = Object.values(real.takes);
    while (ts.some((t) => t.state === 'decoding')) await new Promise((r) => setTimeout(r, 2));
    out.decode = { all: +(performance.now() - t0).toFixed(1), each: Object.fromEntries(Object.entries(real.takes).map(([k, t]) => [k, +(t.ms || 0).toFixed(1)])), failed: ts.filter((t) => t.state !== 'ready').length };
    return out;
  });
  console.log('\nзвук   синтез: peak  loud    | в игре: вариант           peak    loud    len,с  тишина в начале, мс');
  for (const [k] of Object.entries(M.synth)) {
    const s = M.synth[k], t = M.take[k];
    console.log(`${k.padEnd(6)} ${String(s.peak).padEnd(7)} ${String(s.loud).padEnd(7)} | ${t ? `${t.sound.padEnd(18)} ${String(t.peak).padEnd(7)} ${String(t.loud).padEnd(7)} ${String(t.len).padEnd(6)} ${t.lead}` : 'синтез'}`);
  }
  console.log('\nвсе варианты (peak / loud / len):');
  for (const [k, vs] of Object.entries(M.variants)) console.log(`${k.padEnd(6)} ` + vs.map((v, i) => `${i + 1} ${v.sound} ${v.peak}/${v.loud}/${v.len}`).join('  ·  '));
  console.log(`\nдекодирование выбранных дублей: ${M.decode.all} мс всего; по одному ${JSON.stringify(M.decode.each)}`);
  check('все выбранные дубли декодировались', M.decode.failed === 0);

  const takes = Object.entries(M.take).filter(([, t]) => t);
  /* прежний синтез звучал без общей громкости: сравниваем с ним, а не с синтезом после VOLUME */
  const vol = await page.evaluate(() => window.soundCheck.makeSounds({}, {}).VOLUME);
  const synthMax = +(Math.max(M.synth.big.peak, M.synth.fork.peak) / vol).toFixed(4);
  const loudest = Math.max(...takes.map(([, t]) => t.peak));
  check('самый громкий дубль не громче прежних big/fork больше чем в 1,5 раза', loudest <= synthMax * 1.5, `пик ${loudest} при ${synthMax}, общая громкость ×${vol}`);
  for (const q of ['stop', 'tick']) if (M.take[q]) {
    const others = takes.filter(([k]) => k !== 'stop' && k !== 'tick');
    check(`${q} тише остальных по громкости`, others.every(([, t]) => t.loud > M.take[q].loud), `${M.take[q].loud} против ≥ ${Math.min(...others.map(([, t]) => t.loud))}`);
  }
  const allV = Object.values(M.variants).flat();
  check('все варианты страницы короче 1,1 с и звучат с начала', allV.every((v) => v.len < 1.1 && v.lead < 15), allV.filter((v) => !(v.len < 1.1 && v.lead < 15)).map((v) => v.sound).join(', '));

  const plans = await page.evaluate(() => Object.fromEntries(Object.entries(window.soundCheck.plans).map(([sp, p]) => {
    const c = {}; p.events.forEach(([, k]) => { c[k] = (c[k] || 0) + 1; });
    return [sp, { spins: p.spins, sounds: p.events.length, counts: c }];
  })));
  console.log('типичная минута (одна случайная жизнь):', JSON.stringify(plans));

  /* 3. Настоящая игра */
  const single = M.take.stop ? M.take.stop.peak : M.synth.stop.peak;
  for (const reduced of [false, true]) {
    const tag = reduced ? 'без анимаций' : 'обычно';
    const p = await openGame(browser, game, errors, { reduced });
    await p.heard();
    if (!reduced) {
      await p.fix({ money: 500 });
      await p.force([0.1, 0.5, 0.75]);
      await p.heard();
      await p.click('#spinBtn'); await p.waitForTimeout(120); await p.click('#spinBtn');
      await p.waitForTimeout(900);
      const h = await p.heard();
      const stops = h.filter(([k]) => k === 'stop');
      /* пик тех же stop, сыгранных разом */
      const peak = await page.evaluate(async (n) => {
        let ctx;
        const S = window.soundCheck.makeSounds({ AudioContext: function () { ctx = new OfflineAudioContext(1, 48000, 48000); return ctx; } }, Object.fromEntries(Object.entries(window.soundCheck.chosen).map(([k, v]) => [k, { d: v.d, g: v.g }])));
        S.wake();
        while (Object.values(S.takes).some((t) => t.state === 'decoding')) await new Promise((r) => setTimeout(r, 5));
        for (let i = 0; i < n; i++) S.sfx.stop();
        const d = (await ctx.startRendering()).getChannelData(0); let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v)); return +pk.toFixed(4);
      }, stops.length);
      check(`игра: досрочная остановка (${tag}) — один stop, пик как у одиночного`, stops.length === 1 && peak <= single * 1.05, `stop ${stops.length}, пик ${peak} при одиночном ${single}`);
      check('игра: stop и результат играют дублями earshot', h.length > 0 && h.every(([, how]) => how === 'take'), JSON.stringify(h));
      await p.waitForTimeout(1500);
    }
    await p.fix({ money: 990, ms: 0, xp: Object.assign({}, await p.evaluate(() => window.z2m.state().xp), { work: 24 }) });
    await p.force([0.1, 0.1, 0.1]);
    await p.heard();
    await p.click('#spinBtn');
    await p.waitForTimeout(3000);
    const h = await p.heard();
    const s = await p.evaluate(() => { const s = window.z2m.state(); return { ms: s.ms, lvl: Core.level(s, 'work') }; });
    check(`игра: тройка + рост уровня + рубеж (${tag}) — один big`, h.filter(([k]) => k === 'big').length === 1 && s.ms === 1 && s.lvl === 2, JSON.stringify({ heard: h.map(([k]) => k), ...s }));
    await p.close2();
  }

  /* звук выключен: ничего не декодируется и не играет */
  {
    const p = await openGame(browser, game, errors, { sound: false });
    await p.fix({ money: 990, ms: 0 });
    await p.force([0.1, 0.1, 0.1]);
    await p.click('#spinBtn'); await p.waitForTimeout(2500);
    const r = await p.evaluate(() => ({ decodes: window.__decodes, sources: window.__sources, log: window.__sfxLog.length }));
    check('игра: звук выключен — ни декодирования, ни звуков', r.decodes === 0 && r.sources === 0 && r.log === 0, JSON.stringify(r));
    await p.close2();
  }

  /* последний месяц жизни без миллиона: тройка, рост уровня и рубеж — только остановки барабанов */
  {
    const p = await openGame(browser, game, errors);
    await p.fix({ money: 990, ms: 0, month: 47 * 12 - 1, xp: Object.assign({}, await p.evaluate(() => window.z2m.state().xp), { work: 24 }) });
    await p.force([0.1, 0.1, 0.1]);
    await p.heard();
    await p.click('#spinBtn'); await p.waitForTimeout(3000);
    const h = await p.heard();
    const st = await p.evaluate(() => ({ status: window.z2m.state().status, won: window.z2m.state().wonAt }));
    check('игра: месяц проигрыша звучит только остановками', st.status !== 'playing' && st.won == null && h.length > 0 && h.every(([k]) => k === 'stop'), JSON.stringify({ heard: h.map(([k]) => k), ...st }));
    await p.close2();
  }

  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок в консоли нет, сетевых запросов нет');
  await browser.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
