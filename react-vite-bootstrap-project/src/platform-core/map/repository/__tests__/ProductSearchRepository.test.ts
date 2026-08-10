import assert from "node:assert/strict";
import { MockSellerRepository } from "../MockSellerRepository";

/** Интеграционный тест поиска по товарам на реальном mock-каталоге.
 *  Запуск: npx tsx src/platform-core/map/repository/__tests__/ProductSearchRepository.test.ts */

async function run() {
  // ---- Автодополнение названий товаров (подсказки) ----

  const bySynonym = await MockSellerRepository.searchProductNames("помидор");
  assert.ok(bySynonym.some((s) => s.name === "Томаты"), "тег «помидор» даёт товар «Томаты»");
  assert.ok(bySynonym.every((s) => s.sellerCount > 0 && s.minPrice > 0), "у каждого товара есть продавцы и цена");

  const byPrefix = await MockSellerRepository.searchProductNames("мол");
  assert.ok(byPrefix.some((s) => s.name === "Молоко"), "префикс «мол» даёт «Молоко»");

  // ---- Поиск продавцов по товару (прямое совпадение) ----

  const direct = await MockSellerRepository.searchSellersByProduct("помидоры");
  assert.equal(direct.matchedProduct, "Томаты", "прямое совпадение по тегу — товар «Томаты»");
  assert.equal(direct.suggestedProduct, null, "прямое совпадение — без «Возможно вы имели в виду»");
  assert.ok(direct.sellers.length > 0, "продавцы с этим товаром есть");
  // Сортировка продавцов «как обычно» — по расстоянию.
  const distances = direct.sellers.map((m) => m.seller.distanceMeters);
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b), "продавцы отсортированы по расстоянию");
  // У каждого продавца — цена на товар.
  assert.ok(direct.sellers.every((m) => m.price > 0 && m.unit.length > 0), "цена и единица у каждого совпадения");

  // ---- «Возможно вы имели в виду» (опечатка, схожесть >85%) ----

  const suggested = await MockSellerRepository.searchSellersByProduct("помідор");
  assert.equal(suggested.matchedProduct, null, "прямых совпадений нет");
  assert.equal(suggested.suggestedProduct, "Томаты", "«имели в виду» — «Томаты»");
  assert.ok(suggested.sellers.length > 0, "сразу предлагаются продавцы с ценой");

  // ---- Совсем нет совпадений ----

  const nothing = await MockSellerRepository.searchSellersByProduct("сковородка");
  assert.equal(nothing.matchedProduct, null, "нет прямого товара");
  assert.equal(nothing.suggestedProduct, null, "нет и похожего товара");
  assert.deepEqual(nothing.sellers, [], "продавцов нет");

  // ---- Пустой запрос ----

  assert.deepEqual(await MockSellerRepository.searchProductNames(""), [], "пустой запрос — пустые подсказки");
  assert.deepEqual((await MockSellerRepository.searchSellersByProduct("")).sellers, [], "пустой запрос — пустые продавцы");

  console.log("ProductSearchRepository: все проверки пройдены");
}

run();
