/* Звуки из earshot: tools/sfx.json -> assets/sounds/<событие>-<вариант>.mp3 и assets/sounds/sounds.json.
     node tools/sfx.js               все варианты заново: earshot, обрезка, затухание, mp3, замеры
     node tools/sfx.js --reuse       без earshot: берёт wav из кэша прошлого запуска
     node tools/sfx.js pick stop 2   в игре играет вариант 2 для stop (или synth — прежний синтез), затем npm run build
   npm run build earshot не нужен: он читает готовые mp3 из assets/sounds, выбранные вклеивает в игру,
   все — в dist/sound-check.html. Нужны earshot (путь в sfx.json или EARSHOT=…) и ffmpeg с libmp3lame
   (FFMPEG=… или ffmpeg в PATH). Кэш wav: SFX_CACHE=… или временная папка системы. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const cfgPath = path.join(__dirname, 'sfx.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const outDir = path.join(root, 'assets', 'sounds');
const fail = (msg) => { console.error('sfx: ' + msg); process.exit(1); };
const RATE = 32000, BITRATE = '64k';

if (process.argv[2] === 'pick') {
  const [ev, v] = process.argv.slice(3);
  const e = cfg.events[ev];
  if (!e) fail(`нет события ${ev}; есть: ${Object.keys(cfg.events).join(', ')}`);
  const pick = v === 'synth' ? 'synth' : Number(v);
  if (pick !== 'synth' && !(pick >= 1 && pick <= e.variants.length)) fail(`вариант ${v}: нужно 1…${e.variants.length} или synth`);
  e.pick = pick;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`${ev}: ${pick === 'synth' ? 'синтез' : 'вариант ' + pick + ' (' + e.variants[pick - 1].sound + ')'}. Теперь npm run build`);
  process.exit(0);
}

const ffmpeg = process.env.FFMPEG || (() => {
  const hf = path.join(process.env.LOCALAPPDATA || '', 'Programs/HyperFrames/resources/app.asar.unpacked/vendor/ffmpeg/win32-x64/ffmpeg.exe');
  return fs.existsSync(hf) ? hf : 'ffmpeg';
})();
const cache = process.env.SFX_CACHE || path.join(os.tmpdir(), 'z2m-sfx');
const name = (ev, i) => `${ev}-${i + 1}`;

if (!process.argv.includes('--reuse')) {
  const earshot = process.env.EARSHOT || cfg.earshot;
  if (!fs.existsSync(earshot)) fail('нет earshot: ' + earshot + ' (путь в tools/sfx.json или EARSHOT=…)');
  fs.mkdirSync(cache, { recursive: true });
  const sounds = [];
  for (const [ev, e] of Object.entries(cfg.events)) e.variants.forEach((v, i) => sounds.push({ name: name(ev, i), sound: v.sound }));
  const spec = path.join(cache, 'spec.json');
  fs.writeFileSync(spec, JSON.stringify({ format: 'wav', mono: true, sounds }, null, 1));
  console.log(`earshot: ${sounds.length} звуков в ${cache} (около 2–3 минут)…`);
  execFileSync(earshot, ['make', '--spec', spec, '-o', cache, '--seed', String(cfg.seed || 1)], { stdio: 'inherit' });
}

/* mp3 -> float32: пик, громкость самых громких 50 мс, длина */
function measure(file) {
  const raw = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'], { maxBuffer: 1 << 26 });
  const d = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  let peak = 0, s = 0, best = 0;
  const w = Math.round(RATE * 0.05);
  for (let i = 0; i < d.length; i++) {
    peak = Math.max(peak, Math.abs(d[i]));
    s += d[i] * d[i]; if (i >= w) s -= d[i - w] * d[i - w];
    best = Math.max(best, s);
  }
  return { peak: +peak.toFixed(4), loud: +Math.sqrt(best / w).toFixed(4), dur: +(d.length / RATE).toFixed(3) };
}

fs.mkdirSync(outDir, { recursive: true });
const meta = {};
for (const [ev, e] of Object.entries(cfg.events)) {
  e.variants.forEach((v, i) => {
    const n = name(ev, i), wav = path.join(cache, n + '.wav'), mp3 = path.join(outDir, n + '.mp3');
    if (!fs.existsSync(wav)) fail('нет ' + wav + ' (запусти без --reuse)');
    const fade = Math.min(0.06, v.max * 0.35);
    const af = [
      'silenceremove=start_periods=1:start_threshold=-50dB',
      `atrim=end=${v.max}`,
      'afade=t=in:d=0.002',
      `afade=t=out:st=${(v.max - fade).toFixed(3)}:d=${fade.toFixed(3)}`,
    ].join(',');
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', wav, '-af', af, '-ac', '1', '-ar', String(RATE), '-c:a', 'libmp3lame', '-b:a', BITRATE, '-map_metadata', '-1', mp3]);
    meta[n] = { sound: v.sound, bytes: fs.statSync(mp3).size, ...measure(mp3) };
  });
}
fs.writeFileSync(path.join(outDir, 'sounds.json'), JSON.stringify(meta, null, 1) + '\n');
let all = 0, picked = 0;
for (const [n, m] of Object.entries(meta)) {
  const [ev, i] = n.split('-');
  const on = cfg.events[ev].pick === +i;
  all += m.bytes; if (on) picked += m.bytes;
  console.log(`${on ? '*' : ' '} ${n.padEnd(7)} ${m.sound.padEnd(18)} ${String(m.dur).padEnd(6)} с  ${(m.bytes / 1024).toFixed(1).padStart(5)} КБ  пик ${m.peak}  громкость ${m.loud}`);
}
console.log(`mp3 всего ${(all / 1024).toFixed(1)} КБ, выбранные (*) ${(picked / 1024).toFixed(1)} КБ, в base64 ~${(picked * 4 / 3 / 1024).toFixed(1)} КБ. Дальше npm run build`);
