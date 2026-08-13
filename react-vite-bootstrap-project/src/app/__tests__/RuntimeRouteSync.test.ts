import assert from "node:assert/strict";
import { entryFromPath, pathFromEntry } from "../routeMapping";

/**
 * Отображение pathname ↔ NavigationEntry (routeMapping.ts) при модели ТЗ-024:
 * карта — корневая поверхность (URL /map → Main), а SellerCard/SellerList —
 * контент Bottom Sheet ПОВЕРХ карты, у них НЕТ URL и НЕТ страниц (deep-link
 * на /seller/:id и /seller-list больше не поддерживается).
 *
 * Запуск: npx tsx src/app/__tests__/RuntimeRouteSync.test.ts
 */
function run() {
  // Карта-поверхность: /map → Main (главный экран Bottom Sheet поверх карты).
  assert.deepEqual(entryFromPath("/map"), { screen: "Main", params: {} }, "/map → Main");

  // Контент панели (SellerCard/SellerList) — не страницы: deep-link не работает.
  assert.equal(entryFromPath("/seller/seller-2"), null, "нет страницы продавца → null");
  assert.equal(entryFromPath("/seller/seller-2/"), null, "хвостовой слэш не меняет: по-прежнему null");
  assert.equal(entryFromPath("/seller/"), null, "пустой id → null");
  assert.equal(entryFromPath("/seller-list"), null, "нет страницы списка → null");

  // Статические пути не затронуты.
  assert.deepEqual(entryFromPath("/"), { screen: "Catalog", params: {} }, "/ → Catalog");
  assert.deepEqual(entryFromPath("/catalog"), { screen: "Catalog", params: {} }, "/catalog → Catalog");

  // Неизвестный путь — null: RuntimeRouteSync ничего не синхронизирует.
  assert.equal(entryFromPath("/unknown"), null, "неизвестный путь → null");

  // Runtime → URL: только у экранов с URL (Catalog/Main). Контент панели URL
  // не имеет — адресная строка остаётся /map, пока открыта карточка/список.
  assert.equal(pathFromEntry({ screen: "Catalog", params: {} }), "/catalog", "Catalog → /catalog");
  assert.equal(pathFromEntry({ screen: "Main", params: {} }), "/map", "Main → /map");
  assert.equal(
    pathFromEntry({ screen: "SellerCard", params: { sellerId: "seller-2" } }),
    null,
    "SellerCard не имеет URL (контент панели, ТЗ-024)",
  );
  assert.equal(pathFromEntry({ screen: "SellerList", params: {} }), null, "SellerList не имеет URL");

  console.log("RuntimeRouteSync routeMapping: все проверки пройдены");
}

run();
