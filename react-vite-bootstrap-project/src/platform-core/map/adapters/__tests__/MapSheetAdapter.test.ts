import assert from "node:assert/strict";
import { asSellerId } from "../../../contracts/Action";
import { asCategoryId } from "../../../contracts/DomainTypes";
import type { ContentBlock } from "../../../contracts/ContentBlock";
import type { MapViewModel, SellerMapRecord, SellerSearchState } from "../../viewmodels/MapViewModel";
import { MapSheetAdapter } from "../MapSheetAdapter";

/** Формат — как в MapRuntime.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/adapters/__tests__/MapSheetAdapter.test.ts */

function seller(id: number): SellerMapRecord {
  return {
    sellerId: asSellerId(`seller-${id}`),
    name: `Продавец ${id}`,
    location: { lat: 50.11, lng: 8.68 },
    rating: 4.2,
    distanceMeters: 500,
    categories: [asCategoryId("vegetables")],
    categoryNames: ["Овощи и фрукты"],
    photoUrl: null,
    isOpenNow: true,
    workingHoursLabel: "Открыто до 20:00",
    isAvailable: true,
  };
}

function sellerSearch(overrides: Partial<SellerSearchState> = {}): SellerSearchState {
  return {
    origin: null,
    originLabel: null,
    radiusMeters: 5000,
    rawResults: null,
    results: [],
    ...overrides,
  };
}

function viewModel(overrides: Partial<MapViewModel>): MapViewModel {
  return {
    state: "success",
    sellers: [],
    selectedSellerId: null,
    userLocation: null,
    camera: { center: { lat: 50.11, lng: 8.68 }, zoom: 13 },
    bottomSheet: "sellerSearchOrigin",
    sellerSearch: sellerSearch(),
    searchSuggestions: { query: "", loading: false, rawSuggestions: [], suggestions: [] },
    currentAreaLabel: null,
    ...overrides,
  };
}

/** Проекция блоков в простые структуры для сравнения. */
function summary(blocks: ContentBlock[]): unknown[] {
  return blocks.map((b) => {
    switch (b.type) {
      case "sectionLabel":
        return { type: "sectionLabel", text: b.text };
      case "text":
        return { type: "text", text: b.text };
      case "empty":
        return { type: "empty", text: b.text };
      case "list":
        return {
          type: "list",
          count: b.items.length,
          firstAvatar: b.items[0]?.avatar ?? null,
          firstAction: b.items[0]?.action ?? null,
        };
      default:
        return { type: b.type };
    }
  });
}

async function run() {
  // Шаг 1 мастера — выбор точки: заголовок и две строки (📍 геолокация,
  // 🧭 центр экрана). Рендерится независимо от состояния карты.
  const originStep = MapSheetAdapter.toBlocks(viewModel({ bottomSheet: "sellerSearchOrigin" }));
  assert.deepEqual(summary(originStep), [
    { type: "sectionLabel", text: "Поиск продавцов" },
    {
      type: "list",
      count: 2,
      firstAvatar: "📍",
      firstAction: { type: "SEARCH_ORIGIN_MY_LOCATION" },
    },
  ], "шаг выбора точки: заголовок + строки «Моё местоположение» и «Положение на карте»");

  // Шаг 2: поиск ещё не ответил (rawResults = null) — скелетон.
  const loadingResults = MapSheetAdapter.toBlocks(viewModel({ bottomSheet: "sellerSearchResults" }));
  assert.deepEqual(summary(loadingResults), [{ type: "skeleton" }], "результаты ещё не пришли — скелетон");

  // Шаг 2: результаты пришли — заголовок, строка о радиусе/точке, список по
  // расстоянию.
  const withResults = MapSheetAdapter.toBlocks(
    viewModel({
      bottomSheet: "sellerSearchResults",
      sellerSearch: sellerSearch({
        originLabel: "Моё местоположение",
        rawResults: [seller(3), seller(4)],
        results: [seller(3), seller(4)],
      }),
    }),
  );
  assert.deepEqual(summary(withResults), [
    { type: "sectionLabel", text: "Результаты поиска" },
    { type: "text", text: "В радиусе 5 км от Моё местоположение · по расстоянию" },
    {
      type: "list",
      count: 2,
      firstAvatar: "🏪",
      firstAction: { type: "SELECT_SELLER", payload: { sellerId: asSellerId("seller-3") } },
    },
  ], "результаты: заголовок, строка о радиусе и список по расстоянию");

  // В радиусе никого нет совсем (rawResults пуст).
  const emptyRadius = MapSheetAdapter.toBlocks(
    viewModel({
      bottomSheet: "sellerSearchResults",
      sellerSearch: sellerSearch({ originLabel: "Положение на карте", rawResults: [], results: [] }),
    }),
  );
  assert.deepEqual(summary(emptyRadius), [
    { type: "sectionLabel", text: "Результаты поиска" },
    { type: "text", text: "В радиусе 5 км от Положение на карте · по расстоянию" },
    { type: "empty", text: "Продавцы в радиусе 5 км не найдены" },
  ], "в радиусе пусто — сообщение с радиусом");

  // В радиусе есть продавцы, но все отсечены фильтром (rawResults не пуст,
  // results пуст) — подсказка поменять фильтр.
  const filteredOut = MapSheetAdapter.toBlocks(
    viewModel({
      bottomSheet: "sellerSearchResults",
      sellerSearch: sellerSearch({ rawResults: [seller(1)], results: [] }),
    }),
  );
  assert.deepEqual(summary(filteredOut), [
    { type: "sectionLabel", text: "Результаты поиска" },
    { type: "text", text: "В радиусе 5 км от точки поиска · по расстоянию" },
    { type: "empty", text: "Нет продавцов, подходящих под фильтр" },
  ], "все отсечены фильтром — подсказка про фильтр");

  // Карточка продавца из результатов поиска, которого нет в видимой области:
  // пустая область не должна прятать карточку.
  const cardFromSearch = MapSheetAdapter.toBlocks(
    viewModel({
      bottomSheet: "sellerSummary",
      selectedSellerId: asSellerId("seller-7"),
      sellerSearch: sellerSearch({ rawResults: [seller(7)], results: [seller(7)] }),
    }),
  );
  assert.equal(
    cardFromSearch.find((b) => b.type === "sectionLabel")?.text,
    "Продавец 7",
    "карточка построена из продавца результатов поиска даже при пустой области"
  );

  console.log("MapSheetAdapter: все проверки пройдены");
}

run();
