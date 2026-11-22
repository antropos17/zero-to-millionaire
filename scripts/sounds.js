/* Собирает dist/sound-check.html: страницу, где каждый звук игры играет одним нажатием.
   Звуки не переписаны: блок «Звук» (tone и sfx) вырезается из src/ui.js как есть, поэтому после
   пересборки страница звучит так же, как игра. Логика «типичной минуты» берёт настоящий Core. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const fail = (msg) => { console.error('sound-check: ' + msg); process.exit(1); };

const ui = read('ui.js');
const m = ui.match(/\/\* -{10} Звук[^\n]*\n([\s\S]*?)\n\s*\/\* -{10} Барабаны/);
if (!m) fail('не найден блок «Звук» … «Барабаны» в src/ui.js');
const block = m[1];
if (!/const sfx = \{/.test(block) || !/function tone\(/.test(block)) fail('в блоке «Звук» нет tone или sfx');

/* Тайминги автоспина живут в ui.js; страница копирует их и проверяет, что в игре они прежние */
const TIMING = ['const SPEEDS = [1, 2, 4];', 'const spinMs = () => 1000 / M.speed;', 'const holdMs = () => 800 / M.speed;', 'duration: dur * (0.62 + i * 0.38 / (n - 1))'];
for (const t of TIMING) if (!ui.includes(t)) fail('в src/ui.js поменялся тайминг, обнови typicalMinute в scripts/sounds.js: ' + t);

/* Подписи к кнопкам. Ключи обязаны совпадать с sfx в ui.js */
const SOUNDS = [
  ['stop', 'Остановка барабана', 'Каждый барабан, встав на место. За спин 3 или 4 раза подряд'],
  ['good', 'Хороший месяц', 'Пара или тройка хорошего символа; хороший выбор в развилке; включение звука'],
  ['big', 'Большая удача', 'Тройка хорошего символа, рубеж капитала, рост уровня символа, «Удачный год», первый миллион, конец жизни с миллионом'],
  ['bad', 'Плохой месяц', 'Выпали счета (и они перевесили хорошее); плохой выбор в развилке'],
  ['buy', 'Покупка', 'Любая покупка в магазине и колоде; покупка наследия'],
  ['fork', 'Развилка и выбор', 'Выпала развилка (кубики); потрачена звезда «Свой месяц»; выбрана черта жизни'],
  ['tick', 'Щелчок', 'Звезда зарядилась; смена фокуса над барабанами'],
];
const keys = [...block.matchAll(/^\s{4}(\w+): \(\) =>/gm)].map((x) => x[1]);
const described = SOUNDS.map((s) => s[0]);
const missing = keys.filter((k) => !described.includes(k)), extra = described.filter((k) => !keys.includes(k));
if (missing.length || extra.length) fail(`звуки в sfx (${keys.join(', ')}) не совпадают с подписями (${described.join(', ')})`);

const noExport = (code) => code.replace(/if \(typeof module[^\n]+\n?/, '');
const core = noExport(read('core.js'));

/* Звуки как функция окна: на странице это настоящий AudioContext, в замере — OfflineAudioContext */
const makeSounds = `function makeSounds(window) {\n  const M = { sound: true };\n${block}\n  return sfx;\n}`;

/* Расписание звуков автоспина: повторяет finishSpin / showResult / applyFork из ui.js.
   Игрок на развилке думает 1,5 с и берёт первый вариант; звезду и рекламу не трогает. */
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
  return { events: out, spins };
}

const page = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zero to Millionaire — звуки</title>
<style>
:root{--bg:#f6f3ec;--fg:#1d1b16;--muted:#6b665a;--card:#fff;--line:#ddd6c6;--acc:#1f6f50}
@media (prefers-color-scheme:dark){:root{--bg:#16150f;--fg:#efe9da;--muted:#a59f90;--card:#211f18;--line:#3a3628;--acc:#5cc59a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;padding:24px 16px 48px}
main{max-width:760px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}
p{margin:6px 0}.muted{color:var(--muted)}
ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}
li{display:flex;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px}
button{font:inherit;font-weight:600;border:1px solid var(--acc);color:var(--acc);background:transparent;border-radius:6px;padding:8px 14px;cursor:pointer;min-width:110px}
button:active,button.on{background:var(--acc);color:var(--bg)}
li div{flex:1}li b{display:block}li small{color:var(--muted)}
code{font-size:12px;color:var(--muted)}
#log{font:12px/1.4 ui-monospace,monospace;color:var(--muted);white-space:pre-wrap;min-height:1.4em}
</style></head><body><main>
<h1>Звуки Zero to Millionaire</h1>
<p class="muted">Каждая кнопка играет тот же код, что игра (блок «Звук» из <code>src/ui.js</code>, вырезанный при сборке). Громкость системы поставь как обычно для игр.</p>
<h2>По одному</h2>
<ul id="list"></ul>
<h2>Как это слышно в игре</h2>
<ul>
<li><button type="button" data-combo="stops">Спин ×1</button><div><b>Один обычный спин на ×1</b><small>3 остановки барабанов и «Хороший месяц» сразу после последней</small></div></li>
<li><button type="button" data-combo="stack">Обрыв</button><div><b>Все остановки разом</b><small>Нажал «Крутить» во время вращения или ушёл со вкладки: 3–4 «Остановки» в одну и ту же миллисекунду</small></div></li>
</ul>
<h2>Типичная минута автоспина</h2>
<p class="muted">Новая жизнь, автоспин, настоящие броски Core. На развилке игрок думает 1,5 с. Повторное нажатие останавливает.</p>
<ul>
<li><button type="button" data-minute="1">Минута ×1</button><div><b>Скорость ×1</b><small id="m1"></small></div></li>
<li><button type="button" data-minute="4">Минута ×4</button><div><b>Скорость ×4 (самая быстрая)</b><small id="m4"></small></div></li>
</ul>
<p id="log"></p>
</main>
<script>
${core}
${makeSounds}
const SOUNDS = ${JSON.stringify(SOUNDS)};
${typicalMinute.toString()}
const sfx = makeSounds(window);
const log = document.getElementById('log');
function play(k) { sfx[k](); }
document.getElementById('list').innerHTML = SOUNDS.map(([k, name, when]) =>
  '<li><button type="button" data-sound="' + k + '">' + name + '</button><div><b>' + k + '</b><small>' + when + '</small></div></li>').join('');
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.sound) { play(b.dataset.sound); log.textContent = 'играет: ' + b.dataset.sound; }
  if (b.dataset.combo === 'stops') { [620, 810, 1000].forEach((t) => setTimeout(() => play('stop'), t)); setTimeout(() => play('good'), 1000); }
  if (b.dataset.combo === 'stack') { for (let i = 0; i < 4; i++) play('stop'); }
  if (b.dataset.minute) minute(+b.dataset.minute, b);
});
const plans = {};
for (const sp of [1, 4]) {
  plans[sp] = typicalMinute(Core, sp, 60000, Math.random);
  const c = {}; plans[sp].events.forEach(([, k]) => { c[k] = (c[k] || 0) + 1; });
  document.getElementById('m' + sp).textContent = plans[sp].spins + ' спинов, ' + plans[sp].events.length + ' звуков за минуту: ' + Object.entries(c).map(([k, v]) => k + ' ' + v).join(', ');
}
let timers = [], playing = null;
function minute(sp, b) {
  timers.forEach(clearTimeout); timers = [];
  document.querySelectorAll('[data-minute]').forEach((x) => x.classList.remove('on'));
  if (playing === sp) { playing = null; log.textContent = 'остановлено'; return; }
  playing = sp; b.classList.add('on');
  const t0 = performance.now();
  plans[sp].events.forEach(([t, k]) => timers.push(setTimeout(() => { play(k); log.textContent = ((performance.now() - t0) / 1000).toFixed(1) + ' с: ' + k; }, t)));
  timers.push(setTimeout(() => { playing = null; b.classList.remove('on'); log.textContent = 'минута ×' + sp + ' закончилась'; }, 60500));
}
window.soundCheck = { makeSounds, SOUNDS, typicalMinute, plans };
</script></body></html>
`;
for (const [name, code] of [['страница', page.match(/<script>([\s\S]*)<\/script>/)[1]]]) {
  try { new vm.Script(code, { filename: name }); } catch (e) { fail('синтаксическая ошибка: ' + e.message); }
}
const out = path.join(root, 'dist', 'sound-check.html');
fs.writeFileSync(out, page);
console.log('собрано:', path.relative(process.cwd(), out), (page.length / 1024).toFixed(0) + ' КБ, звуков:', keys.length);
module.exports = { typicalMinute };
