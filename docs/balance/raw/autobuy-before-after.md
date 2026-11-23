# Автопокупки: подбор запаса (23.11.2026)

N = 600, зёрна 1000–1599 (seed0), часть — ещё 1600–2199 (seed600). Наследие 0 / 1 / 2, как в сводной таблице отчёта.
`autoidle` — ничего не делает, все автопокупки включены (повышение, спортзал, жильё, инвестиции, четвёртый барабан, четыре улучшения).
`autostudy` — то же плюс фокус «Учёба», пока есть следующая должность, потом «Работа».

| Бот, запас | Миллион, % | Медианный возраст | Файл |
|---|---|---|---|
| nofocus (ориентир) | 5 (6) / 96 (98) / 100 | 64 / 59 / 48 (47) | `nofocus_N600_seed*.txt` |
| casual (ориентир) | 100 / 100 / 100 | 47 / 42 / 37 | `casual_N600_seed0.txt` |
| autoidle ×1 | 98 / 100 / 100 | 60 / 50 / 39 | `autobuy-old-reserve1_autoidle_N600_seed0.txt` |
| autoidle ×2 | 11 (9) / 100 / 100 | 64 / 56 / 43 | `autobuy-old-reserve2_autoidle_N600_seed*.txt` |
| autoidle ×2 без повышения | 3 / 100 / 100 | 64 / 58 / 44 | `autobuy-old-reserve2-nojob_autoidle_N600_seed0.txt` |
| autoidle ×2 без спортзала | 2 / 100 / 100 | 64 / 58 / 43 | `autobuy-old-reserve2-nogym_autoidle_N600_seed0.txt` |
| **autoidle ×3** | **0 (0) / 86 (87) / 100** | **— / 61 / 47** | `autobuy_reserve3_autoidle_N600_seed*.txt` |
| autoidle ×4 | 0 / 34 / 100 | — / 63 / 51 | `autobuy_reserve4_autoidle_N600_seed0.txt` |
| autoidle ×5 | 0 / 7 / 100 | — / 64 / 54 | `autobuy_reserve5_autoidle_N600_seed0.txt` |
| autostudy ×1 | 99 / 100 / 100 | 60 / 50 / 39 | `autobuy-old-reserve1_autostudy_N600_seed0.txt` |
| autostudy ×2 | 28 / 100 / 100 | 64 / 54 / 42 | `autobuy-old-reserve2_autostudy_N600_seed0.txt` |
| **autostudy ×3** | **1 (1) / 99 (98) / 100** | **64 / 58 / 44** | `autobuy_reserve3_autostudy_N600_seed*.txt` |
| autostudy ×4 | 0 / 85 / 100 | 64 / 61 / 47 | `autobuy_reserve4_autostudy_N600_seed0.txt` |
| autostudy ×5 | 0 / 61 / 100 | — / 62 / 48 | `autobuy_reserve5_autostudy_N600_seed0.txt` |

Файлы `autobuy-old-*` сняты, когда запасы были ×1 / ×2 / ×3; в игре остались ×3 / ×4 / ×5 (`AUTO_RESERVES`), числа ×3 в старых и новых файлах совпадают.
