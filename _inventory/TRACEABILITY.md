# TRACEABILITY.md

Сведение всех номеров ТЗ/GM-DOM/GM-UX/IMP-003/AR-003, встречающихся в коде (grep -rn по `greenmarket/`, `navigation-runtime-layer/` и `react-vite-bootstrap-project/src/`), с проверкой — есть ли соответствующий файл в docs/specifications/, docs/architecture/ или greenmarket/GreenMarket/docs/. Каждая строка проверена вручную (не по описанию README, а по фактическому наличию файла).

Обновлено 2026-08-17: добавлены ссылки из нового экрана карточки продавца и расширенного домена Map.

## Легенда статуса
- ✅ Есть — файл существует, ссылка проверяема.
- ❌ Отсутствует — номер упоминается в коде с конкретным разделом (§N), но файла с таким именем нет нигде в архиве.
- ℹ️ Не ТЗ — вспомогательный документ (ревью/промпт), не входит в нумерацию ТЗ.

## Таблица

| Идентификатор | Что описывает (по контексту цитирования) | Документ в репозитории | Код, который на него ссылается | Статус |
|---|---|---|---|---|
| ТЗ-001 | Главный экран покупателя | docs/specifications/01_tz001...md | — (в коде прямых цитат не найдено) | ✅ |
| ТЗ-002 | Варианты покупки | docs/specifications/02_tz002...md | purchase_options/viewmodels/PurchaseOptionsViewModel.ts | ✅ |
| ТЗ-003 | Карточка продавца (концепция) | docs/specifications/03_tz003...md | — | ✅ |
| ТЗ-004 | Карточка товара (анонсирована, не пришла) | нет файла | BottomSheetDeclarative.tsx — упоминание в комментарии | ❌ (изначально не существовал, зафиксировано в README) |
| ТЗ-015 | Purchase Optimizer | docs/specifications/13_tz015...md | purchase_options/viewmodels/PurchaseOptionsViewModel.ts | ✅ |
| ТЗ-018 | Каталог действий GreenMarket | docs/specifications/16_tz018...md | navigation-runtime-layer/navigation/ScreenRegistry.ts | ✅ |
| ТЗ-022 | Подготовка к FSM Engine | docs/architecture/22_tz022...md | runtime/GreenMarketRuntime.ts, hooks/useGreenMarketRuntime.ts, navigation/NavigationStack.ts | ✅ |
| ТЗ-024 | Bottom Sheet — детальная спецификация | docs/specifications/24_tz024...md | BottomSheetDeclarative.tsx | ✅ |
| ТЗ-025 §12 | Карточка продавца — детальная спецификация (поля ViewModel) | docs/specifications/29_...v1.1.md (актуальна; есть и устаревшая 27_...detalnaya.md) | viewmodels/SellerCardViewModel.ts, contracts/DomainTypes.ts, contracts/ContentBlock.ts, BottomSheetDeclarative.tsx (×4), adapters/SellerCardAdapter.ts | ✅ |
| ТЗ-027 §5 | SellerCardBuilder / Adapter карточки продавца | нет файла | viewmodels/SellerCardViewModel.ts, adapters/SellerCardAdapter.ts | ❌ |
| ТЗ-035 §5 | Доменный контракт экрана «Поиск» | нет файла | search/viewmodels/SearchViewModel.ts | ❌ |
| ТЗ-036 §3, §5, §6, §13 | Доменный контракт «Каталог»; структура папок; Action Catalog (CHANGE_CATEGORY, REFRESH) | нет файла | catalog/viewmodels/CatalogViewModel.ts, screens/CatalogScreen.ts (×3) | ❌ |
| ТЗ-037 §3, §5, §6 | Доменный контракт «Корзина»; структура папок | нет файла | basket/viewmodels/BasketViewModel.ts (×2), screens/BasketScreen.ts | ❌ |
| ТЗ-038 §5, §6 | Доменный контракт «Избранное» | нет файла | favorites/viewmodels/FavoritesViewModel.ts (×2) | ❌ |
| GM-DOM-001 §5, §5.1–5.5 | Domain Model (Seller, ProductGroup, CatalogPublication, SellerProduct и др.) | нет файла | domain/catalog/models/SellerProductPhoto.ts, domain/catalog/__tests__/DomainModels.test.ts (×5) | ❌ |
| GM-DOM-002 §8 | Repository Contract | нет файла | domain/catalog/SellerProductPhotoRepository.ts, упомянут также в GM-UX-008/009/010/012/013.md | ❌ |
| GM-DOM-003 §4, §10 | (по контексту — реализация репозитория, замена мока на реальную) | нет файла | domain/catalog/MockSellerProductPhotoRepository.ts | ❌ |
| GM-DOM-005 | Runtime Models | нет файла | только в GM-UX-*.md (перечисление источников), в коде .ts не встречается | ❌ (но не подтверждено кодом, только документами) |
| GM-DOM-006 | Navigation Model | нет файла | только в GM-UX-*.md | ❌ (аналогично) |
| GM-DOM-007 | Action Model | нет файла | только в GM-UX-*.md | ❌ (аналогично) |
| GM-DOM-008 | Screen Contract | нет файла | только в GM-UX-*.md | ❌ (аналогично) |
| GM-UX-001…013 | UX-артефакты экранов Stage 1 | greenmarket/GreenMarket/docs/ux/stage-1/*.md (все 13 присутствуют) | ссылаются друг на друга и на GM-DOM-*; напрямую в .ts-коде не упоминаются | ✅ |
| IMP-003.1 / IMP-003.1.1 / IMP-003.1.2 | Экран Map: архитектура, GeoService, MapRuntime | нет файла | `react-vite-bootstrap-project/src/platform-core/map/*` (54 файла, включая gis/, repository/, routing/, runtime/, persistence/, history/, product-search/, recommendations/, adapters/, builders/, filters/, viewmodels/ + тесты), `screens/MapScreen.ts`, `screens/SellerCatalogScreen.ts`, `screens/map/MapScreenView.tsx`, `screens/map/MapSearchAutocomplete.tsx`, `diagnostics/Diagnostics.ts`, `contracts/Action.ts`, `app/App.tsx`, `app/NavigationContainer.tsx`, `app/MapSurface.tsx` | ❌ (цитируется с разделами §2–§15; файлов нет) |
| AR-003 | Диаграмма навигации Customer UI (Map ↔ Catalog ↔ Seller List) | нет файла | `screens/MapScreen.ts`, `screens/SellerListScreen.ts`, `screens/seller-list/SellerListScreenView.tsx`, `screens/map/MapScreenView.tsx`, `map/*`, `navigation-runtime-layer/*/NavigationStack.ts`, `contracts/Action.ts`, `runtime/GreenMarketRuntime.ts`, `app/NavigationContainer.tsx` | ❌ (цитируется как существующий) |

## Прочитанное как единый вывод

1. Подтверждена находка пользователя: код содержит не гипотетические, а точные постатейные ссылки (§3, §5, §6, §13) на пять документов — ТЗ-027, ТЗ-035, ТЗ-036, ТЗ-037, ТЗ-038 — которых физически нет в архиве. По названиям разделов, на которые ссылаются (§5 «доменный контракт», §6 «модель элемента», §3 «структура папок»), это, судя по всему, была единая по формату серия спецификаций по одному документу на модуль (Seller Card / Search / Catalog / Basket / Favorites), написанная позже базовой серии ТЗ-001…026 и не попавшая в этот README/архив.

2. Отдельная, более глубокая находка (не входила в предыдущий обзор): восьмичастная серия GM-DOM-001…008 («Domain Model», «Repository Contract», «Runtime Models», «Navigation Model», «Action Model», «Screen Contract» и т.д.) активно цитируется как в коде navigation-runtime-layer/domain/, так и в самих файлах GM-UX-008…013.md, но ни один файл GM-DOM-*.md в репозитории не существует. По содержанию (границы слоёв Domain/Repository/Application) это похоже на серию, которую README называет вынесенной в ../../../platform_core/ («архитектура Domain Service, единый контракт Domain Service» и т.д.) — но это гипотеза: прямого соответствия имён (GM-DOM-00N vs описанные в README темы) в самом репозитории нет, проверить можно только открыв platform_core/, которого в этом архиве нет.

3. Новая находка при обновлении инвентаризации: **экран Map** реализован в `react-vite-bootstrap-project/src/platform-core/map/` (16 файлов) и ссылается на серию **IMP-003.1 / IMP-003.1.1 / IMP-003.1.2 / AR-003** с постатейными ссылками (§2–§15). Этих документов в репозитории нет — при этом GM-010 (единственный архитектурный документ про Map) их не упоминает. Тот же IMP-003.1 цитируется в `diagnostics/Diagnostics.ts`, `contracts/Action.ts`, `screens/MapScreen.ts`, `screens/MapScreenView.tsx` и `app/NavigationContainer.tsx`. AR-003 дополнительно цитируется в `screens/seller-list/SellerListScreenView.tsx`.

4. Практический вывод: если восстанавливать недостающие документы, разумный порядок — сначала ТЗ-036 (Каталог, 5 упоминаний, влияет и на Action Catalog) и GM-DOM-001 (Domain Model, 15 упоминаний — самый цитируемый отсутствующий документ в репозитории), затем ТЗ-037/038/035/027 и GM-DOM-002/003 по убыванию числа ссылок. После них — серия IMP-003.1/AR-003 (нужна для верификации экрана Map, который теперь составляет 54 файла кода — самый большой домен в проекте).

## Находки 2026-08-17: экран карточки продавца и расширенный домен Map

5. **Экран карточки продавца** реализован в `react-vite-bootstrap-project/src/screens/seller-card/` (9 файлов: SellerCardScreenView.tsx, SellerCardHeader.tsx, SellerCardActions.tsx, SellerCardProducts.tsx, SellerCardRecommendations.tsx, SellerCardReports.tsx, SellerCardReportDialog.tsx, useSellerCardController.ts, seller-card.css). Ссылается на ТЗ-025 v1.1 (✅) и ТЗ-027 §5 (❌ — файла нет).

6. **Домен Map расширился с 16 до 54 файлов**: добавлены подмодули routing/ (RouteService, OsrmHttpProvider, PolylineCodec + 3 теста), persistence/ (MapSessionStore, OfflineCacheStore, SellerHistoryStore + тесты), history/ (SellerHistory + тесты), product-search/ (ProductSearch + тесты), recommendations/ (SellerRecommendations + тесты), gis/ (TileFallback, MarkerStyle + тесты), repository/ (6 новых файлов + тесты), runtime/MapProjection.ts + тест. Все новые файлы ссылаются на IMP-003.1 (§3–§14), подтверждая серию как полное описание архитектуры экрана Map.

7. **Добавлены новые утилиты и компоненты**: formatting/SellerStatus.ts, formatting/DurationFormatter.ts, formatting/InitialsFormatter.ts, utils/clipboard.ts, app/MapSurface.tsx, app/useMapFullscreen.ts, app/useIsMobile.ts, app/routeMapping.ts, screens/map/MapSearchAutocomplete.tsx, diagnostics/ (5 новых файлов), navigation-runtime-layer/runtime/GreenMarketActionHandlers.ts.

## Не подтвердившиеся/скорректированные утверждения предыдущей инвентаризации

| Утверждение | Что оказалось на самом деле |
|---|---|
| «README фиксирует ТЗ-001…029» | Неточно. Таблица README — это 29 *ссылок источника* (хронологических), а не диапазон номеров ТЗ. Реальные номера ТЗ в этой таблице: 001–003, 005–011, 013–026 (24 уникальных, макс. — ТЗ-026). Формулировка была исправлена в DOCUMENT_INDEX.md. |
| «29 документов ТЗ» | Из 29 строк таблицы 4 — не ТЗ-документы (мета-ревью, промпт, рецензия, ответ на вопросы), а 2 строки — это два файла одного и того же ТЗ-025 (v1.0/v1.1). Строгое число самостоятельных ТЗ-документов — 23 файла. |
| «123 файла» | Подтверждено: find . -type f без node_modules/.git = 123. **Актуализировано при обновлении 2026-08-17: теперь 349 файлов** — добавлены react-vite-bootstrap-project/, tests_folder/, корневые служебные файлы; удалены archive/ и full_changes.diff; добавлены экран карточки продавца (9 файлов), расширен домен Map (54 файла), утилиты, diagnostics, plugins, лог-файлы. |
| «Код ссылается на ТЗ-027, ТЗ-035…038» | Подтверждено и расширено — плюс найдена ранее не замеченная серия GM-DOM-001…008. **При обновлении добавлена серия IMP-003.1/IMP-003.1.1/IMP-003.1.2/AR-003** (экран Map), цитируемая только в react-vite-bootstrap-project/src/platform-core/map/. |
| «Код — только greenmarket/ + navigation-runtime-layer» | Неточно: есть вторая копия кода в react-vite-bootstrap-project/src/platform-core/ (~200 файлов). Часть файлов идентична, часть разошлась. Домен Map существует только здесь. Полное описание — в CODE_INDEX.md. |
| «Код ссылается на ТЗ-025 v1.1» | Верно. Дополнительно: в react-vite/src/platform-core/ те же ссылки на ТЗ-025 v1.1 (копия того же файла). |
