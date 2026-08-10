import assert from "node:assert/strict";
import type { ProductSearchCandidate } from "../ProductSearch";
import {
  findDirectProductMatches,
  findMostSimilarProduct,
  normalizeProductSearch,
  productCandidateSimilarity,
  PRODUCT_SIMILARITY_THRESHOLD_PERCENT,
  stringSimilarityPercent,
} from "../ProductSearch";

/** Формат — как в остальных тестах: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/product-search/__tests__/ProductSearch.test.ts */

const CANDIDATES: ProductSearchCandidate[] = [
  { name: "Морковь", normalizedName: "морковь", tags: ["морковка", "морква"] },
  { name: "Томаты", normalizedName: "томаты", tags: ["помидор", "помидоры", "томат"] },
  { name: "Мёд цветочный", normalizedName: "мед цветочный", tags: ["мед", "цветочный мед"] },
];

function run() {
  // ---- normalizeProductSearch ----

  assert.equal(normalizeProductSearch("  Мёд Цветочный "), "мед цветочный", "нижний регистр + ё→е + trim");
  assert.equal(normalizeProductSearch(""), "", "пустая строка");

  // ---- stringSimilarityPercent ----

  assert.equal(stringSimilarityPercent("Морковь", "морковь"), 100, "точное совпадение (без учёта регистра) = 100");
  assert.equal(stringSimilarityPercent("мёд", "мед"), 100, "ё и е считаются одинаковыми");
  assert.equal(stringSimilarityPercent("", "морковь"), 0, "пустая строка = 0");
  // Опечатка «морква» vs «морковь»: 1 «о» вставлена — схожесть небольшая,
  // порога «Возможно вы имели в виду» (85%) не достигает; для таких случаев
  // у товара есть тег-синоним «морква».
  assert.ok(stringSimilarityPercent("морква", "морковь") < PRODUCT_SIMILARITY_THRESHOLD_PERCENT, "морква/морковь ниже порога");
  // А «помідор» vs «помидор» — одна замена → 86%, выше порога.
  const score = stringSimilarityPercent("помідор", "помидор");
  assert.ok(score > PRODUCT_SIMILARITY_THRESHOLD_PERCENT, `помідор/помидор выше порога (${score})`);

  // ---- productCandidateSimilarity ----

  assert.equal(
    productCandidateSimilarity("морква", CANDIDATES[0]),
    100,
    "схожесть с кандидатом — максимум по названию/тегам: тег «морква» даёт 100",
  );

  // ---- findDirectProductMatches ----

  assert.deepEqual(findDirectProductMatches("", CANDIDATES), [], "пустой запрос — нет подсказок");
  assert.deepEqual(
    findDirectProductMatches("морк", CANDIDATES).map((c) => c.name),
    ["Морковь"],
    "префикс названия — прямое совпадение",
  );
  assert.deepEqual(
    findDirectProductMatches("помидор", CANDIDATES).map((c) => c.name),
    ["Томаты"],
    "совпадение по тегу-синониму «помидор»",
  );
  assert.deepEqual(
    findDirectProductMatches("мед", CANDIDATES).map((c) => c.name),
    ["Мёд цветочный"],
    "поиск «мед» находит «Мёд» (нормализация ё→е)",
  );

  // Сортировка по релевантности: точное название → префикс → тег.
  const sorted = findDirectProductMatches("томат", CANDIDATES).map((c) => c.name);
  assert.equal(sorted[0], "Томаты", "точный тег «томат» — первым");

  // ---- findMostSimilarProduct («Возможно вы имели в виду») ----

  assert.equal(
    findMostSimilarProduct("помідор", CANDIDATES)?.name,
    "Томаты",
    "опечатка «помідор» → «Томаты» (схожесть >85% по тегу «помидор»)",
  );
  assert.equal(findMostSimilarProduct("сковородка", CANDIDATES), null, "нет похожего товара → null");
  assert.equal(findMostSimilarProduct("", CANDIDATES), null, "пустой запрос → null");

  console.log("ProductSearch: все проверки пройдены");
}

run();
