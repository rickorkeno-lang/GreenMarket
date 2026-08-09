import assert from "node:assert/strict";
import { asSellerId, asProductId } from "../../contracts/Action";
import type { SellerCardViewModel } from "../../viewmodels/SellerCardViewModel";
import { SellerCardAdapter } from "../SellerCardAdapter";

/** Формат — как в MockSellerRepository.test.ts: node:assert без test runner'а.
 *  Запуск: npx tsx src/platform-core/adapters/__tests__/SellerCardAdapter.test.ts */

function product(id: string, availability: "available" | "replacement" | "missing" = "available") {
  return { id: asProductId(id), name: `Товар ${id}`, price: 100, unit: "1 шт", availability };
}

function vm(): SellerCardViewModel {
  return {
    loadState: "ready",
    seller: { id: asSellerId("s1"), name: "Продавец", rating: 4.5, distance: "1.2 км" },
    coverage: { have: 2, total: 2, fullyCovered: true },
    importantAlerts: ["Цены могут отличаться"],
    basketProducts: [product("p1", "available"), product("p2", "missing"), product("p3", "replacement")],
    otherProducts: [],
    trustInfo: "Проверенный продавец",
    trustLevel: "high",
    lastConfirmedAt: "позавчера",
    dataMayBeStale: false,
    photos: [],
    availableActions: [],
    reports: [],
    isFavorite: false,
    otherProductsExpanded: true,
  };
}

async function run() {
  const blocks = SellerCardAdapter.toBlocks(vm());

  // ТЗ-025 v1.1 §6: фиксированный порядок — доступные → замены → отсутствующие.
  const productList = blocks.find((b) => b.type === "list");
  assert.ok(productList && productList.type === "list", "adapter: список товаров из покупки");
  assert.deepEqual(
    productList.items.map((i) => i.tag),
    [undefined, "replacement", "missing"],
    "adapter: товары отсортированы доступные → замены → отсутствующие"
  );

  const coverage = blocks.find((b) => b.type === "coverage");
  assert.ok(coverage && coverage.type === "coverage" && coverage.fullyCovered, "adapter: блок покрытия покупки");

  const alerts = blocks.find((b) => b.type === "alerts");
  assert.ok(alerts && alerts.type === "alerts" && alerts.items.length === 1, "adapter: важные уведомления");

  const collapsible = blocks.find((b) => b.type === "collapsible");
  assert.ok(collapsible && collapsible.type === "collapsible" && collapsible.expanded, "adapter: «остальные товары» развёрнуты");

  // Состояния загрузки.
  assert.equal(SellerCardAdapter.toBlocks({ ...vm(), loadState: "loading" })[0].type, "skeleton", "adapter: loading → skeleton");
  const errorBlocks = SellerCardAdapter.toBlocks({ ...vm(), loadState: "error" });
  assert.equal(errorBlocks[0].type, "errorRetry", "adapter: error → errorRetry");

  console.log("SellerCardAdapter: все проверки пройдены");
}

run();
