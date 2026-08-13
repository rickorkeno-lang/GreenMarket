import assert from "node:assert/strict";
import { asMarketId, asSellerId } from "../../../contracts/Action";
import type { MarketMapRecord, MarketSellerRecord } from "../../viewmodels/MapViewModel";
import { MapRuntime } from "../MapRuntime";

/** Формат — как в MapRuntime.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/runtime/__tests__/MapRuntimeMarkets.test.ts
 *
 *  Попап точки торговли (задача «Маркеты») тестируется через reducer-действия
 *  (MARKETS_*, SELECT_MARKET, MARKET_SELLERS_*): сеть не дёргается. guard по
 *  marketSellersMarketId для поздних ответов проверяется на уровне reducer —
 *  именно он применяет/отклоняет MARKET_SELLERS_LOADED/FAILED. */

function market(id: number): MarketMapRecord {
  return {
    marketId: asMarketId(`market-${id}`),
    name: `Рынок ${id}`,
    type: "MARKET",
    address: `Казань, ул. ${id}`,
    location: { lat: 55.796, lng: 49.1064 },
    sellerCount: 2,
  };
}

function seller(sellerId: string, marketId: number): MarketSellerRecord {
  return {
    sellerId: asSellerId(sellerId),
    name: `Лавка ${sellerId}`,
    row: "Ряд А",
    place: "Место 1",
    workingHours: "08:00–20:00",
    shortDescription: null,
    productCount: 5,
  };
}

async function run() {
  // ==== MARKETS_LOADED ====
  // Точки приходят из requestVisibleMarkets вместе с продавцами видимой области.
  MapRuntime.dispatch({ type: "MARKETS_LOADING" });
  let s = MapRuntime.getState();
  assert.equal(s.marketsLoading, true, "MARKETS_LOADING включает loading");
  assert.equal(s.marketsError, false, "MARKETS_LOADING сбрасывает ошибку");

  MapRuntime.dispatch({ type: "MARKETS_LOADED", markets: [market(1)] });
  s = MapRuntime.getState();
  assert.equal(s.marketsLoading, false, "MARKETS_LOADED выключает loading");
  assert.equal(s.markets.length, 1, "MARKETS_LOADED сохраняет точки");
  assert.equal(s.selectedMarketId, null, "без выбора попап не открывается");
  assert.equal(s.bottomSheet, "hidden", "без выбора шит закрыт");

  // Ошибка загрузки точек — отдельное состояние (карта может показать пины
  // не всех областей, но это не «пусто»).
  MapRuntime.dispatch({ type: "MARKETS_LOADING" });
  MapRuntime.dispatch({ type: "MARKETS_LOAD_FAILED" });
  s = MapRuntime.getState();
  assert.equal(s.marketsLoading, false, "MARKETS_LOAD_FAILED выключает loading");
  assert.equal(s.marketsError, true, "MARKETS_LOAD_FAILED ставит ошибку");

  // ==== SELECT_MARKET / попап точки ====
  // Выбор пина: открывается шит marketSellers, выбор продавца сбрасывается
  // (один попап в момент), список ещё не загружен (marketSellers = null →
  // скелетон), маршрут не трогается.
  MapRuntime.dispatch({ type: "SELECT_SELLER", sellerId: asSellerId("seller-1") });
  assert.equal(MapRuntime.getState().selectedSellerId, asSellerId("seller-1"), "подготовка: выбран продавец");

  MapRuntime.dispatch({ type: "SELECT_MARKET", marketId: asMarketId("market-1") });
  s = MapRuntime.getState();
  assert.equal(s.selectedMarketId, asMarketId("market-1"), "SELECT_MARKET выбирает точку");
  assert.equal(s.bottomSheet, "marketSellers", "SELECT_MARKET открывает попап точки");
  assert.equal(s.selectedSellerId, null, "SELECT_MARKET сбрасывает выбор продавца");
  assert.equal(s.marketSellers, null, "список продавцов ещё не загружен");
  assert.equal(s.marketSellersLoading, false, "до MARKET_SELLERS_LOADING loading выключен");
  assert.equal(s.route.status, "idle", "SELECT_MARKET не трогает маршрут");

  // ==== MARKET_SELLERS_LOADING / LOADED ====
  MapRuntime.dispatch({ type: "MARKET_SELLERS_LOADING", marketId: asMarketId("market-1") });
  s = MapRuntime.getState();
  assert.equal(s.marketSellersLoading, true, "MARKET_SELLERS_LOADING включает загрузку списка");
  assert.equal(s.marketSellersMarketId, asMarketId("market-1"), "marketId записывается в state");

  MapRuntime.dispatch({
    type: "MARKET_SELLERS_LOADED",
    marketId: asMarketId("market-1"),
    sellers: [seller("seller-101", 1), seller("seller-102", 1)],
  });
  s = MapRuntime.getState();
  assert.equal(s.marketSellersLoading, false, "MARKET_SELLERS_LOADED выключает загрузку");
  assert.equal(s.marketSellers?.length, 2, "список продавцов сохранён");
  assert.equal(s.marketSellersFailed, false, "ошибка не взведена");

  // Поздний ответ УСТАРЕВШЕГО запроса не применяется: guard по
  // marketSellersMarketId (пользователь уже открыл/закрыл другой попап).
  MapRuntime.dispatch({
    type: "MARKET_SELLERS_LOADED",
    marketId: asMarketId("market-2"),
    sellers: [seller("seller-201", 2)],
  });
  s = MapRuntime.getState();
  assert.equal(s.marketSellers?.length, 2, "ответ чужой/устаревшей точки отклонён");
  assert.equal(s.marketSellersMarketId, asMarketId("market-1"), "guard смотрит на актуальный marketId");

  // ==== MARKETS_LOADED сохраняет/закрывает попап ====
  // Точка ещё в видимой области → попап и список сохраняются.
  MapRuntime.dispatch({ type: "MARKETS_LOADED", markets: [market(1), market(2)] });
  s = MapRuntime.getState();
  assert.equal(s.selectedMarketId, asMarketId("market-1"), "выбранная точка в области → попап сохранён");
  assert.equal(s.bottomSheet, "marketSellers", "попап остаётся открытым");
  assert.equal(s.marketSellers?.length, 2, "список продавцов сохранён");

  // Точка выпала из видимой области → попап закрывается (список устарел вместе
  // с областью), выбор и список сбрасываются.
  MapRuntime.dispatch({ type: "MARKETS_LOADED", markets: [market(2)] });
  s = MapRuntime.getState();
  assert.equal(s.selectedMarketId, null, "выпавшая точка снята с выбора");
  assert.equal(s.bottomSheet, "hidden", "попап закрыт");
  assert.equal(s.marketSellers, null, "список продавцов сброшен");

  // ==== MARKET_SELLERS_FAILED → errorRetry ====
  MapRuntime.dispatch({ type: "SELECT_MARKET", marketId: asMarketId("market-2") });
  MapRuntime.dispatch({ type: "MARKET_SELLERS_LOADING", marketId: asMarketId("market-2") });
  MapRuntime.dispatch({ type: "MARKET_SELLERS_FAILED", marketId: asMarketId("market-2") });
  s = MapRuntime.getState();
  assert.equal(s.marketSellersFailed, true, "MARKET_SELLERS_FAILED ставит ошибку");
  assert.equal(s.marketSellersLoading, false, "загрузка выключена");
  assert.equal(s.marketSellers, null, "списка нет — попап показывает errorRetry");

  // ==== UNSELECT_MARKET ====
  MapRuntime.dispatch({ type: "UNSELECT_MARKET" });
  s = MapRuntime.getState();
  assert.equal(s.selectedMarketId, null, "UNSELECT_MARKET снимает выбор точки");
  assert.equal(s.bottomSheet, "hidden", "UNSELECT_MARKET закрывает попап");
  assert.equal(s.marketSellers, null, "список сброшен");
  assert.equal(s.marketSellersFailed, false, "ошибка сброшена");
  assert.equal(s.route.status, "idle", "UNSELECT_MARKET не трогает маршрут");

  // ==== SELECT_SELLER закрывает попап точки ====
  // Выбор продавца (маркер/список/поиск) сбрасывает попап точки — в один
  // момент открыт один попап; маршрут при этом сохраняется.
  MapRuntime.dispatch({ type: "SELECT_MARKET", marketId: asMarketId("market-1") });
  MapRuntime.dispatch({ type: "ROUTE_REQUEST", target: { kind: "market", marketId: asMarketId("market-1") } });
  MapRuntime.dispatch({ type: "SELECT_SELLER", sellerId: asSellerId("seller-1") });
  s = MapRuntime.getState();
  assert.equal(s.bottomSheet, "sellerSummary", "SELECT_SELLER открывает карточку продавца");
  assert.equal(s.selectedMarketId, null, "SELECT_SELLER закрывает попап точки");
  assert.equal(s.marketSellers, null, "список продавцов точки сброшен");
  assert.equal(s.route.status, "loading", "маршрут до точки не теряется при смене выбора");

  // ==== Стартовые значения полей ====
  assert.deepEqual(
    {
      // Последний MARKETS_LOADED нёс только market-2 (см. выше — область
      // перерисовалась после закрытия попапа).
      markets: s.markets.length,
      marketsError: s.marketsError,
      marketSellersLoading: s.marketSellersLoading,
      marketSellersFailed: s.marketSellersFailed,
    },
    { markets: 1, marketsError: false, marketSellersLoading: false, marketSellersFailed: false },
    "состояние полей рынка согласовано",
  );

  console.log("MapRuntime (маркеты): все проверки пройдены");
}

run();
