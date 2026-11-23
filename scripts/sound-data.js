/* Дубли звуков для сборки: tools/sfx.json (что выбрано, громкость) + assets/sounds (mp3 и замеры из tools/sfx.js).
   game — выбранные дубли, их вклеивает в игру build.js; events — все варианты для страницы прослушивания.
   g — усиление дубля: громкость самых громких 50 мс как level события, пик не выше maxPeak (общая громкость — VOLUME в ui.js). */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'assets', 'sounds');
const fail = (msg) => { console.error('звуки: ' + msg); process.exit(1); };

const cfg = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'sfx.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'sounds.json'), 'utf8'));
const events = {}, game = {};
for (const [ev, e] of Object.entries(cfg.events)) {
  if (e.pick !== 'synth' && !(e.pick >= 1 && e.pick <= e.variants.length)) fail(`${ev}: pick ${e.pick} — нужно 1…${e.variants.length} или "synth" (tools/sfx.json)`);
  events[ev] = {
    pick: e.pick,
    variants: e.variants.map((v, i) => {
      const n = `${ev}-${i + 1}`, m = meta[n], file = path.join(dir, n + '.mp3');
      if (!m || !fs.existsSync(file)) fail(`нет ${n}.mp3 или его замера в assets/sounds: запусти npm run sfx`);
      if (m.sound !== v.sound) fail(`${n}.mp3 сделан из ${m.sound}, а в sfx.json ${v.sound}: запусти npm run sfx`);
      const g = Math.min(e.level / m.loud, cfg.maxPeak / m.peak);
      return { n, sound: v.sound, want: v.want, d: fs.readFileSync(file).toString('base64'), g: +g.toFixed(4), peak: +(m.peak * g).toFixed(4), dur: m.dur, bytes: m.bytes };
    }),
  };
  if (e.pick !== 'synth') { const v = events[ev].variants[e.pick - 1]; game[ev] = { d: v.d, g: v.g }; }
}
module.exports = { events, game, blind: cfg.blind || '' };
