/* Собирает один самодостаточный HTML: стили, логика, интерфейс и шрифты внутри файла. Зависимостей нет. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const noExport = (code) => code.replace(/if \(typeof module[^\n]+\n?/, '');

/* шрифты лежат в assets/fonts: описание каждого начертания в faces.json, сам файл вшивается как base64 */
const fontsDir = path.join(root, 'assets', 'fonts');
const fonts = JSON.parse(fs.readFileSync(path.join(fontsDir, 'faces.json'), 'utf8')).map((f) => {
  const b64 = fs.readFileSync(path.join(fontsDir, f.file)).toString('base64');
  return `@font-face {${f.css.replace('url(FILE)', `url(data:font/woff2;base64,${b64})`)}}\n`;
}).join('');

const core = noExport(read('core.js'));
const ui = noExport(read('art.js')) + '\n' + read('ui.js');

/* сборка не выпускает файл с синтаксической ошибкой: оба скрипта сначала компилируются */
for (const [name, code] of [['core.js', core], ['art.js + ui.js', ui]]) {
  try { new vm.Script(code, { filename: name }); } catch (e) { console.error('СИНТАКСИЧЕСКАЯ ОШИБКА в ' + name + ': ' + e.message); process.exit(1); }
}

const html = read('template.html')
  .replace('/*FONTS*/', () => fonts)
  .replace('/*CSS*/', () => read('style.css'))
  .replace('/*CORE*/', () => core)
  .replace('/*UI*/', () => ui);

const out = process.argv[2] || path.join(root, 'dist', 'zero-to-millionaire.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('собрано:', path.relative(process.cwd(), out), (html.length / 1024).toFixed(0) + ' КБ, начертаний шрифтов:', (fonts.match(/@font-face/g) || []).length);
/* страница прослушивания звуков: dist/sound-check.html, звуки берутся из того же src/ui.js */
if (!process.argv[2]) require('./sounds.js');
