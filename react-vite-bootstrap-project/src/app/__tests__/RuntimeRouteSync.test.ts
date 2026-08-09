import assert from "node:assert/strict";
import { entryFromPath } from "../routeMapping";

/**
 * Регрессия на баг deep-link: заход по /seller/seller-2 (или вставка такой
 * ссылки в браузер) раньше сбрасывался на /catalog, т.к. sellerId брался из
 * useParams(), а RuntimeRouteSync рендерится вне <Routes>. Теперь динамический
 * сегмент извлекается прямо из pathname (entryFromPath в routeMapping.ts).
 *
 * Запуск: npx tsx src/app/__tests__/RuntimeRouteSync.test.ts
 */
function run() {
  // Deep-link на страницу продавца: /seller/:sellerId → SellerCard с sellerId.
  assert.deepEqual(
    entryFromPath("/seller/seller-2"),
    { screen: "SellerCard", params: { sellerId: "seller-2" } },
    "deep-link /seller/seller-2 → SellerCard",
  );

  // Хвостовой слэш не должен ломать парсинг id.
  assert.deepEqual(
    entryFromPath("/seller/seller-2/"),
    { screen: "SellerCard", params: { sellerId: "seller-2" } },
    "trailing slash убирается",
  );

  // Пустой id — это не страница продавца.
  assert.equal(entryFromPath("/seller/"), null, "пустой id → null");

  // Статические пути не затронуты.
  assert.deepEqual(entryFromPath("/"), { screen: "Catalog", params: {} }, "/ → Catalog");
  assert.deepEqual(entryFromPath("/catalog"), { screen: "Catalog", params: {} }, "/catalog → Catalog");
  assert.deepEqual(entryFromPath("/map"), { screen: "Map", params: {} }, "/map → Map");
  assert.deepEqual(entryFromPath("/seller-list"), { screen: "SellerList", params: {} }, "/seller-list → SellerList");

  // Неизвестный путь — null: RuntimeRouteSync ничего не синхронизирует.
  assert.equal(entryFromPath("/unknown"), null, "неизвестный путь → null");

  console.log("RuntimeRouteSync entryFromPath: все проверки пройдены");
}

run();
