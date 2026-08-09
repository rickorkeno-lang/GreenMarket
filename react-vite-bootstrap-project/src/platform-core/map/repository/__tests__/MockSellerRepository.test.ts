import assert from "node:assert/strict";
import { asSellerId } from "../../../contracts/Action";
import { MockSellerRepository } from "../MockSellerRepository";

/** Формат — как в MockSellerProductPhotoRepository.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/repository/__tests__/MockSellerRepository.test.ts */

async function run() {
  const all = await MockSellerRepository.getAllSellers();

  assert.ok(all.length >= 20, "getAllSellers: каталог содержит не менее 20 продавцов (IMP-003.1 §14)");
  assert.ok(all.length <= 50, "getAllSellers: каталог не превышает 50 продавцов (IMP-003.1 §14)");

  const ids = new Set(all.map((s) => s.sellerId));
  assert.equal(ids.size, all.length, "getAllSellers: sellerId уникальны");

  assert.ok(all.every((s) => s.name.length > 0), "getAllSellers: у каждого продавца есть название");
  assert.ok(all.every((s) => s.categories.length > 0), "getAllSellers: у каждого продавца есть категории");
  assert.ok(all.every((s) => s.rating >= 3.5 && s.rating <= 4.9), "getAllSellers: рейтинги в пределах 3.5..4.9");

  const onlyVisible = await MockSellerRepository.getVisibleSellers({
    north: all[0].location.lat + 0.0001,
    south: all[0].location.lat - 0.0001,
    east: all[0].location.lng + 0.0001,
    west: all[0].location.lng - 0.0001,
  });
  assert.ok(
    onlyVisible.length < all.length,
    "getAllSellers: отдаёт полный каталог, а не только видимую на карте область"
  );

  // Поиск по названию: «ё» и «е» считаются одинаковыми (нормализация).
  const medoviy = await MockSellerRepository.searchSellers("мёдовый");
  assert.ok(
    medoviy.some((s) => s.name === "Медовый край"),
    "searchSellers: «ё» в запросе находит «е» в названии продавца"
  );

  const honey = await MockSellerRepository.searchSellers("медовый");
  assert.ok(
    honey.some((s) => s.name === "Медовый край"),
    "searchSellers: поиск находит по подстроке названия"
  );

  const found = await MockSellerRepository.findSeller("мёдовый");
  assert.equal(found?.name, "Медовый край", "findSeller: «ё» в запросе находит «е» в названии продавца");

  // «Поиск продавцов»: результат в радиусе от точки поиска, отсортирован по
  // расстоянию и содержит реальное distanceMeters от точки (не от центра
  // территории). Сортировка по ключу "distance" — как из мастера на карте.
  const origin = all[0].location;
  const atOrigin = await MockSellerRepository.searchSellersNear({
    origin,
    radiusMeters: 10,
    sort: { key: "distance" },
  });
  assert.equal(atOrigin.length, 1, "searchSellersNear: в радиусе 10 м — только продавец в точке поиска");
  assert.equal(atOrigin[0].sellerId, all[0].sellerId, "searchSellersNear: ближайший — сам продавец в точке");
  assert.equal(atOrigin[0].distanceMeters, 0, "searchSellersNear: distanceMeters пересчитан от точки поиска");

  const wide = await MockSellerRepository.searchSellersNear({
    origin,
    radiusMeters: 10000,
    sort: { key: "distance" },
  });
  assert.ok(wide.length > 1, "searchSellersNear: в радиусе 10 км — несколько продавцов");
  assert.ok(
    wide.every((s, i) => i === 0 || wide[i - 1].distanceMeters <= s.distanceMeters),
    "searchSellersNear: отсортированы по расстоянию по возрастанию"
  );
  assert.ok(wide.every((s) => s.distanceMeters <= 10000), "searchSellersNear: все продавцы в радиусе поиска");

  // --- Карточка продавца (ТЗ-025 §12): доменная SellerCardViewModel. ---
  const firstSeller = all[0];
  const card = await MockSellerRepository.getSellerCard(firstSeller.sellerId);

  assert.equal(card.loadState, "ready", "getSellerCard: существующий продавец → ready");
  assert.equal(card.seller.id, firstSeller.sellerId, "getSellerCard: id продавца совпадает");
  assert.equal(card.seller.name, firstSeller.name, "getSellerCard: название совпадает");
  assert.ok(card.seller.distance.length > 0, "getSellerCard: расстояние отформатировано строкой");
  assert.equal(card.basketProducts.length, 4, "getSellerCard: товары «из вашей покупки» — 4");
  assert.equal(card.otherProducts.length, 4, "getSellerCard: остальные товары — 4");
  assert.equal(card.coverage.total, card.basketProducts.length, "getSellerCard: покрытие по товарам из покупки");
  assert.equal(
    card.coverage.have,
    card.basketProducts.filter((p) => p.availability === "available").length,
    "getSellerCard: have = число доступных товаров из покупки"
  );
  assert.ok(card.photos.length >= 3, "getSellerCard: превью-заглушки (placeholder)");
  assert.ok(card.availableActions.length > 0, "getSellerCard: кнопки действий заполнены");
  assert.ok(
    card.basketProducts.every((p) => p.id && p.name && p.unit && p.price > 0),
    "getSellerCard: товары заполнены полностью"
  );

  const missingCard = await MockSellerRepository.getSellerCard(asSellerId("seller-does-not-exist"));
  assert.equal(missingCard.loadState, "error", "getSellerCard: неизвестный продавец → error");

  // --- Каталог товаров продавца (страница продавца). ---
  const productCatalog = await MockSellerRepository.getSellerProducts(firstSeller.sellerId);
  assert.equal(productCatalog.length, 8, "getSellerProducts: по 4 товара из каждой из 2 категорий");
  assert.equal(
    new Set(productCatalog.map((p) => p.id)).size,
    productCatalog.length,
    "getSellerProducts: id товаров уникальны"
  );
  assert.ok(
    productCatalog.every((p) => p.emoji.length > 0 && p.description.length > 0),
    "getSellerProducts: эмодзи и описание заполнены"
  );
  const availabilityRank = (availability?: string) =>
    availability === "available" ? 0 : availability === "replacement" ? 1 : 2;
  assert.ok(
    productCatalog.every(
      (p, i) => i === 0 || availabilityRank(productCatalog[i - 1].availability) <= availabilityRank(p.availability),
    ),
    "getSellerProducts: сортировка доступные → замены → отсутствующие"
  );

  // --- Рекомендации: похожие продавцы по общим категориям. ---
  const recommendations = await MockSellerRepository.getRecommendedSellers(firstSeller.sellerId);
  assert.ok(
    recommendations.every((r) => r.seller.sellerId !== firstSeller.sellerId),
    "getRecommendedSellers: текущий продавец не в списке"
  );
  assert.ok(
    recommendations.every((r) => r.commonCategories > 0),
    "getRecommendedSellers: только продавцы с общими категориями"
  );
  const recRank = (r: { allCategoriesShared: boolean; commonCategories: number }) =>
    (r.allCategoriesShared ? 1000 : 0) + r.commonCategories;
  assert.ok(
    recommendations.every(
      (r, i) => i === 0 || recRank(recommendations[i - 1]) >= recRank(r),
    ),
    "getRecommendedSellers: сначала все общие категории, затем убывание числа общих"
  );

  console.log("MockSellerRepository: все проверки пройдены");
}

run();
