import assert from "node:assert/strict";

/** Формат — как в MapRuntime.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/runtime/__tests__/MapSessionRestore.test.ts
 *
 *  Проверяет полный путь восстановления сеанса: localStorage → MapSessionStore
 *  → withRestoredSession в MapRuntime. localStorage мокается ДО динамического
 *  импорта MapRuntime, чтобы снапшот «предыдущего сеанса» был прочитан уже при
 *  создании runtime (как в реальном браузере при открытии страницы). */

const storage = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  get length() {
    return storage.size;
  },
} as Storage;

// «Предыдущий сеанс»: карта стояла на Франкфурте (zoom 15), фильтр «Овощи и
// фрукты» + «Только открытые», в строке поиска «Медовый», открыт мастер
// «Поиск продавцов» с точкой «Моё местоположение» (радиус 2.5 км) и открыта
// карточка продавца «Медовый край» (seller--1).
//
// Данные карточки в снапшоте намеренно УСТАРЕЛИ (isOpenNow=true, «Открыто до
// 20:00»), а в каталоге у seller--1 isOpenNow=false («Открывается в 09:00»):
// карточка обязана сначала мгновенно отрисоваться со снапшотом (замечание №5 —
// снапшот здесь не «спорная модель», а осознанный UX мгновенного рендера),
// но затем MapRuntime принудительно актуализирует её через Repository.getSeller
// (requestSellerRefresh), и данные заменяются свежими.
const seeded = {
  viewport: { center: { lat: 50.12, lng: 8.66 }, zoom: 15 },
  selectedFilters: { category: ["vegetables"], state: ["open"] },
  searchQuery: "Медовый",
  searchRadiusKm: "2.5",
  sellerSearch: {
    origin: { lat: 50.11, lng: 8.68 },
    originLabel: "Моё местоположение",
    radiusMeters: 2500,
  },
  bottomSheet: {
    type: "sellerSummary",
    sellerId: "seller--1",
    seller: {
      sellerId: "seller--1",
      name: "Медовый край",
      location: { lat: 50.12, lng: 8.66 },
      rating: 4.8,
      distanceMeters: 400,
      categories: ["vegetables"],
      categoryNames: ["Овощи и фрукты"],
      photoUrl: null,
      isOpenNow: true,
      workingHoursLabel: "Открыто до 20:00",
      isAvailable: true,
    },
  },
};
storage.set("gm.map.session.v2", JSON.stringify(seeded));

const { MapRuntime } = await import("../MapRuntime");

const s = MapRuntime.getState();

// Позиция и масштаб восстановлены — карта открывается там, где её оставили.
assert.deepEqual(s.mapCenter, { lat: 50.12, lng: 8.66 }, "центр карты восстановлен");
assert.equal(s.zoom, 15, "масштаб восстановлен");

// Фильтр восстановлен (единая сущность для карты/списка/мастера).
assert.deepEqual(s.selectedFilters, { category: ["vegetables"], state: ["open"] }, "фильтр восстановлен");

// Мастер «Поиск продавцов» восстановлен: точка, подпись, радиус.
assert.deepEqual(s.sellerSearch.origin, { lat: 50.11, lng: 8.68 }, "точка поиска восстановлена");
assert.equal(s.sellerSearch.originLabel, "Моё местоположение", "подпись точки восстановлена");
assert.equal(s.sellerSearch.radiusMeters, 2500, "радиус поиска восстановлен");

// Открытая карточка восстановлена: выбор продавца + МГНОВЕННЫЙ рендер из
// снапшота сеанса (продавец может быть вне видимой области — данные берутся
// из searchResult до ответа Repository).
assert.equal(s.bottomSheet, "sellerSummary", "открытая панель восстановлена");
assert.equal(s.selectedSellerId, "seller--1", "выбор продавца восстановлен");
assert.equal(s.searchResult?.[0]?.sellerId, "seller--1", "данные карточки восстановлены в searchResult");
assert.equal(s.searchResult?.[0]?.name, "Медовый край", "мгновенный рендер: имя из снапшота");
assert.equal(s.searchResult?.[0]?.isOpenNow, true, "мгновенный рендер: статус из снапшота (устаревший)");

// Незапоминаемое состояние остаётся базовым: результаты поиска не храним,
// видимая область/категории перезапрашиваются репозиторием.
assert.equal(s.sellerSearch.rawResults, null, "результаты мастера не храним");
assert.equal(s.visibleSellers.length, 0, "видимая область не хранится (грузится репозиторием)");
assert.equal(s.categories.length, 0, "категории не хранятся (грузится репозиторием)");

// Замечание №5: MapRuntime при восстановлении карточки ПАРАЛЛЕЛЬНО вызывает
// Repository.getSeller — после ответа searchResult заменяется актуальными
// данными, а не остаётся устаревшим снапшотом (isOpenNow/часы работы свежие).
await new Promise((resolve) => setTimeout(resolve, 400));
const refreshed = MapRuntime.getState();
assert.equal(
  refreshed.searchResult?.[0]?.sellerId,
  "seller--1",
  "после refresh карточка по-прежнему указывает на выбранного продавца",
);
assert.equal(
  refreshed.searchResult?.[0]?.isOpenNow,
  false,
  "актуализация: isOpenNow взят из Repository, а не из снапшота",
);
assert.equal(
  refreshed.searchResult?.[0]?.workingHoursLabel,
  "Открывается в 09:00",
  "актуализация: часы работы взяты из Repository",
);

console.log("MapSessionRestore: все проверки пройдены");
