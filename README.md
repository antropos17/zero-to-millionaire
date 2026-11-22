# Zero to Millionaire

Idle-игра в одном HTML-файле: слот крутит месяцы жизни, цель — накопить $1 000 000 до 65 лет.

Готовая игра: `dist/zero-to-millionaire.html`. Открывается двойным щелчком, сети не требует.

## Быстрый старт

```bash
npm install                      # нужен только Playwright для тестов
npx playwright install chromium  # один раз: браузер для тестов
npm run build                    # собрать dist/zero-to-millionaire.html
npm test                         # сквозные проверки в браузере (около 2 минут)
```

Сборка зависимостей не имеет: `npm run build` работает и без `npm install`.

## Команды

| Команда | Что делает |
|---|---|
| `npm run build` | Собирает один HTML из `src/` и шрифтов в `assets/fonts/` |
| `npm test` | 133 сквозные проверки интерфейса |
| `npm run test:edges` | Битые и старые сохранения, крайние случаи |
| `npm run test:forks` | Открывает все развилки и жмёт все три варианта |
| `npm run test:fuzz` | Случайные жизни на чистой логике с проверкой инвариантов |
| `npm run test:monkey` | Случайные нажатия по интерфейсу, ловит тупики и ошибки |
| `npm run test:sweep` | Замер сдвигов вёрстки за целую жизнь |
| `npm run test:all` | Всё, кроме monkey и sweep |
| `npm run sim` | Симулятор баланса (долго: см. CLAUDE.md) |

## Структура

- `src/core.js` — вся логика игры без DOM. Работает и в браузере, и в Node.
- `src/art.js` — рисунки сцены (SVG-строки).
- `src/ui.js` — интерфейс.
- `src/template.html`, `src/style.css` — разметка и стили.
- `scripts/build.js` — сборка.
- `tests/`, `tools/` — проверки и симулятор баланса.
- `docs/DESIGN.md` — механики, числа и правила честного дизайна.
- `CLAUDE.md` — контекст для Claude Code.
