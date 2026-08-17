# DOCUMENT_INDEX.md

Полный список всех `.md`-документов репозитория (63 файла, без `node_modules`), полученный обходом через Glob-инструмент.

Обновлено 2026-08-17: обновлены счётчики файлов и отражено добавление экрана карточки продавца, расширение домена Map и новых утилит. Удалены `AI-first_Engineering_Process.md` и `archive/` (файлы не найдены на диске).

> Уточнение к предыдущей версии инвентаризации: README сам себя называет «19 ссылок ТЗ + 1 мета-ревью + 1 промпт + 1 ТЗ по FSM Engine + 2 детальные спецификации» в заголовке, а таблица «Список документов» в README содержит 29 строк — но это 29 *хронологических ссылок источника* (нумерация "1…29-я ссылка"), а не диапазон номеров ТЗ. Реальные номера ТЗ, встречающиеся в этой таблице: ТЗ-001…003, 005…011, 013…026 (24 уникальных номера; ТЗ-004, 012 отсутствуют, ТЗ-025 — 2 версии). Максимальный существующий в `docs/specifications/` номер — ТЗ-026. Номеров ТЗ-027…029 в файловой системе репозитория нет (при этом код ссылается на ТЗ-027 — см. TRACEABILITY.md).

## 1. Корень репозитория (1 .md-файл)

| Файл | Роль |
|---|---|
| README.md | Главный индекс: хронология всех 29 ссылок источника, история переносов, известные разрывы нумерации, фактическое состояние кода |

## 2. docs/ — документация репозитория (30 файлов)

| # | Путь | Документ | ТЗ № | Статус |
|---|---|---|---|---|
| — | docs/README.md | Навигация по подпапкам docs/ + список других мест хранения документации | — | служебный |
| 1 | docs/specifications/01_tz001_glavny_ekran_pokupatelya.md | Главный экран покупателя | ТЗ-001 | есть |
| 2 | docs/specifications/02_tz002_varianty_pokupki.md | Варианты покупки | ТЗ-002 | есть |
| 3 | docs/specifications/03_tz003_kartochka_prodavtsa.md | Карточка продавца | ТЗ-003 | есть |
| — | — | Карточка товара (анонсирована в ТЗ-008, п.4) | ТЗ-004 | отсутствует (не пришла отдельной ссылкой) |
| 4 | docs/specifications/04_tz005_obschie_printsipy_customer_ui.md | Общие принципы Customer UI | ТЗ-005 | есть |
| 5 | docs/specifications/05_tz006_user_flow_povsednevnaya_pokupka.md | User Flow №1. Повседневная покупка | ТЗ-006 | есть |
| 6 | docs/specifications/06_tz007_model_sostoyaniy_fsm.md | Модель состояний (FSM) | ТЗ-007 | есть |
| 7 | docs/specifications/07_tz008_viewmodel_customer_ui.md | ViewModel Customer UI | ТЗ-008 | есть |
| 8 | docs/specifications/08_tz009_kontrakt_ui_backend.md | Контракт Customer UI ↔ Backend | ТЗ-009 | есть |
| 9 | docs/specifications/09_tz010_glossariy_greenmarket.md | Глоссарий GreenMarket | ТЗ-010 | есть |
| 10 | docs/specifications/10_tz011_printsipy_proektirovaniya.md | Принципы проектирования Customer UI | ТЗ-011 | есть |
| — | — | MVP Scope (анонсирован в конце ТЗ-011) | ТЗ-012 | отсутствует |
| 11 | docs/specifications/11_tz013_pravila_razvitiya_ui.md | Правила развития Customer UI | ТЗ-013 | есть |
| 12 | docs/specifications/12_tz014_predmetnaya_model.md | Предметная модель GreenMarket (не путать с анонсированной в ТЗ-013 «Информационной архитектурой» — тот документ не пришёл) | ТЗ-014 | есть, но номер переиспользован |
| 13 | docs/specifications/13_tz015_purchase_optimizer.md | Purchase Optimizer (только требования) | ТЗ-015 | есть |
| 14 | docs/specifications/14_tz016_informatsionnaya_model.md | Информационная модель GreenMarket (не путать с анонсированными в ТЗ-015 «Источниками доверия к данным» — тот документ не пришёл) | ТЗ-016 | есть, но номер переиспользован |
| 15 | docs/specifications/15_tz017_sobytiynaya_model.md | Событийная модель GreenMarket | ТЗ-017 | есть |
| 16 | docs/specifications/16_tz018_katalog_deystviy.md | Каталог действий GreenMarket | ТЗ-018 | есть |
| 17 | docs/specifications/17_tz019_raspredelenie_otvetstvennosti.md | Распределение ответственности покупатель/система | ТЗ-019 | есть |
| 18 | docs/specifications/18_tz020_biznes_pravila.md | Бизнес-правила GreenMarket (BR-013…015 по FSM Engine) | ТЗ-020 | есть |
| 19 | docs/specifications/19_tz021_nfr.md | Нефункциональные требования (NFR) | ТЗ-021 | есть |
| 20 | docs/reviews/20_meta_review_struktury_arhiva.md | Мета-ревью структуры архива v1/v2/v3 (не ТЗ) | — | есть |
| 21 | docs/architecture/21_prompt_fsm_engine_sovmestimost.md | Промпт для ИИ-редактора документации (не ТЗ; правки внесены вручную, не буквально) | — | есть |
| 22 | docs/architecture/22_tz022_podgotovka_k_fsm_engine.md | Подготовка GreenMarket к внедрению FSM Engine | ТЗ-022 | есть |
| 23 | docs/specifications/23_tz023_glavny_ekran_detalnaya_specifikaciya.md | Главный экран — детальная спецификация для React (новая нумерация, старое ТЗ-023 вынесено в platform_core) | ТЗ-023 | есть |
| 24 | docs/specifications/24_tz024_bottom_sheet_detalnaya_specifikaciya.md | Bottom Sheet — детальная спецификация для React (новая нумерация) | ТЗ-024 | есть |
| 25 | docs/reviews/25_review_arhiva_posle_dobavleniya_tz023_024.md | Рецензия архива, смотрела на устаревшую версию (не ТЗ) | — | есть |
| 26 | docs/reviews/26_rekomendacii_svyazannye_dokumenty_i_chitatel.md | Ответ на открытые вопросы рецензии (не ТЗ) | — | есть |
| 27 | docs/specifications/27_tz025_kartochka_prodavtsa_detalnaya.md | Карточка продавца — детальная спецификация, v1.0, устарела | ТЗ-025 | есть (старая версия) |
| 28 | docs/specifications/28_tz026_protokol_verifikacii_tz.md | Протокол верификации ТЗ (VR-001…006) | ТЗ-026 | есть |
| 29 | docs/specifications/29_tz025_kartochka_prodavtsa_candidate_v1.1.md | Карточка продавца — детальная спецификация, v1.1, актуальная | ТЗ-025 | есть (актуальная версия) |
| — | — | Домены Domain Service / границы слоёв / принцип атомарного Action и т.д. (7 документов, изначально присланы под номерами ТЗ-023…029 старой нумерации) | — | **вынесены в ../../../platform_core/** — физически отсутствуют в этом архиве |

Вывод по нумерации: в файловой системе реально существуют документы с номерами ТЗ-001, 002, 003, 005–011, 013–026 (24 уникальных номера, 25 файлов из-за дублирования ТЗ-025). Номера ТЗ-004, 012 никогда не выпускались. Номера ТЗ-027, 028, 029 в старой нумерации источника — это не то же самое, что «строки 27–29» текущей таблицы README (там уже новая, переиспользованная нумерация). Файла с содержимым «ТЗ-027» в этом репозитории нет — при этом код (см. TRACEABILITY.md) ссылается на «ТЗ-027 §5» как на существующий источник (SellerCardBuilder) — то есть это, по-видимому, отдельная, невынесенная сюда версия нумерации, использованная при написании кода, но не совпадающая с README.

## 3. greenmarket/GreenMarket/docs/ — документация UI-модуля (25 файлов)

### 3.1 design-system/ (10 файлов)
README.md, DS-001-Design-Concept.md, DS-v2-Refactor-Summary.md, и 7 файлов токенов в DS-002-Design-Tokens/: Color, Elevation, Icon-Sizes, Motion-Tokens, Radius, Spacing, Typography.

> Серия DS в README раздела описана как DS-001…DS-007; физически существуют только DS-001 и DS-002 (+ DS-v2-Refactor-Summary и README). DS-003 Foundations, DS-004 Components, DS-005 Patterns, DS-006 Screen Templates, DS-007 Brand Guidelines — в репозитории отсутствуют.

### 3.2 ux/stage-1/ (13 файлов) + ux/README.md
GM-UX-001-Map, 002-Catalog, 003-Seller-List, 004-Seller-List-and-Card, 005-Seller-Card-and-Product-Card, 006-Product-Card, 007-Search, 008-CatalogScreen, 009_Product_Card, 010_Seller_Card, 011_Search_Technical_Specification, 012_Basket_Technical_Specification, 013_Purchase_Options_Technical_Specification.

Все номера GM-UX-001…013, встречающиеся в коде (см. TRACEABILITY.md), **подтверждены существующими** файлами — расхождений код/документация по этой серии не найдено.

### 3.3 architecture/ (1 файл)
GM-010_STAGE1_MODEL_MAPPING.md — маппинг Stage-1 моделей на экраны (экран Map описан как основной, но домен Map реализован только в `react-vite-bootstrap-project/src/platform-core/map/`, не в `greenmarket/`).

⚠️ Найдена дополнительная серия, отсутствующая как файлы: документы GM-UX-008, 009, 010, 011, 012, 013 многократно ссылаются на GM-DOM-001 (Domain Model), GM-DOM-002 (Repository Contract), GM-DOM-003, GM-DOM-005 (Runtime Models), GM-DOM-006 (Navigation Model), GM-DOM-007 (Action Model), GM-DOM-008 (Screen Contract). Файлов GM-DOM-*.md в репозитории нет (есть только GM-010_STAGE1_MODEL_MAPPING.md, который по содержанию не совпадает по наименованию с этой серией). По контексту («Domain Service», «границы слоёв UI/Platform Core/REST/Application/Domain/Repository/DB») это, вероятно, та же группа документов, что README описывает как перенесённую в `../../../platform_core/` — но прямого подтверждения этому в самом репозитории нет, это гипотеза, а не факт.

## 4. navigation-runtime-layer/ и react-vite-bootstrap-project/ — .md-файлы

| Файл | Роль |
|---|---|
| react-vite-bootstrap-project/README.md | README исполняемого приложения Stage 1 (обновлён под фактическое состояние: Buyer MVP, домен Map, экраны Map/Seller List/Filter) |
| — | В navigation-runtime-layer/ и в коде react-vite/src/platform-core/ .md-файлов нет |

## 5. tests_folder/ — документация тестирования (2 файла, вне серии ТЗ)

| Файл | Роль |
|---|---|
| tests_folder/tests/TEST_COVERAGE.md | Методология полноты автоматизированного тестирования (обязательна для всех Playwright-сценариев проекта) |
| tests_folder/tests/TZ_TESTING_BUYER_MVP.md | Черновик ТЗ на тестирование Buyer MVP (Stage 1): экраны Главная/Каталог/Карточка товара, контракт Catalog API. Самых Playwright-сценариев в репозитории нет — тесты предстоит написать |

## 6. _inventory/ — инвентаризация репозитория (4 файла, служебные)

| Файл | Роль |
|---|---|
| FILE_TREE.md | Полное дерево репозитория (349 файлов без node_modules) |
| DOCUMENT_INDEX.md | Этот документ: полный индекс всех .md-файлов |
| CODE_INDEX.md | Индекс .ts/.tsx-кода (greenmarket + navigation-runtime-layer + react-vite) |
| TRACEABILITY.md | Сверка ссылок из кода на ТЗ/GM-DOM/GM-UX/IMP-003 с фактическим наличием файлов |

## 7. Архивный снимок archive/ (УДАЛЁН)

Директория `archive/` с zip-снимоком `GreenMarket_CustomerUI_v3_2026-07-08_2.zip` (31 файл) была удалена из репозитория. Содержимое архива ранее описывалось как снимок README и части ТЗ по состоянию на 2026-07-08.

## 8. examples/ (не .md, но документо-подобные референсы)

| Файл | Содержимое |
|---|---|
| BottomSheetDeclarative_3.jsx (45751 байт) | Идентичен по размеру файлу внутри archive/*.zip и файлу `greenmarket/GreenMarket/BottomSheetDeclarative.tsx` (1193 строки) — вероятно та же версия, переведённая в .tsx |
| BottomSheetDeclarative_3.tsx.jsx (34143 байт) | Меньше по размеру — вероятно более ранний черновик или другая ветка реализации; требует прямого diff для подтверждения |
| types.ts.txt | Базовые интерфейсы: ProductItem, AvailableAction, BusinessEvent, SellerCardViewModel, MapController |

## 9. Обновление счётчиков (что изменилось против прежней инвентаризации)

| Показатель | Было (2026-08) | Стало (2026-08-17) |
|---|---|---|
| Всего .md-файлов | 64 | **63** |
| docs/ | 30 | 30 (README + 24 спецификации + 3 ревью + 2 архитектурных) |
| greenmarket/GreenMarket/docs/ | 25 | 25 (design-system 10 + ux 14 + architecture 1) |
| Корень репозитория (.md) | 2 (README + AI-first_Engineering_Process.md) | **1** (только README; AI-first_Engineering_Process.md удалён) |
| react-vite-bootstrap-project/README.md | 1 | 1 |
| tests_folder/ | 2 | 2 |
| _inventory/ | 4 | 4 |
| Всего файлов (без node_modules) | 290 | **349** |

Основные изменения 2026-08-17: (1) добавлен экран карточки продавца `screens/seller-card/` (9 файлов); (2) домен Map расширен с 16 до 54 файлов; (3) добавлены утилиты formatting/SellerStatus.ts, formatting/DurationFormatter.ts, formatting/InitialsFormatter.ts, utils/clipboard.ts; (4) добавлены компоненты app/MapSurface.tsx, app/useMapFullscreen.ts, app/useIsMobile.ts, app/routeMapping.ts, screens/map/MapSearchAutocomplete.tsx; (5) расширены diagnostics/ (5 новых файлов); (6) добавлен plugins/localTelemetry.ts; (7) добавлен navigation-runtime-layer/runtime/GreenMarketActionHandlers.ts + тест; (8) удалены full_changes.diff, archive/, AI-first_Engineering_Process.md; (9) добавлены лог-файлы (build2.log, ssh-tunnel.log и др.).
