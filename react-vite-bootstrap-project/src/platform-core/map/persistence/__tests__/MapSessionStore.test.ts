import assert from "node:assert/strict";
import { defaultMapConfig } from "../../gis/MapConfig";
import type { MapSessionSnapshot } from "../MapSessionStore";
import { SELLER_SEARCH_RADIUS_MAX_METERS } from "../../repository/SellerRepository";

/** Формат — как в MapRuntime.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/persistence/__tests__/MapSessionStore.test.ts */

// Мок localStorage на globalThis ДО импорта MapSessionStore: getStorage() видит
// его через typeof localStorage и использует для save/load.
const storage = new Map<string, string>();
let writeCount = 0;
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    writeCount += 1;
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

const { MapSessionStore, normalizeSnapshot } = await import("../MapSessionStore");

/** Базовый валидный «сырой» снапшот (как его клал бы JSON.stringify). */
function rawSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    viewport: { center: { lat: 50.11, lng: 8.68 }, zoom: 13 },
    selectedFilters: { category: ["vegetables"] },
    searchQuery: "мед",
    searchRadiusKm: "2.5",
    sellerSearch: {
      origin: { lat: 50.11, lng: 8.68 },
      originLabel: "Моё местоположение",
      radiusMeters: 2500,
    },
    bottomSheet: null,
    hideMapPois: false,
    ...overrides,
  };
}

function validSnapshot(): MapSessionSnapshot {
  return {
    viewport: { center: { lat: 50.11, lng: 8.68 }, zoom: 13 },
    selectedFilters: { category: ["vegetables"] },
    searchQuery: "мед",
    searchRadiusKm: "2.5",
    sellerSearch: {
      origin: { lat: 50.11, lng: 8.68 },
      originLabel: "Моё местоположение",
      radiusMeters: 2500,
    },
    bottomSheet: null,
    hideMapPois: false,
  };
}

async function run() {
  // ---- normalizeSnapshot: валидация «сырой» записи (чистая функция) ----

  // Не запись вовсе.
  assert.equal(normalizeSnapshot(null), null, "null → не снапшот");
  assert.equal(normalizeSnapshot("строка"), null, "не объект → не снапшот");

  // Без валидной позиции карты запись нечитаема.
  assert.equal(
    normalizeSnapshot(rawSnapshot({ viewport: { center: null, zoom: 13 } })),
    null,
    "нет центра → не снапшот",
  );
  assert.equal(
    normalizeSnapshot(rawSnapshot({ viewport: { center: { lat: 50, lng: 8 }, zoom: "13" } })),
    null,
    "нечисловой zoom → не снапшот",
  );

  // Координаты ужимаются в валидные пределы WGS84.
  const clamped = normalizeSnapshot(
    rawSnapshot({ viewport: { center: { lat: 200, lng: 400 }, zoom: 99 } }),
  );
  assert.ok(clamped, "вырожденные координаты/zoom ужимаются, а не роняют снапшот");
  assert.deepEqual(clamped.viewport.center, { lat: 90, lng: 180 }, "lat/lng зажаты в WGS84");
  assert.equal(clamped.viewport.zoom, defaultMapConfig.maxZoom, "zoom зажат в пределы MapConfig");

  // Мусор в фильтре вычищается: остаются только непустые строковые массивы.
  const filters = normalizeSnapshot(
    rawSnapshot({
      selectedFilters: {
        category: ["vegetables", 42, null],
        state: [],
        garbage: "не массив",
        other: [1, 2],
      },
    }),
  );
  assert.ok(filters, "запись с грязным фильтром читается");
  assert.deepEqual(
    filters.selectedFilters,
    { category: ["vegetables"] },
    "из фильтра остаются только валидные строки непустых массивов",
  );

  // searchRadiusKm выводится из radiusMeters, когда отсутствует в записи.
  const noRadiusText = normalizeSnapshot(rawSnapshot({ searchRadiusKm: undefined }));
  assert.ok(noRadiusText, "запись без searchRadiusKm читается");
  assert.equal(noRadiusText.searchRadiusKm, "2.5", "searchRadiusKm выводится из radiusMeters");
  assert.equal(noRadiusText.searchRadiusKm.slice(0, 3), "2.5", "текст радиуса сохраняется");

  // Радиус ужимается в разумный диапазон: значение больше половины окружности
  // Земли (~20 000 км) зажимается до максимума, но 9 999 км (противоположный
  // конец России) уже в пределах лимита и не трогается.
  const beyondEarth = normalizeSnapshot(
    rawSnapshot({ sellerSearch: { ...rawSnapshot().sellerSearch, radiusMeters: 100_000_000 } }),
  );
  assert.ok(beyondEarth, "запись с огромным радиусом читается");
  assert.equal(beyondEarth.sellerSearch.radiusMeters, SELLER_SEARCH_RADIUS_MAX_METERS, "радиус зажат сверху");

  const crossRussia = normalizeSnapshot(
    rawSnapshot({ sellerSearch: { ...rawSnapshot().sellerSearch, radiusMeters: 9_999_000 } }),
  );
  assert.ok(crossRussia, "запись с радиусом «через всю Россию» читается");
  assert.equal(crossRussia.sellerSearch.radiusMeters, 9_999_000, "радиус в пределах лимита не меняется");

  // Неизвестный тип Bottom Sheet → панель закрыта, остальное читается.
  const unknownSheet = normalizeSnapshot(rawSnapshot({ bottomSheet: { type: "cart" } }));
  assert.ok(unknownSheet, "запись с неизвестной панелью читается");
  assert.equal(unknownSheet.bottomSheet, null, "неизвестная панель → закрыта");

  // sellerSummary: валидный снапшот карточки сохраняется; битый — seller=null.
  const sellerRaw = {
    sellerId: "seller-1",
    name: "Медовый край",
    location: { lat: 50.11, lng: 8.68 },
    rating: 4.2,
    distanceMeters: 300,
    categories: ["vegetables"],
    categoryNames: ["Овощи и фрукты"],
    photoUrl: null,
    isOpenNow: true,
    workingHoursLabel: "Открыто до 20:00",
    isAvailable: true,
  };
  const withCard = normalizeSnapshot(
    rawSnapshot({ bottomSheet: { type: "sellerSummary", sellerId: "seller-1", seller: sellerRaw } }),
  );
  assert.ok(withCard, "запись с карточкой читается");
  assert.equal(withCard.bottomSheet?.type, "sellerSummary", "тип панели сохранён");
  if (withCard.bottomSheet?.type === "sellerSummary") {
    assert.equal(withCard.bottomSheet.sellerId, "seller-1", "sellerId карточки сохранён");
    assert.equal(withCard.bottomSheet.seller?.name, "Медовый край", "данные карточки сохранены");
  }
  const brokenCard = normalizeSnapshot(
    rawSnapshot({ bottomSheet: { type: "sellerSummary", sellerId: "seller-1", seller: { nope: true } } }),
  );
  assert.ok(brokenCard, "запись с битой карточкой читается");
  if (brokenCard.bottomSheet?.type === "sellerSummary") {
    assert.equal(brokenCard.bottomSheet.seller, null, "битые данные карточки отбрасываются");
  }
  const cardWithoutId = normalizeSnapshot(
    rawSnapshot({ bottomSheet: { type: "sellerSummary", seller: sellerRaw } }),
  );
  assert.ok(cardWithoutId, "sellerSummary без sellerId читается");
  assert.equal(cardWithoutId.bottomSheet, null, "панель без sellerId → закрыта");

  // ---- MapSessionStore: save/load/saveThrottled против мока localStorage ----

  // Пустое хранилище — нет записи.
  assert.equal(MapSessionStore.load(), null, "пустое хранилище → null");

  // save → localStorage, load возвращает тот же снапшот (кеш обновлён save'ом).
  const snapshot = validSnapshot();
  MapSessionStore.save(snapshot);
  assert.equal(storage.has("gm.map.session.v2"), true, "save пишет в localStorage");
  assert.deepEqual(MapSessionStore.load(), snapshot, "load возвращает сохранённый снапшот");

  // saveThrottled — троттлинг с trailing-записью: ведущий вызов в окне пишет
  // сразу, вызовы внутри интервала запоминают последний снапшот и пишут его
  // по истечении интервала БЕЗ дополнительного вызова (дефект «теряется
  // последнее изменение» закрыт: в localStorage не остаётся снапшот начала
  // окна, когда вкладка закрылась до следующего разрешённого вызова).
  const writesBefore = writeCount;
  const variantA = { ...snapshot, viewport: { ...snapshot.viewport, zoom: 12 } };
  const variantB = { ...snapshot, viewport: { ...snapshot.viewport, zoom: 11 } };
  MapSessionStore.saveThrottled(variantA);
  MapSessionStore.saveThrottled(variantB);
  assert.equal(
    writeCount,
    writesBefore + 1,
    "ведущий вызов в окне пишет сразу",
  );
  assert.equal(
    MapSessionStore.load()?.viewport.zoom,
    12,
    "ведущий вызов применился",
  );

  // По истечении интервала trailing-запись сохраняет ПОСЛЕДНИЙ снапшот.
  await new Promise((resolve) => setTimeout(resolve, 2_300));
  assert.equal(
    writeCount,
    writesBefore + 2,
    "trailing-запись сработала по таймеру без дополнительного вызова",
  );
  assert.equal(
    MapSessionStore.load()?.viewport.zoom,
    11,
    "последний снапшот сохранён (не начало окна)",
  );

  // Следующий вызов после trailing-записи перезапускает окно (trailing-запись
  // не «пробивает» мгновенную запись) — но последнее изменение снова не
  // теряется: оно пишется по окончании нового окна.
  MapSessionStore.saveThrottled(variantA);
  assert.equal(
    writeCount,
    writesBefore + 2,
    "вызов сразу после trailing-записи не пишет мгновенно (окно перезапущено)",
  );
  await new Promise((resolve) => setTimeout(resolve, 2_300));
  assert.equal(
    writeCount,
    writesBefore + 3,
    "trailing-запись нового окна сохранила последний вызов",
  );
  assert.equal(
    MapSessionStore.load()?.viewport.zoom,
    12,
    "последний снапшот сохранён",
  );

  console.log("MapSessionStore: все проверки пройдены");
}

run();
