# GreenMarket — Stage 1 (Bootstrap → исполняемое приложение)

Фронтенд-приложение GreenMarket Stage 1 (React 18 + Vite 5 + TypeScript strict). Начато как
минимальный исполняемый каркас, к настоящему моменту содержит реализованные экраны Buyer MVP,
экран Map и карточку продавца. Запуск из корня репозитория: `greenmarket-server.bat start`
(или команды ниже).

## Требования

- Node.js 18+
- npm 9+

## Запуск

```bash
git clone <repo-url>
cd greenmarket
npm install
npm run dev
```

Приложение откроется на `http://localhost:5173`.

Другие команды:

```bash
npm run build     # production-сборка (tsc + vite build)
npm run preview   # предпросмотр production-сборки
npm run lint      # проверка ESLint
npm run format    # форматирование Prettier
```

## Маршруты

| Маршрут | Экран | Статус |
|---|---|---|
| `/` | Главная (дерево категорий + поиск) | реализован (buyer_mvp) |
| `/catalog` | Каталог (список, сортировка, пагинация) | реализован (buyer_mvp) |
| `/product/:productId` | Карточка товара (офферы, лента фото) | реализован (buyer_mvp) |
| `/map` | Карта продавцов (Leaflet) — полноэкранный route | реализован (screens/map + platform-core/map) |
| `/cart`, `/profile` | Заглушки | заглушки |

> **Примечание:** Список продавцов (`SellerListScreenView`) и карточка продавца (`SellerCardScreenView`) реализованы как контент **Bottom Sheet поверх карты** (ТЗ-024 §9–10), а не как отдельные маршруты. Адресная строка остаётся `/map`, deep-link на `/seller/:id` и `/seller-list` не поддерживается (см. `src/app/routeMapping.ts`).

## Структура

```
src/
  app/             # App Shell: App.tsx, ErrorBoundary, NavigationContainer, RuntimeRouteSync, MapSurface, routeMapping, useIsMobile, useMapFullscreen
  buyer_mvp/       # Buyer MVP: экраны Главная/Каталог/Карточка товара, клиент Catalog API
  containers/      # BottomSheet, Modal, Overlay, Snackbar
  design-system/   # Реализация Design System: токены (colors/typography/scales), тема (ThemeProvider/ThemeContext/useTheme), компоненты
  layout/          # Layout-примитивы (Flex, Structure)
  platform-core/   # Рабочая копия greenmarket/GreenMarket/ (домены + contracts + runtime-слой)
                   # плюс домен Map (IMP-003.1, 54 файла, включая routing/, persistence/, history/, product-search/, recommendations/, gis/, __tests__/)
                   # и доп. файлы (diagnostics/, formatting/SellerStatus, formatting/DurationFormatter, formatting/InitialsFormatter, utils/clipboard)
  screens/         # Экраны приложения:
                   #   map/          — MapScreenView, MapBottomSheetContent, MapFabButton, MapSearchAutocomplete, map.css
                   #   seller-list/  — SellerListScreenView
                   #   seller-card/  — SellerCardScreenView, SellerCardHeader, SellerCardActions, SellerCardProducts,
                   #                   SellerCardRecommendations, SellerCardReports, SellerCardReportDialog,
                   #                   useSellerCardController, seller-card.css
                   #   filter/       — общий выпадающий фильтр SellerFilter + filter.css
                   #   PlaceholderScreen.tsx
  repositories/    # Резерв под существующие репозитории данных
  mocks/           # Резерв под тестовую инфраструктуру
  shared/          # Общие стили
main.tsx           # Точка входа
```

> ⚠️ `src/platform-core/` — рабочая копия эталонной библиотеки доменов из
> `greenmarket/GreenMarket/` корня репозитория. Часть файлов идентична, часть разошлась,
> а домен Map существует только здесь (в `greenmarket/` его нет). Сверка двух копий —
> незакрытая задача (см. `_inventory/CODE_INDEX.md` и `_inventory/TRACEABILITY.md` в корне).

## Используемые технологии

- React 18
- TypeScript (strict mode)
- Vite 5
- React Router 6
- Leaflet / react-leaflet (экран Map)
- OSRM (планируется; код маршрутизации в `src/platform-core/map/routing/`)
- ESLint + Prettier
- EditorConfig

## Команды npm

| Команда           | Назначение                       |
|-------------------|-----------------------------------|
| `npm install`     | установка зависимостей            |
| `npm run dev`     | запуск dev-сервера с hot reload   |
| `npm run build`   | production-сборка (tsc + vite)    |
| `npm run preview` | предпросмотр production-сборки    |
| `npm run lint`    | статическая проверка кода         |
| `npm run format`  | автоформатирование кода           |

## Ограничения этапа

- Реализованы продуктовые сценарии Buyer MVP (Главная/Каталог/Карточка товара), экран Map
  с контентом Bottom Sheet (список продавцов с фильтром, карточка продавца).
- Корзина и профиль — заглушки (`PlaceholderScreen`).
- Backend в репозитории отсутствует: Buyer MVP работает против внешнего REST Catalog API
  (`/catalog/groups`, `/catalog/products`, `/catalog/products/{id}`), см. `src/buyer_mvp/api.ts`.
- Автотесты: unit-тесты в `src/platform-core/navigation-runtime-layer/` и `src/platform-core/map/`
  на `node:assert` (запуск вручную через `npx tsx`, без jest/vitest и без CI);
  Playwright-сценарии Buyer MVP не написаны (см. `tests_folder/TZ_TESTING_BUYER_MVP.md`).
