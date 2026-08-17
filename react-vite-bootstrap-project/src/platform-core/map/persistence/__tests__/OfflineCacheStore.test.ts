import assert from "node:assert/strict";

/** Формат — как в MapSessionStore.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/persistence/__tests__/OfflineCacheStore.test.ts */

// Мок localStorage на globalThis ДО вызова сторы: getStorage() видит его через
// typeof localStorage и использует для read/write/remove/clear.
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

const { OfflineCacheStore, normalizeCacheRecord } = await import("../OfflineCacheStore");

async function run() {
  // ---- normalizeCacheRecord: нормализация «сырой» записи (чистая функция) ----

  assert.deepEqual(normalizeCacheRecord(null), {}, "null → пустой кэш");
  assert.deepEqual(normalizeCacheRecord("строка"), {}, "не объект → пустой кэш");
  assert.deepEqual(
    normalizeCacheRecord({ a: 1, b: "x", c: [1, 2], d: { noSavedAt: 1 } }),
    {},
    "записи без валидной пары savedAt/value отбрасываются",
  );

  const raw = {
    markets: { savedAt: 1_700_000_000_000, value: [{ marketId: "market-1" }] },
    "seller-card:seller-6": { savedAt: 1_700_000_000_100, value: { sellerId: "seller-6" } },
  };
  assert.deepEqual(
    normalizeCacheRecord(raw),
    raw,
    "валидные записи сохраняются как есть (savedAt + value)",
  );
  assert.deepEqual(
    normalizeCacheRecord({ ...raw, broken: { savedAt: "вчера", value: 1 } }),
    raw,
    "запись с нечисловым savedAt отбрасывается, остальные целы",
  );

  // ---- OfflineCacheStore: read/write/remove/clear против мока localStorage ----

  assert.equal(OfflineCacheStore.read("markets"), null, "пустое хранилище → null");

  const markets = [{ marketId: "market-1", sellerCount: 3 }];
  OfflineCacheStore.write("markets", markets);
  assert.equal(storage.has("gm.map.offline-cache.v1"), true, "write пишет в версионированный ключ");
  assert.deepEqual(OfflineCacheStore.read("markets"), markets, "read возвращает записанное значение");

  // Перезапись замещает значение по тому же ключу.
  const freshMarkets = [{ marketId: "market-2", sellerCount: 5 }];
  OfflineCacheStore.write("markets", freshMarkets);
  assert.deepEqual(
    OfflineCacheStore.read("markets"),
    freshMarkets,
    "повторный write замещает запись",
  );

  // Разные ключи живут независимо (слой карты: рынки, продавцы, карточка).
  OfflineCacheStore.write("seller-card:seller-6", { sellerId: "seller-6" });
  assert.deepEqual(OfflineCacheStore.read("seller-card:seller-6"), { sellerId: "seller-6" }, "второй ключ цел");
  assert.deepEqual(OfflineCacheStore.read("markets"), freshMarkets, "первый ключ не пострадал");

  // remove удаляет только свой ключ.
  OfflineCacheStore.remove("markets");
  assert.equal(OfflineCacheStore.read("markets"), null, "remove убирает запись");
  assert.deepEqual(OfflineCacheStore.read("seller-card:seller-6"), { sellerId: "seller-6" }, "remove не трогает чужие ключи");
  OfflineCacheStore.remove("markets");
  assert.equal(OfflineCacheStore.read("markets"), null, "remove отсутствующего ключа безопасен");

  // clear — полная очистка.
  OfflineCacheStore.clear();
  assert.equal(OfflineCacheStore.read("seller-card:seller-6"), null, "clear очищает весь кэш");
  assert.deepEqual(storage.get("gm.map.offline-cache.v1"), "{}", "clear оставляет пустой объект в хранилище");

  // ---- Overflow / setItem failure: поведение при переполнении хранилища ----

  // Заполняем кэш данными до симуляции переполнения.
  OfflineCacheStore.write("seller-card:seller-1", { sellerId: "seller-1", name: "До переполнения" });
  const beforeOverflow = OfflineCacheStore.read("seller-card:seller-1");
  assert.deepEqual(beforeOverflow, { sellerId: "seller-1", name: "До переполнения" }, "данные записаны до overflow");

  // Подменяем setItem на бросающий исключение (имитация QuotaExceededError).
  const originalStorage = globalThis.localStorage;
  let setItemCalled = false;
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (_key: string, _value: string) => {
      setItemCalled = true;
      throw new Error("QuotaExceededError");
    },
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() { return storage.size; },
  } as Storage;

  // write не должен выбрасывать исключение наружу (подавляется в writeRecord).
  OfflineCacheStore.write("seller-card:seller-1", { sellerId: "seller-1", name: "После переполнения" });
  assert.equal(setItemCalled, true, "setItem был вызван (даже при переполнении)");

  // Старые данные в localStorage не были перезаписаны (setItem бросил).
  const rawAfterOverflow = JSON.parse(storage.get("gm.map.offline-cache.v1") ?? "{}");
  assert.deepEqual(
    rawAfterOverflow["seller-card:seller-1"]?.value,
    { sellerId: "seller-1", name: "До переполнения" },
    "старые данные в storage не повреждены (setItem не записал)",
  );

  // read возвращает устаревшие данные из storage (write не обновил storage).
  const afterOverflow = OfflineCacheStore.read("seller-card:seller-1");
  assert.deepEqual(
    afterOverflow,
    { sellerId: "seller-1", name: "До переполнения" },
    "read возвращает старые данные (write не прошёл в storage)",
  );

  // remove и clear тоже не должны падать при переполнении.
  OfflineCacheStore.remove("seller-card:seller-1");
  OfflineCacheStore.clear();

  // Восстанавливаем мок.
  (globalThis as Record<string, unknown>).localStorage = originalStorage;

  console.log("OfflineCacheStore: все проверки пройдены");
}

run();
