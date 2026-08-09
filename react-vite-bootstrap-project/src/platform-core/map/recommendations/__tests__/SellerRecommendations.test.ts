import assert from "node:assert/strict";
import { asSellerId } from "../../../contracts/Action";
import { asCategoryId, type CategoryId } from "../../../contracts/DomainTypes";
import type { SellerMapRecord } from "../../viewmodels/MapViewModel";
import { rankRecommendedSellers } from "../SellerRecommendations";

/** Формат — как в MockSellerRepository.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/recommendations/__tests__/SellerRecommendations.test.ts */

function seller(id: number, categories: CategoryId[], distanceMeters = 100): SellerMapRecord {
  return {
    sellerId: asSellerId(`seller-${id}`),
    name: `Продавец ${id}`,
    location: { lat: 50.11, lng: 8.68 },
    rating: 4.0,
    distanceMeters,
    categories,
    categoryNames: categories.map((c) => `Категория ${c}`),
    photoUrl: null,
    isOpenNow: true,
    workingHoursLabel: "Открыто до 20:00",
    isAvailable: true,
  };
}

async function run() {
  const A = asCategoryId("a");
  const B = asCategoryId("b");
  const C = asCategoryId("c");
  const D = asCategoryId("d");

  const current = seller(0, [A, B]);
  const allShared = seller(1, [A, B], 500); // все категории общие
  const allSharedCloser = seller(2, [A, B], 400); // тоже все общие, но ближе
  const oneShared = seller(3, [A, C], 300); // одна общая
  const zeroShared = seller(4, [C, D], 50); // общих нет → отсекается

  const recs = rankRecommendedSellers(current, [allShared, oneShared, zeroShared, allSharedCloser, current]);

  // Сам продавец и продавцы без общих категорий не попадают в результат.
  assert.equal(
    recs.some((r) => r.seller.sellerId === current.sellerId),
    false,
    "сам продавец не входит в рекомендации"
  );
  assert.equal(
    recs.some((r) => r.seller.sellerId === zeroShared.sellerId),
    false,
    "продавцы без общих категорий отсекаются"
  );

  // Порядок: сначала все общие категории, затем убывание числа общих.
  assert.deepEqual(
    recs.map((r) => r.seller.sellerId),
    [allSharedCloser.sellerId, allShared.sellerId, oneShared.sellerId],
    "порядок: все общие категории → убывание числа общих"
  );

  // Атрибуты рекомендаций.
  assert.equal(recs[0].allCategoriesShared, true, "все категории общие → allCategoriesShared");
  assert.equal(recs[0].commonCategories, 2, "число общих категорий");
  assert.equal(recs[1].allCategoriesShared, true);
  assert.equal(recs[2].allCategoriesShared, false, "частичное совпадение");
  assert.equal(recs[2].commonCategories, 1);
  assert.deepEqual(recs[2].sharedCategoryNames, ["Категория a"], "названия общих категорий");

  // Стабильность: тот же вход → тот же порядок.
  const recsAgain = rankRecommendedSellers(current, [allShared, oneShared, zeroShared, allSharedCloser, current]);
  assert.deepEqual(
    recsAgain.map((r) => r.seller.sellerId),
    recs.map((r) => r.seller.sellerId),
    "детерминированный порядок"
  );

  console.log("SellerRecommendations: все проверки пройдены");
}

run();
