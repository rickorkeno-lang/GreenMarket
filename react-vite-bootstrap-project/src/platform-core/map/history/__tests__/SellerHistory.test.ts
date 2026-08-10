import assert from "node:assert/strict";
import { asSellerId } from "../../../contracts/Action";
import { asCategoryId } from "../../../contracts/DomainTypes";
import type { SellerMapRecord } from "../../viewmodels/MapViewModel";
import { SELLER_HISTORY_LIMIT, upsertSellerHistory } from "../SellerHistory";

/** Формат — как в MapRuntime.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/history/__tests__/SellerHistory.test.ts */

// Мок localStorage на globalThis ДО импорта SellerHistoryStore: getStorage()
// видит его через typeof localStorage и использует для record/load.
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

const { SellerHistoryStore, normalizeHistory } = await import("../../persistence/SellerHistoryStore");

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

async function run() {
  // ---- upsertSellerHistory: чистая функция ----

  // Новая запись кладётся в начало.
  const one = upsertSellerHistory([], seller(1), 100);
  assert.deepEqual(one.map((e) => e.seller.sellerId), [asSellerId("seller-1")], "первый просмотр — в начало");
  assert.equal(one[0].viewedAt, 100, "время просмотра сохраняется");

  // Повторный просмотр того же продавца не дублируется, а поднимается наверх
  // с новым временем.
  const two = upsertSellerHistory(one, seller(1), 200);
  assert.deepEqual(two.map((e) => e.seller.sellerId), [asSellerId("seller-1")], "повторный просмотр без дублей");
  assert.equal(two[0].viewedAt, 200, "время обновлено");

  // Другой продавец — в начало, предыдущий сдвигается.
  const mixed = upsertSellerHistory(two, seller(2), 300);
  assert.deepEqual(
    mixed.map((e) => e.seller.sellerId),
    [asSellerId("seller-2"), asSellerId("seller-1")],
    "свежий просмотр — первым",
  );

  // Просмотр ранее смотренного продавца поднимает его над более свежими.
  const reVisit = upsertSellerHistory(mixed, seller(1), 400);
  assert.deepEqual(
    reVisit.map((e) => e.seller.sellerId),
    [asSellerId("seller-1"), asSellerId("seller-2")],
    "повторный визит поднимает запись наверх",
  );

  // Лимит: список усекается до SELLER_HISTORY_LIMIT, вытесняются самые старые.
  let history: { seller: SellerMapRecord; viewedAt: number }[] = [];
  for (let i = 0; i < SELLER_HISTORY_LIMIT + 5; i += 1) {
    history = upsertSellerHistory(history, seller(i + 1), i + 1);
  }
  assert.equal(history.length, SELLER_HISTORY_LIMIT, "история ограничена лимитом");
  assert.equal(history[history.length - 1].seller.sellerId, asSellerId(`seller-6`), "вытеснены самые старые");

  // ---- normalizeHistory: валидация «сырой» записи (чистая функция) ----

  assert.deepEqual(normalizeHistory(null), [], "не массив → пусто");
  assert.deepEqual(normalizeHistory("строка"), [], "не массив → пусто");
  assert.deepEqual(normalizeHistory([{ viewedAt: 1 }]), [], "запись без продавца → отбрасывается");
  assert.deepEqual(normalizeHistory([{ seller: seller(1) }]), [], "запись без времени → отбрасывается");
  const normalized = normalizeHistory([{ seller: seller(2), viewedAt: 200 }, { seller: seller(1), viewedAt: 100 }]);
  assert.deepEqual(
    normalized.map((e) => e.seller.sellerId),
    [asSellerId("seller-2"), asSellerId("seller-1")],
    "порядок по убыванию времени просмотра",
  );

  // ---- SellerHistoryStore: round-trip через мок localStorage ----

  SellerHistoryStore.record(seller(1));
  SellerHistoryStore.record(seller(2));
  const loaded = SellerHistoryStore.load();
  assert.deepEqual(
    loaded.map((e) => e.seller.sellerId),
    [asSellerId("seller-2"), asSellerId("seller-1")],
    "record + load: свежие сверху, без дублей",
  );

  // Повторная запись того же продавца обновляет запись, а не добавляет новую.
  SellerHistoryStore.record(seller(1));
  const afterRevisit = SellerHistoryStore.load();
  assert.equal(afterRevisit.length, 2, "повторная запись не создаёт дубль");
  assert.equal(afterRevisit[0].seller.sellerId, asSellerId("seller-1"), "повторно просмотренный — наверху");

  console.log("SellerHistory: все проверки пройдены");
}

run();
