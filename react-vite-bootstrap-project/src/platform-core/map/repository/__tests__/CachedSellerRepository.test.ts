import assert from "node:assert/strict";

/** Формат — как в MapSessionStore.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/repository/__tests__/CachedSellerRepository.test.ts */

// Мок localStorage на globalThis ДО вызова кэша: getStorage() видит его через
// typeof localStorage и использует для write/read (паттерн MapSessionStore.test.ts).
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

import type { MapBounds, MarketMapRecord, SellerMapRecord } from "@/platform-core/map/viewmodels/MapViewModel";
import type { SellerRepository } from "../SellerRepository";
import { isMockSeller, MockSellerRepository } from "../MockSellerRepository";
import { OfflineCacheStore } from "../../persistence/OfflineCacheStore";
import { withOfflineCache } from "../CachedSellerRepository";

/* ==== Доменные фикстуры (реальный продавец seller-6, как в БД бэкенда) ==== */

const marketA: MarketMapRecord = {
  marketId: "market-1",
  name: "Рынок А",
  type: "MARKET",
  address: "ул. А",
  location: { lat: 55.79, lng: 49.1 },
  sellerCount: 3,
};
const marketB: MarketMapRecord = {
  marketId: "market-2",
  name: "Лавка Б",
  type: "SHOP",
  address: "ул. Б",
  location: { lat: 56.0, lng: 50.0 },
  sellerCount: 1,
};

const sellerRecord: SellerMapRecord = {
  sellerId: "seller-6",
  name: "Медовый край",
  location: { lat: 55.8, lng: 49.11 },
  categories: [],
  categoryNames: [],
  photoUrl: null,
};

const products = [
  { id: "product-1", name: "Мёд", price: 300, unit: "кг", availability: "available", categoryId: "vegetables", emoji: "🍯", description: "", tags: [] },
  { id: "product-2", name: "Пыльца", price: 400, unit: "кг", availability: "available", categoryId: "vegetables", emoji: "🍯", description: "", tags: [] },
];

const networkUnreachable = async () => {
  throw new TypeError("Failed to fetch");
};

/** Фейковый «сетевой» источник: гибрид-композиция (как repository.ts), где
 *  сетевые методы заменяются на управляемые заглушки, а мок-продавцы
 *  маршрутизируются в MockSellerRepository (по знаку id), остальное — Mock. */
let lastMarketsBounds: MapBounds | null = null;
function makeFake(overrides: Partial<SellerRepository> = {}): SellerRepository {
  return {
    ...MockSellerRepository,
    getVisibleMarkets: async (bounds) => {
      lastMarketsBounds = bounds;
      return [marketA, marketB];
    },
    getMarketSellers: async () => [
      { sellerId: "seller-6", name: "Медовый край", row: "Ряд 1", place: "Место 3", workingHours: null, shortDescription: null, productCount: 2 },
    ],
    getSeller: async (id) =>
      isMockSeller(id) ? MockSellerRepository.getSeller(id) : id === sellerRecord.sellerId ? sellerRecord : null,
    getSellerCard: async (id) =>
      (isMockSeller(id) ? MockSellerRepository.getSellerCard(id) : { sellerId: "seller-6", name: "Медовый край" }) as never,
    getSellerProducts: async (id) =>
      isMockSeller(id) ? MockSellerRepository.getSellerProducts(id) : products,
    ...overrides,
  };
}

async function run() {
  OfflineCacheStore.clear();

  // ---- Write-through: успех пишет кэш и возвращает свежие данные ----

  {
    const repo = withOfflineCache(makeFake());
    const got = await repo.getSellerProducts("seller-6");
    assert.deepEqual(got, products, "успех возвращает данные как есть (без кэш-слоя)");
    assert.deepEqual(
      OfflineCacheStore.read("seller-products:seller-6"),
      products,
      "успех пишет кэш (write-through)",
    );
  }

  // ---- Offline (TypeError) с кэшем: отдаётся последний удачный ответ ----

  {
    const repo = withOfflineCache(makeFake({ getSellerProducts: networkUnreachable }));
    const got = await repo.getSellerProducts("seller-6");
    assert.deepEqual(got, products, "нет соединения → данные из кэша вместо ошибки");
  }

  // ---- Offline без кэша: ошибка честно пробрасывается (нет фейковых данных) ----

  {
    OfflineCacheStore.clear();
    const repo = withOfflineCache(makeFake({ getSellerProducts: networkUnreachable }));
    await assert.rejects(
      () => repo.getSellerProducts("seller-6"),
      (err) => err instanceof TypeError && /Failed to fetch/.test(String(err.message)),
      "offline без кэша → TypeError пробрасывается",
    );
  }

  // ---- 5xx: то же, что offline (сервис временно не отвечает → кэш) ----

  {
    OfflineCacheStore.clear();
    const serverError = () => {
      throw new Error("HTTP Error: 500");
    };
    const failing = withOfflineCache(makeFake({ getSellerProducts: serverError }));
    await assert.rejects(
      () => failing.getSellerProducts("seller-6"),
      /HTTP Error: 500/,
      "5xx без кэша → ошибка пробрасывается",
    );

    const online = withOfflineCache(makeFake());
    await online.getSellerProducts("seller-6"); // прогрев кэша успешным ответом

    assert.deepEqual(
      await failing.getSellerProducts("seller-6"),
      products,
      "5xx с кэшем → данные из кэша",
    );
  }

  // ---- 4xx: кэш инвалидируется, ошибка пробрасывается ----

  {
    OfflineCacheStore.clear();
    const online = withOfflineCache(makeFake());
    await online.getSellerProducts("seller-6"); // успех пишет кэш
    assert.notEqual(OfflineCacheStore.read("seller-products:seller-6"), null, "кэш прогрет");

    const notFound = () => {
      throw new Error("HTTP Error: 404");
    };
    const failing = withOfflineCache(makeFake({ getSellerProducts: notFound }));
    await assert.rejects(
      () => failing.getSellerProducts("seller-6"),
      /HTTP Error: 404/,
      "4xx → ошибка пробрасывается (продавец удалён — не воскрешаем из кэша)",
    );
    assert.equal(
      OfflineCacheStore.read("seller-products:seller-6"),
      null,
      "4xx → запись кэша удалена",
    );
  }

  // ---- getSeller: «не найден» не кэшируется и чистит старый кэш ----

  {
    const repo = withOfflineCache(makeFake());
    const found = await repo.getSeller("seller-6");
    assert.equal(found?.sellerId, "seller-6", "найденный продавец возвращается");
    assert.deepEqual(OfflineCacheStore.read("seller:seller-6"), sellerRecord, "продавец кэширован");

    const notFound = withOfflineCache(makeFake({ getSeller: async () => null }));
    const miss = await notFound.getSeller("seller-6");
    assert.equal(miss, null, "null → «не существует», а не устаревший кэш");
    assert.equal(
      OfflineCacheStore.read("seller:seller-6"),
      null,
      "онлайн-ответ «не существует» чистит кэш",
    );
  }

  // ---- getVisibleMarkets: кэшируется полный список, фильтруется по bounds ----

  {
    OfflineCacheStore.clear();
    const repo = withOfflineCache(makeFake());
    const aroundA: MapBounds = { north: 55.9, south: 55.7, east: 49.3, west: 49.0 };
    const got = await repo.getVisibleMarkets(aroundA);
    assert.deepEqual(got, [marketA], "онлайн: фильтр по границам применяется на чтении");
    assert.deepEqual(lastMarketsBounds, { north: 90, south: -90, east: 180, west: -180 }, "запрос к источнику — весь мир");
    assert.deepEqual(
      OfflineCacheStore.read("markets"),
      [marketA, marketB],
      "в кэш попадает полный список, а не срез по границам",
    );

    const offline = withOfflineCache(makeFake({ getVisibleMarkets: networkUnreachable }));
    const aroundB: MapBounds = { north: 56.1, south: 55.9, east: 50.2, west: 49.9 };
    assert.deepEqual(await offline.getVisibleMarkets(aroundA), [marketA], "offline: A из кэша, отфильтрован по A");
    assert.deepEqual(await offline.getVisibleMarkets(aroundB), [marketB], "offline: B из кэша, отфильтрован по B");
  }

  // ---- Мок-продавцы (отрицательные id) в кэш не пишутся ----

  {
    OfflineCacheStore.clear();
    const repo = withOfflineCache(makeFake());
    const mockProducts = await repo.getSellerProducts("seller--1");
    assert.deepEqual(mockProducts, await MockSellerRepository.getSellerProducts("seller--1"), "мок-продавцы отдаются из мока");
    assert.equal(OfflineCacheStore.read("seller-products:seller--1"), null, "мок в кэш не пишется");

    const mockSeller = await repo.getSeller("seller--1");
    assert.equal(mockSeller?.sellerId, "seller--1", "мок-продавец отдаётся из мока");
    assert.equal(OfflineCacheStore.read("seller:seller--1"), null, "мок-продавец не кэшируется");
  }

  // ---- Немодифицированные методы делегируются источнику без кэша ----

  {
    const repo = withOfflineCache(makeFake());
    assert.deepEqual(
      await repo.getAllSellers(),
      await MockSellerRepository.getAllSellers(),
      "getAllSellers делегируется в Mock как есть",
    );
    const search = await repo.searchSellers("мёд");
    assert.deepEqual(search, await MockSellerRepository.searchSellers("мёд"), "поиск делегируется без кэша");
  }

  console.log("CachedSellerRepository: все проверки пройдены");
}

run();
