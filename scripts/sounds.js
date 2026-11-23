/* Собирает dist/sound-check.html: страницу, где каждый звук игры и каждый вариант earshot играет одним нажатием.
   Звуки не переписаны: блок «Звук» (дубли, синтез, sfx) вырезается из src/ui.js как есть, поэтому после
   пересборки страница звучит так же, как игра. Варианты берутся из tools/sfx.json и assets/sounds (scripts/sound-data.js):
   в игру попадает только выбранный, на страницу — все три. Логика «типичной минуты» берёт настоящий Core. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const fail = (msg) => { console.error('sound-check: ' + msg); process.exit(1); };
const data = require('./sound-data.js');

const ui = read('ui.js');
const m = ui.match(/\/\* -{10} Звук[^\n]*\n([\s\S]*?)\n\s*\/\* -{10} Барабаны/);
if (!m) fail('не найден блок «Звук» … «Барабаны» в src/ui.js');
const block = m[1];
if (!/const sfx = \{/.test(block) || !/const SYNTH = \{/.test(block) || !/function tone\(/.test(block)) fail('в блоке «Звук» нет tone, SYNTH или sfx');

/* Тайминги автоспина живут в ui.js; страница копирует их и проверяет, что в игре они прежние */
const TIMING = ['const SPEEDS = [1, 2, 4];', 'const spinMs = () => 1000 / M.speed;', 'const holdMs = () => 800 / M.speed;', 'duration: dur * (0.62 + i * 0.38 / (n - 1))'];
for (const t of TIMING) if (!ui.includes(t)) fail('в src/ui.js поменялся тайминг, обнови typicalMinute в scripts/sounds.js: ' + t);

/* Подписи к кнопкам. Ключи обязаны совпадать с sfx в ui.js и с событиями в tools/sfx.json */
const SOUNDS = [
  ['stop', 'Остановка барабана', 'Каждый барабан, встав на место. За спин 3 или 4 раза подряд; досрочная остановка — один раз'],
  ['good', 'Хороший месяц', 'Пара или тройка хорошего символа; хороший выбор в развилке; включение звука'],
  ['big', 'Большая удача', 'Тройка хорошего символа, рубеж капитала, рост уровня символа, «Удачный год», первый миллион, конец жизни с миллионом. Не чаще раза в секунду'],
  ['bad', 'Плохой месяц', 'Выпали счета (и они перевесили хорошее); плохой выбор в развилке'],
  ['buy', 'Покупка', 'Любая покупка в магазине и колоде; покупка наследия'],
  ['fork', 'Развилка и выбор', 'Выпала развилка (кубики); потрачена звезда «Свой месяц»; выбрана черта жизни'],
  ['tick', 'Щелчок', 'Звезда зарядилась; смена фокуса над барабанами'],
];
const sfxBody = block.slice(block.indexOf('const sfx = {'));
const keys = [...sfxBody.matchAll(/^\s{4}(\w+): \(\) =>/gm)].map((x) => x[1]);
const described = SOUNDS.map((s) => s[0]);
const diff = (a, b) => a.filter((k) => !b.includes(k));
if (diff(keys, described).length || diff(described, keys).length) fail(`звуки в sfx (${keys.join(', ')}) не совпадают с подписями (${described.join(', ')})`);
if (diff(keys, Object.keys(data.events)).length || diff(Object.keys(data.events), keys).length) fail(`звуки в sfx (${keys.join(', ')}) не совпадают с tools/sfx.json (${Object.keys(data.events).join(', ')})`);

const noExport = (code) => code.replace(/if \(typeof module[^\n]+\n?/, '');
const core = noExport(read('core.js'));

/* Звуки как функция окна: на странице это настоящий AudioContext, в замере — OfflineAudioContext.
   SOUND_DATA — выбранные дубли; decode и take открыты, чтобы страница играла и невыбранные варианты */
const makeSounds = `function makeSounds(window, SOUND_DATA) {\n  const M = { sound: true };\n${block}\n  return { sfx, SYNTH, takes, wake, decode, take, VOLUME };\n}`;

/* Расписание звуков автоспина: повторяет finishSpin / showResult / applyFork из ui.js.
   Игрок на развилке думает 1,5 с и берёт первый вариант; звезду и рекламу не трогает.
   big, как в игре, не чаще раза в секунду (sfx.big) — одно расписание для дублей и для синтеза */
function typicalMinute(Core, speed, ms, rng) {
  const C = Core, S = C.newState({}, 1, rng), out = [];
  if (S.traitOptions) C.pickTrait(S, S.traitOptions[0]);
  const spin = 1000 / speed, hold = 800 / speed;
  const at = (t, k) => { if (t < ms) out.push([Math.round(t), k]); };
  const milestone = (t, v) => { if (v) at(t + 750, 'big'); };
  let t = 0, spins = 0;
  while (t < ms && S.status === 'playing') {
    const reels = C.rollReels(S, rng), n = reels.length;
    for (let i = 0; i < n; i++) at(t + spin * (0.62 + i * 0.38 / (n - 1)), 'stop');
    const end = t + spin;
    const res = C.resolve(S, reels, rng);
    spins++;
    if (res.chargeFull) at(end, 'tick');
    if (res.combos.length) {
      const good = res.combos.filter((p) => p.tone === 'good'), bad = res.combos.filter((p) => p.tone === 'bad');
      const big = res.combos.some((p) => p.tone === 'good' && p.count >= 3);
      if (bad.length && (!good.length || res.event < 0)) at(end, 'bad');
      else if (good.length) at(end, big ? 'big' : 'good');
      else if (res.tone === 'fork') at(end, 'fork');
      res.levelUps.forEach(() => at(end + 650, 'big'));
    }
    milestone(end, res.milestone);
    if (S.status !== 'playing') break;
    if (res.million) { at(end + 500, 'big'); t = end + 500 + 2000 + hold; S.asked = true; continue; }
    if (S.fork) {
      const pick = end + 450 + 1500, r = C.choose(S, 'a', rng);
      if (r && r.tone === 'good') at(pick, 'good'); else if (r && r.tone === 'bad') at(pick, 'bad');
      if (r) milestone(pick, r.milestone);
      t = pick + hold + 300;
      continue;
    }
    t = end + hold;
  }
  out.sort((a, b) => a[0] - b[0]);
  let lastBig = -1e9;
  const events = out.filter(([t, k]) => { if (k !== 'big') return true; if (t - lastBig < 1000) return false; lastBig = t; return true; });
  return { events, spins };
}

/* Для страницы: варианты без лишнего, выбранный отмечен */
const EVENTS = Object.fromEntries(Object.entries(data.events).map(([ev, e]) => [ev, {
  pick: e.pick,
  variants: e.variants.map((v) => ({ n: v.n, sound: v.sound, want: v.want, d: v.d, g: v.g, peak: v.peak, dur: v.dur, kb: +(v.bytes / 1024).toFixed(1) })),
}]));

const page = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zero to Millionaire — звуки</title>
<style>
:root{--bg:#f6f3ec;--fg:#1d1b16;--muted:#6b665a;--card:#fff;--line:#ddd6c6;--acc:#1f6f50;--pick:#b7791f}
@media (prefers-color-scheme:dark){:root{--bg:#16150f;--fg:#efe9da;--muted:#a59f90;--card:#211f18;--line:#3a3628;--acc:#5cc59a;--pick:#e3b04b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;padding:24px 16px 48px}
main{max-width:820px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}
p{margin:6px 0}.muted{color:var(--muted)}
ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}
li{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px}
li b{display:block}li small{color:var(--muted);display:block}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.pair{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.pair div{flex:1;min-width:200px}
button{font:inherit;font-weight:600;border:1px solid var(--acc);color:var(--acc);background:transparent;border-radius:6px;padding:8px 12px;cursor:pointer;min-width:120px;text-align:left}
button small{font-weight:400;font-size:12px}
button.pick{border-color:var(--pick);color:var(--pick);border-width:2px}
button:active,button.on{background:var(--acc);color:var(--bg)}
button.synth{border-style:dashed}
code{font-size:12px;color:var(--muted)}
pre{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;overflow-x:auto;font-size:13px}
#log{font:12px/1.4 ui-monospace,monospace;color:var(--muted);white-space:pre-wrap;min-height:1.4em;position:sticky;bottom:0;background:var(--bg);padding:6px 0}
</style></head><body><main>
<h1>Звуки Zero to Millionaire</h1>
<p class="muted">Каждая кнопка играет тот же код, что игра (блок «Звук» из <code>src/ui.js</code>, вырезанный при сборке). Громкость системы поставь как обычно для игр.
Жёлтая рамка — вариант, который сейчас в игре. Пунктир — прежний синтез, который звучал до earshot (и звучит, если дубль не загрузился).</p>
<p><b>Стартовый выбор сделан без прослушивания</b> — по описаниям earshot, длине и замерам. Выбирай ушами.</p>
<h2>По одному</h2>
<ul id="list"></ul>
<h2>Как это слышно в игре</h2>
<p class="muted">Слева — выбранные варианты, справа — тот же поток прежним синтезом. Минута: новая жизнь, автоспин, настоящие броски Core, на развилке игрок думает 1,5 с; одно расписание для обоих наборов. Повторное нажатие останавливает.</p>
<ul>
<li><div class="pair"><button type="button" data-combo="take">Спин ×1</button><button type="button" class="synth" data-combo="synth">Спин ×1 · синтез</button><div><b>Один обычный спин на ×1</b><small>3 остановки барабанов и «Хороший месяц» сразу после последней</small></div></div></li>
<li><div class="pair"><button type="button" data-minute="1" data-set="take">Минута ×1</button><button type="button" class="synth" data-minute="1" data-set="synth">Минута ×1 · синтез</button><div><b>Скорость ×1</b><small id="m1"></small></div></div></li>
<li><div class="pair"><button type="button" data-minute="4" data-set="take">Минута ×4</button><button type="button" class="synth" data-minute="4" data-set="synth">Минута ×4 · синтез</button><div><b>Скорость ×4 (самая быстрая)</b><small id="m4"></small></div></div></li>
</ul>
<h2>Как сменить выбор</h2>
<p>В <code>tools/sfx.json</code> у события поменять <code>"pick"</code> на 1, 2, 3 или <code>"synth"</code> (прежний синтез) и пересобрать. earshot для этого не нужен. Или одной командой:</p>
<pre>node tools/sfx.js pick stop 2
npm run build</pre>
<p class="muted">Громкость события — <code>"level"</code> в том же файле (громкость самых громких 50 мс), общая — <code>VOLUME</code> в блоке «Звук» <code>src/ui.js</code>. Новые варианты: поменять <code>"sound"</code> (список: <code>earshot sounds</code>) и запустить <code>npm run sfx</code>.</p>
<p id="log"></p>
</main>
<script>
${core}
${makeSounds}
const SOUNDS = ${JSON.stringify(SOUNDS)};
const EVENTS = ${JSON.stringify(EVENTS)};
${typicalMinute.toString()}
/* выбранные варианты — те же объекты, что в EVENTS: каждый дубль декодируется один раз */
const chosen = {};
for (const k in EVENTS) if (EVENTS[k].pick !== 'synth') chosen[k] = EVENTS[k].variants[EVENTS[k].pick - 1];
const S = makeSounds(window, chosen);
const log = document.getElementById('log');
function wakeAll() { S.wake(); for (const k in EVENTS) EVENTS[k].variants.forEach(S.decode); }
function variant(v, tries) {
  wakeAll();
  if (v.state === 'ready') { S.take(v); return; }
  if (v.state === 'failed') { log.textContent = 'вариант не декодировался: ' + v.n; return; }
  if ((tries || 0) < 40) setTimeout(() => variant(v, (tries || 0) + 1), 25);
}
const SET = { take: (k) => S.sfx[k](), synth: (k) => { S.wake(); S.SYNTH[k](); } };
document.getElementById('list').innerHTML = SOUNDS.map(([k, name, when]) => {
  const e = EVENTS[k];
  const vs = e.variants.map((v, i) => '<button type="button" data-ev="' + k + '" data-v="' + i + '"' + (e.pick === i + 1 ? ' class="pick"' : '') + '>Вариант ' + (i + 1) + (e.pick === i + 1 ? ' · в игре' : '') +
    '<small>' + v.sound + ' · ' + v.dur + ' с</small></button>').join('');
  const descr = e.variants.map((v, i) => (i + 1) + ': ' + v.want).join('; ');
  return '<li><b>' + name + ' <code>' + k + '</code></b><small>' + when + '</small><small>' + descr + '</small><div class="row">' +
    '<button type="button" class="synth' + (e.pick === 'synth' ? ' pick' : '') + '" data-synth="' + k + '">Синтез' + (e.pick === 'synth' ? ' · в игре' : ' · было') + '<small>прежний звук игры</small></button>' + vs + '</div></li>';
}).join('');
document.addEventListener('pointerdown', wakeAll, true);
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.synth) { SET.synth(b.dataset.synth); log.textContent = 'играет: ' + b.dataset.synth + ', синтез'; }
  if (b.dataset.ev) { const v = EVENTS[b.dataset.ev].variants[+b.dataset.v]; variant(v); log.textContent = 'играет: ' + v.n + ' (' + v.sound + ')'; }
  if (b.dataset.combo) { const p = SET[b.dataset.combo]; wakeAll(); [620, 810, 1000].forEach((t) => setTimeout(() => p('stop'), t)); setTimeout(() => p('good'), 1000); }
  if (b.dataset.minute) minute(+b.dataset.minute, b.dataset.set, b);
});
const plans = {};
for (const sp of [1, 4]) {
  plans[sp] = typicalMinute(Core, sp, 60000, Math.random);
  const c = {}; plans[sp].events.forEach(([, k]) => { c[k] = (c[k] || 0) + 1; });
  document.getElementById('m' + sp).textContent = plans[sp].spins + ' спинов, ' + plans[sp].events.length + ' звуков за минуту: ' + Object.entries(c).map(([k, v]) => k + ' ' + v).join(', ');
}
let timers = [], playing = null;
function minute(sp, set, b) {
  timers.forEach(clearTimeout); timers = [];
  document.querySelectorAll('[data-minute]').forEach((x) => x.classList.remove('on'));
  const id = sp + set;
  if (playing === id) { playing = null; log.textContent = 'остановлено'; return; }
  playing = id; b.classList.add('on'); wakeAll();
  const t0 = performance.now(), p = SET[set];
  plans[sp].events.forEach(([t, k]) => timers.push(setTimeout(() => { p(k); log.textContent = ((performance.now() - t0) / 1000).toFixed(1) + ' с: ' + k + (set === 'synth' ? ' (синтез)' : ''); }, t)));
  timers.push(setTimeout(() => { playing = null; b.classList.remove('on'); log.textContent = 'минута ×' + sp + ' закончилась'; }, 60500));
}
window.soundCheck = { makeSounds, SOUNDS, EVENTS, chosen, typicalMinute, plans };
</script></body></html>
`;
try { new vm.Script(page.match(/<script>([\s\S]*)<\/script>/)[1], { filename: 'страница' }); } catch (e) { fail('синтаксическая ошибка: ' + e.message); }
const out = path.join(root, 'dist', 'sound-check.html');
fs.writeFileSync(out, page);
console.log('собрано:', path.relative(process.cwd(), out), (Buffer.byteLength(page) / 1024).toFixed(0) + ' КБ, звуков:', keys.length, 'по', Object.values(data.events).map((e) => e.variants.length).join('/'), 'варианта');
module.exports = { typicalMinute };
