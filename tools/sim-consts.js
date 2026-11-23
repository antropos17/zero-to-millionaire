/* Подбор чисел рекламных бонусов: core.js с подменёнными константами кладётся в кэш require,
   дальше обычный tools/sim-variant.js (все его переменные работают).
   Пример: AD=16 GOALS=1 ONLY=smart+ad L=0 LIFE=1 N=600 node tools/sim-consts.js
   AD=лимит STARR=отдых звезды SALEC=скидка SALER=отдых скидки */
const fs = require('fs'), path = require('path'), Module = require('module');
const W = path.join(__dirname, '..');
const file = path.join(W, 'src', 'core.js');
let src = fs.readFileSync(file, 'utf8');
const sub = (re, val) => { if (val == null) return; if (!re.test(src)) throw new Error('нет ' + re); src = src.replace(re, val); };
sub(/const AD_LIMIT = \d+;/, process.env.AD && `const AD_LIMIT = ${process.env.AD};`);
sub(/const STAR_REST = \d+;/, process.env.STARR && `const STAR_REST = ${process.env.STARR};`);
sub(/const SALE_CUT = [\d.]+, SALE_REST = \d+;/, (process.env.SALEC || process.env.SALER) && `const SALE_CUT = ${process.env.SALEC || 0.2}, SALE_REST = ${process.env.SALER || 24};`);
const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
m._compile(src, file); m.loaded = true;
require.cache[file] = m;
console.log(`# AD=${process.env.AD || '-'} STARR=${process.env.STARR || '-'} SALEC=${process.env.SALEC || '-'} SALER=${process.env.SALER || '-'} (- = как в core.js)`);
require(path.join(W, 'tools', 'sim-variant.js'));
