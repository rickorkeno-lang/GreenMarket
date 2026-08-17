# FILE_TREE.md

Полное дерево репозитория GreenMarket_CustomerUI-main по состоянию на обновление документации (2026-08-17).

Метод получения: обход дерева через Glob-инструмент без исключений, кроме `node_modules/`. Сборка `dist/` отсутствует (не коммитится). История счётчиков против предыдущей инвентаризации — в конце документа.

Итоговый счётчик: **349 файлов** (без `node_modules`).

Распределение по типам файлов: `.ts` — 199, `.md` — 63, `.tsx` — 53, `.css` — 9, `.log` — 7, `.json` — 5, `.html` — 1, `.bat` — 1, `.txt` — 1, `.jsx` — 2, `.cjs` — 1, `.example` — 1, `.editorconfig` — 1, `.prettierrc` — 1, `.gitignore` — 2.

```
.
├── README.md
├── docs/
│   ├── README.md
│   ├── architecture/
│   │   ├── 21_prompt_fsm_engine_sovmestimost.md
│   │   └── 22_tz022_podgotovka_k_fsm_engine.md
│   ├── reviews/
│   │   ├── 20_meta_review_struktury_arhiva.md
│   │   ├── 25_review_arhiva_posle_dobavleniya_tz023_024.md
│   │   └── 26_rekomendacii_svyazannye_dokumenty_i_chitatel.md
│   └── specifications/
│       ├── 01_tz001_glavny_ekran_pokupatelya.md
│       ├── 02_tz002_varianty_pokupki.md
│       ├── 03_tz003_kartochka_prodavtsa.md
│       ├── 04_tz005_obschie_printsipy_customer_ui.md
│       ├── 05_tz006_user_flow_povsednevnaya_pokupka.md
│       ├── 06_tz007_model_sostoyaniy_fsm.md
│       ├── 07_tz008_viewmodel_customer_ui.md
│       ├── 08_tz009_kontrakt_ui_backend.md
│       ├── 09_tz010_glossariy_greenmarket.md
│       ├── 10_tz011_printsipy_proektirovaniya.md
│       ├── 11_tz013_pravila_razvitiya_ui.md
│       ├── 12_tz014_predmetnaya_model.md
│       ├── 13_tz015_purchase_optimizer.md
│       ├── 14_tz016_informatsionnaya_model.md
│       ├── 15_tz017_sobytiynaya_model.md
│       ├── 16_tz018_katalog_deystviy.md
│       ├── 17_tz019_raspredelenie_otvetstvennosti.md
│       ├── 18_tz020_biznes_pravila.md
│       ├── 19_tz021_nfr.md
│       ├── 23_tz023_glavny_ekran_detalnaya_specifikaciya.md
│       ├── 24_tz024_bottom_sheet_detalnaya_specifikaciya.md
│       ├── 27_tz025_kartochka_prodavtsa_detalnaya.md
│       ├── 28_tz026_protokol_verifikacii_tz.md
│       └── 29_tz025_kartochka_prodavtsa_candidate_v1.1.md
├── greenmarket/
│   └── GreenMarket/
│       ├── adapters/
│       │   └── SellerCardAdapter.ts
│       ├── basket/
│       │   ├── BasketScreen.tsx
│       │   ├── adapters/BasketAdapter.ts
│       │   ├── builders/BasketBuilder.ts
│       │   └── viewmodels/BasketViewModel.ts
│       ├── BottomSheetDeclarative.tsx
│       ├── builders/
│       │   ├── PurchaseOptionsBuilder.ts
│       │   ├── ScreenBuilder.ts
│       │   └── SellerCardBuilder.ts
│       ├── catalog/
│       │   ├── CatalogScreen.tsx
│       │   ├── adapters/CatalogAdapter.ts
│       │   ├── builders/CatalogBuilder.ts
│       │   └── viewmodels/CatalogViewModel.ts
│       ├── contracts/
│       │   ├── Action.ts
│       │   ├── ContentBlock.ts
│       │   ├── DomainTypes.ts
│       │   ├── LoadState.ts
│       │   └── ViewState.ts
│       ├── docs/
│       │   ├── architecture/GM-010_STAGE1_MODEL_MAPPING.md
│       │   ├── design-system/
│       │   │   ├── README.md
│       │   │   ├── DS-001-Design-Concept.md
│       │   │   ├── DS-v2-Refactor-Summary.md
│       │   │   └── DS-002-Design-Tokens/
│       │   │       ├── DS-002-Color.md
│       │   │       ├── DS-002-Elevation.md
│       │   │       ├── DS-002-Icon-Sizes.md
│       │   │       ├── DS-002-Motion-Tokens.md
│       │   │       ├── DS-002-Radius.md
│       │   │       ├── DS-002-Spacing.md
│       │   │       └── DS-002-Typography.md
│       │   └── ux/
│       │       ├── README.md
│       │       └── stage-1/
│       │           ├── GM-UX-001-Map.md
│       │           ├── GM-UX-002-Catalog.md
│       │           ├── GM-UX-003-Seller-List.md
│       │           ├── GM-UX-004-Seller-List-and-Card.md
│       │           ├── GM-UX-005-Seller-Card-and-Product-Card.md
│       │           ├── GM-UX-006-Product-Card.md
│       │           ├── GM-UX-007-Search.md
│       │           ├── GM-UX-008-CatalogScreen.md
│       │           ├── GM-UX-009_Product_Card.md
│       │           ├── GM-UX-010_Seller_Card.md
│       │           ├── GM-UX-011_Search_Technical_Specification.md
│       │           ├── GM-UX-012_Basket_Technical_Specification.md
│       │           └── GM-UX-013_Purchase_Options_Technical_Specification.md
│       ├── favorites/
│       │   ├── FavoritesScreen.tsx
│       │   ├── adapters/FavoritesAdapter.ts
│       │   ├── builders/FavoritesBuilder.ts
│       │   └── viewmodels/FavoritesViewModel.ts
│       ├── formatting/
│       │   ├── DistanceFormatter.ts
│       │   ├── PriceFormatter.ts
│       │   ├── RatingFormatter.ts
│       │   └── SubtitleFormatter.ts
│       ├── presentation/
│       │   ├── DistanceVm.ts
│       │   ├── PriceVm.ts
│       │   ├── RatingVm.ts
│       │   └── SubtitleParts.ts
│       ├── product_card/
│       │   ├── ProductCardScreen.tsx
│       │   ├── adapters/ProductCardAdapter.ts
│       │   ├── builders/ProductCardBuilder.ts
│       │   └── viewmodels/ProductCardViewModel.ts
│       ├── purchase_options/
│       │   ├── PurchaseOptionsScreen.tsx
│       │   ├── adapters/PurchaseOptionsAdapter.ts
│       │   ├── formatting/Formatters.ts
│       │   ├── presentation/PurchaseOptionsPresentation.ts
│       │   └── viewmodels/PurchaseOptionsViewModel.ts
│       ├── screens/
│       │   ├── BasketScreen.ts
│       │   ├── CatalogScreen.ts
│       │   ├── FavoritesScreen.ts
│       │   ├── ProductCardScreen.ts
│       │   ├── PurchaseOptionsScreen.ts
│       │   ├── ScreenDefinition.ts
│       │   ├── SearchScreen.ts
│       │   └── SellerCardScreen.ts
│       ├── search/
│       │   ├── SearchScreen.tsx
│       │   ├── adapters/SearchAdapter.ts
│       │   ├── builders/SearchBuilder.ts
│       │   └── viewmodels/SearchViewModel.ts
│       └── viewmodels/SellerCardViewModel.ts
├── navigation-runtime-layer/
│   ├── domain/catalog/
│   │   ├── __tests__/
│   │   │   ├── DomainModels.test.ts
│   │   │   └── MockSellerProductPhotoRepository.test.ts
│   │   ├── models/SellerProductPhoto.ts
│   │   ├── MockSellerProductPhotoRepository.ts
│   │   └── SellerProductPhotoRepository.ts
│   ├── hooks/useGreenMarketRuntime.ts
│   ├── navigation/
│   │   ├── __tests__/NavigationStack.test.ts
│   │   ├── NavigationStack.ts
│   │   └── ScreenRegistry.ts
│   └── runtime/
│       ├── __tests__/GreenMarketRuntime.test.ts
│       └── GreenMarketRuntime.ts
├── react-vite-bootstrap-project/          ← ИСПОЛНЯЕМОЕ приложение Stage 1
│   ├── README.md
│   ├── package.json / package-lock.json
│   ├── index.html
│   ├── vite.config.ts / tsconfig.json / tsconfig.node.json
│   ├── vercel.json
│   ├── .editorconfig / .env.example / .eslintrc.cjs / .gitignore / .prettierrc
│   ├── plugins/localTelemetry.ts         ← Vite-плагин: перехват POST /api/diagnostics, /api/reports
│   ├── vite-dev.log / build2.log / ssh-tunnel.log / ssh-tunnel.err.log / cloudflared-tunnel.log
│   ├── node_modules/                     (не входят в подсчёт/дерево)
│   └── src/
│       ├── main.tsx / vite-env.d.ts
│       ├── app/                            App.tsx, ErrorBoundary.tsx, NavigationContainer.tsx,
│       │                                   RuntimeRouteSync.tsx, MapSurface.tsx, routeMapping.ts,
│       │                                   useIsMobile.ts, useMapFullscreen.ts
│       │                                   + __tests__/RuntimeRouteSync.test.ts
│       ├── buyer_mvp/                      Buyer MVP: api.ts, format.ts, types.ts, buyer_mvp.css,
│       │                                   components/{CategoryTree,OfferCard,PhotoPlaceholder,PhotoStrip,ProductCard,SearchBar}.tsx,
│       │                                   screens/{CatalogScreen,HomeScreen,ProductScreen}.tsx
│       ├── containers/                     BottomSheet.tsx, Modal.tsx, Overlay.tsx, Snackbar.tsx, index.ts, containers.css
│       ├── design-system/                  ThemeContext.ts, ThemeProvider.tsx, useTheme.ts, tokens.css,
│       │                                   tokens/{colors,index,scales,typography}.ts,
│       │                                   components/{Avatar,Button,ListItem,Loader,Overlays,States,Surface,Text,index}.tsx + components.css
│       ├── layout/                         Flex.tsx, Structure.tsx, index.ts, layout.css
│       ├── mocks/index.ts
│       ├── platform-core/                  ← рабочая копия greenmarket/GreenMarket/ + домен Map + доп. файлы
│       │   ├── adapters/SellerCardAdapter.ts + __tests__/SellerCardAdapter.test.ts
│       │   ├── basket/                     (BasketScreen.tsx, adapters/, builders/, viewmodels/)
│       │   ├── BottomSheetDeclarative.tsx
│       │   ├── builders/                   (PurchaseOptionsBuilder, ScreenBuilder, SellerCardBuilder)
│       │   ├── catalog/                    (CatalogScreen.tsx, adapters/, builders/, viewmodels/)
│       │   ├── contracts/                  Action.ts, BusinessEvent.ts, ContentBlock.ts, DomainTypes.ts, LoadState.ts, ViewState.ts
│       │   ├── diagnostics/                ConversionFunnel.ts, Diagnostics.ts, LocalFileSink.ts,
│       │   │                               LocalReportStore.ts, sanitizeTelemetry.ts, telemetrySession.ts
│       │   ├── favorites/                  (FavoritesScreen.tsx, adapters/, builders/, viewmodels/)
│       │   ├── formatting/                 DistanceFormatter, DurationFormatter, InitialsFormatter, PriceFormatter,
│       │   │                               RatingFormatter, SellerStatus, SubtitleFormatter
│       │   ├── map/                        ← домен Map (нет в greenmarket/), 54 файла:
│       │   │   ├── adapters/               MapSheetAdapter.ts + __tests__/MapSheetAdapter.test.ts
│       │   │   ├── builders/MapBuilder.ts
│       │   │   ├── compare.ts
│       │   │   ├── filters/SellerFilters.ts
│       │   │   ├── gis/                    GeoService.ts, LeafletAdapter.tsx, MapAdapter.tsx, MapAdapterTypes.ts,
│       │   │   │                           MapConfig.ts, MarkerStyle.ts, TileFallback.ts, TileProvider.ts
│       │   │   │                           + __tests__/MarkerStyle.test.ts, TileFallback.test.ts
│       │   │   ├── history/SellerHistory.ts + __tests__/SellerHistory.test.ts
│       │   │   ├── persistence/            MapSessionStore.ts, OfflineCacheStore.ts, SellerHistoryStore.ts
│       │   │   │                           + __tests__/MapSessionStore.test.ts, OfflineCacheStore.test.ts, SellerHistoryStore.test.ts
│       │   │   ├── product-search/         ProductSearch.ts + __tests__/ProductSearch.test.ts
│       │   │   ├── recommendations/        SellerRecommendations.ts + __tests__/SellerRecommendations.test.ts
│       │   │   ├── repository/             ApiLocationRepository.ts, ApiSellerRepository.ts, CachedLocationRepository.ts,
│       │   │   │                           CachedSellerRepository.ts, LocationRepository.ts, locationIndex.ts,
│       │   │   │                           mockSellerCatalog.ts, MockSellerRepository.ts, repository.ts,
│       │   │   │                           SellerRepository.ts
│       │   │   │                           + __tests__/MockSellerRepository.test.ts, CachedSellerRepository.test.ts,
│       │   │   │                             ProductSearchRepository.test.ts
│       │   │   ├── routing/                OsrmHttpProvider.ts, PolylineCodec.ts, RouteProvider.ts,
│       │   │   │                           RouteService.ts, RouteServiceFactory.ts
│       │   │   │                           + __tests__/PolylineCodec.test.ts, RouteService.test.ts
│       │   │   ├── runtime/                MapProjection.ts, MapRuntime.ts
│       │   │   │                           + __tests__/MapRuntime.test.ts, MapRuntimeMarkets.test.ts,
│       │   │   │                             MapRuntimeRoute.test.ts, MapSessionRestore.test.ts
│       │   │   └── viewmodels/MapViewModel.ts
│       │   ├── navigation-runtime-layer/   hooks/useGreenMarketRuntime.ts,
│       │   │                               navigation/NavigationStack.ts, ScreenRegistry.ts + __tests__/,
│       │   │                               runtime/GreenMarketRuntime.ts, GreenMarketActionHandlers.ts + __tests__/
│       │   ├── presentation/               DistanceVm, DurationVm, PriceVm, RatingVm, SubtitleParts
│       │   ├── product_card/               (ProductCardScreen.tsx, adapters/, builders/, viewmodels/)
│       │   ├── purchase_options/           (PurchaseOptionsScreen.tsx, adapters/, formatting/, presentation/, viewmodels/)
│       │   ├── screens/                    Basket, Catalog, Favorites, MainScreen, ProductCard, PurchaseOptions,
│       │   │                               ScreenDefinition, Search, SellerCard, SellerCatalog, SellerList (.ts)
│       │   ├── search/                     (SearchScreen.tsx, adapters/, builders/, viewmodels/)
│       │   ├── utils/clipboard.ts
│       │   └── viewmodels/SellerCardViewModel.ts
│       ├── repositories/index.ts
│       ├── screens/                        PlaceholderScreen.tsx,
│       │                                   filter/{SellerFilter.tsx, filter.css},
│       │                                   map/{map.css, MapBottomSheetContent.tsx, MapFabButton.tsx,
│       │                                      MapScreenView.tsx, MapSearchAutocomplete.tsx},
│       │                                   seller-card/{SellerCardActions.tsx, SellerCardHeader.tsx,
│       │                                      SellerCardProducts.tsx, SellerCardRecommendations.tsx,
│       │                                      SellerCardReportDialog.tsx, SellerCardReports.tsx,
│       │                                      SellerCardScreenView.tsx, useSellerCardController.ts, seller-card.css},
│       │                                   seller-list/SellerListScreenView.tsx
│       └── shared/global.css
├── tests_folder/
│   └── tests/
│       ├── TEST_COVERAGE.md
│       └── TZ_TESTING_BUYER_MVP.md
├── _inventory/                             ← эта инвентаризация (исторически — папка `repo/`)
│   ├── CODE_INDEX.md
│   ├── DOCUMENT_INDEX.md
│   ├── FILE_TREE.md
│   └── TRACEABILITY.md
├── examples/
│   ├── BottomSheetDeclarative_3.jsx
│   ├── BottomSheetDeclarative_3.tsx.jsx
│   └── types.ts.txt
├── greenmarket-server.bat
├── vite-dev.log
└── vite-dev-err.log
```

## Изменения против предыдущей редакции FILE_TREE.md

### Обновление 2026-08-17 (против версии 2026-08)

1. **Добавлен экран карточки продавца** (`src/screens/seller-card/`, 9 файлов): SellerCardScreenView.tsx (главный компонент экрана), SellerCardHeader.tsx, SellerCardActions.tsx, SellerCardProducts.tsx, SellerCardRecommendations.tsx, SellerCardReports.tsx, SellerCardReportDialog.tsx (компоненты), useSellerCardController.ts (хук-контроллер), seller-card.css.
2. **Домен Map расширен с 16 до 54 файлов**: добавлены routing/ (RouteService.ts, RouteServiceFactory.ts, RouteProvider.ts, OsrmHttpProvider.ts, PolylineCodec.ts + 2 теста), persistence/ (MapSessionStore.ts, OfflineCacheStore.ts, SellerHistoryStore.ts + 3 теста), history/ (SellerHistory.ts + тест), product-search/ (ProductSearch.ts + тест), recommendations/ (SellerRecommendations.ts + тест), gis/ (TileFallback.ts, MarkerStyle.ts + 2 теста), repository/ (ApiLocationRepository.ts, ApiSellerRepository.ts, CachedLocationRepository.ts, CachedSellerRepository.ts, LocationRepository.ts, locationIndex.ts, mockSellerCatalog.ts, repository.ts + 3 теста), runtime/ (MapProjection.ts + 3 теста: MapRuntimeMarkets, MapRuntimeRoute, MapSessionRestore), compare.ts.
3. **Добавлены утилиты**: formatting/SellerStatus.ts, formatting/DurationFormatter.ts, formatting/InitialsFormatter.ts, utils/clipboard.ts.
4. **Добавлены компоненты инфраструктуры**: app/MapSurface.tsx (полноэкранный контейнер карты), app/useMapFullscreen.ts (Fullscreen API), app/useIsMobile.ts (matchMedia), app/routeMapping.ts (чистый маппинг pathname ↔ NavigationEntry), screens/map/MapSearchAutocomplete.tsx (автодополнение поиска на карте).
5. **Расширены diagnostics/**: добавлены ConversionFunnel.ts, LocalFileSink.ts, LocalReportStore.ts, sanitizeTelemetry.ts, telemetrySession.ts (ранее был только Diagnostics.ts).
6. **Добавлен navigation-runtime-layer/runtime/GreenMarketActionHandlers.ts** + тест — реальные обработчики действий (START_ROUTE → ROUTE_STARTED).
7. **Добавлен plugins/localTelemetry.ts** — Vite-плагин для перехвата POST-запросов /api/diagnostics и /api/reports.
8. **Удалены**: full_changes.diff, archive/ (zip-снимок), AI-first_Engineering_Process.md.
9. **Добавлены лог-файлы**: build2.log, ssh-tunnel.log, ssh-tunnel.err.log, cloudflared-tunnel.log (в react-vite-bootstrap-project/).
10. **Счётчик 290 → 349.** Разница: +18 .ts (map domain expansion + utils + diagnostics), +2 .tsx (MapSurface, MapSearchAutocomplete), −1 .md (удалён AI-first_Engineering_Process.md), +4 .log (новые логи), −1 .diff, −1 .zip, +1 .editorconfig, +1 .prettierrc.
