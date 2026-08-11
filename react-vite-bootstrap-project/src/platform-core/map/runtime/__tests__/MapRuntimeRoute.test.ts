import assert from "node:assert/strict";
import { asSellerId } from "../../../contracts/Action";
import { asCategoryId, type CategoryId } from "../../../contracts/DomainTypes";
import type { RouteModel, SellerMapRecord } from "../../viewmodels/MapViewModel";
import { MapRuntime } from "../MapRuntime";

/** Формат — как в MapRuntime.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/runtime/__tests__/MapRuntimeRoute.test.ts
 *
 *  Маршрут тестируется через reducer-действия напрямую (ROUTE_REQUEST/LOADED/
 *  FAILED/CLEARED): сеть при этом не дёргается. requestRoute (с вызовом
 *  GeoService/routeService) здесь не вызывается — защита от гонок (seq) живёт
 *  в нём, а reducer-кейсы проверяют только применение действий. */

function seller(id: number, categories: CategoryId[]): SellerMapRecord {
  return {
    sellerId: asSellerId(`seller-${id}`),
    name: `Продавец ${id}`,
    location: { lat: 50.11, lng: 8.68 },
    rating: 4.2,
    distanceMeters: 500,
    categories,
    categoryNames: [...categories],
    photoUrl: null,
    isOpenNow: true,
    workingHoursLabel: "Открыто до 20:00",
    isAvailable: true,
  };
}

function route(distanceMeters = 1895): RouteModel {
  return {
    geometry: [
      { lat: 50.11, lng: 8.68 },
      { lat: 50.12, lng: 8.69 },
    ],
    distanceMeters,
    durationSeconds: 287,
  };
}

async function run() {
  const veg = asCategoryId("vegetables");
  const dairy = asCategoryId("dairy");
  const meat = asCategoryId("meat");
  MapRuntime.dispatch({
    type: "CATEGORIES_LOADED",
    categories: [
      { categoryId: veg, name: "Овощи и фрукты" },
      { categoryId: dairy, name: "Молочные продукты" },
      { categoryId: meat, name: "Мясо и птица" },
    ],
  });
  MapRuntime.dispatch({
    type: "SELLERS_LOADED",
    sellers: [seller(1, [veg]), seller(2, [dairy]), seller(3, [meat])],
  });

  // Стартовое состояние — маршрута нет.
  assert.deepEqual(MapRuntime.getState().route, { status: "idle" }, "стартовое состояние — idle");

  // SELECT_SELLER маршрут НЕ трогает (маршрут строится на странице продавца и
  // переживает смену выбора/закрытие карточки).
  MapRuntime.dispatch({ type: "SELECT_SELLER", sellerId: asSellerId("seller-1") });
  assert.deepEqual(MapRuntime.getState().route, { status: "idle" }, "SELECT_SELLER не меняет маршрут");

  // ROUTE_REQUEST → loading.
  MapRuntime.dispatch({ type: "ROUTE_REQUEST", sellerId: asSellerId("seller-1") });
  assert.deepEqual(
    MapRuntime.getState().route,
    { status: "loading", sellerId: asSellerId("seller-1") },
    "ROUTE_REQUEST переводит в loading",
  );

  // ROUTE_LOADED → success с моделью. Маршрут не привязан к выбранному
  // продавцу: последнее действие применяется (порядок гарантирует seq в
  // requestRoute/fetchRoute, а не reducer).
  MapRuntime.dispatch({ type: "ROUTE_LOADED", sellerId: asSellerId("seller-1"), route: route() });
  assert.deepEqual(
    MapRuntime.getState().route,
    { status: "success", sellerId: asSellerId("seller-1"), route: route() },
    "ROUTE_LOADED строит success-маршрут",
  );

  // Поздний ответ для ДРУГОГО продавца тоже применяется — при вызове через
  // requestRoute от устаревшего ответа защищает seq (проверяется на уровне
  // методов с сетью), reducer же просто применяет последнее действие.
  MapRuntime.dispatch({
    type: "ROUTE_LOADED",
    sellerId: asSellerId("seller-2"),
    route: route(9999),
  });
  const afterOther = MapRuntime.getState().route;
  assert.equal(afterOther.status, "success", "последний ROUTE_LOADED применяется");
  if (afterOther.status === "success") {
    assert.equal(afterOther.sellerId, asSellerId("seller-2"), "маршрут перезаписан последним ответом");
  }

  // ROUTE_CLEARED → idle (пользователь убрал маршрут кнопкой в углу карты).
  MapRuntime.dispatch({ type: "ROUTE_CLEARED" });
  assert.equal(MapRuntime.getState().route.status, "idle", "ROUTE_CLEARED возвращает в idle");

  // ROUTE_FAILED → error с причиной.
  MapRuntime.dispatch({ type: "ROUTE_REQUEST", sellerId: asSellerId("seller-1") });
  MapRuntime.dispatch({ type: "ROUTE_FAILED", sellerId: asSellerId("seller-1"), kind: "no-route" });
  assert.deepEqual(
    MapRuntime.getState().route,
    { status: "error", sellerId: asSellerId("seller-1"), kind: "no-route" },
    "ROUTE_FAILED переводит в error",
  );

  // Смена выбора продавца маршрут НЕ сбрасывает — полилиния живёт на карте,
  // пока её не уберут (кнопка «Убрать маршрут» / уход с карты).
  MapRuntime.dispatch({ type: "SELECT_SELLER", sellerId: asSellerId("seller-2") });
  assert.equal(MapRuntime.getState().route.status, "error", "смена продавца сохраняет маршрут");

  // UNSELECT_SELLER: закрытие карточки маршрут НЕ трогает.
  MapRuntime.dispatch({ type: "SELECT_SELLER", sellerId: asSellerId("seller-1") });
  MapRuntime.dispatch({ type: "ROUTE_REQUEST", sellerId: asSellerId("seller-1") });
  MapRuntime.dispatch({ type: "UNSELECT_SELLER" });
  assert.equal(MapRuntime.getState().route.status, "loading", "UNSELECT_SELLER сохраняет маршрут");

  // Открытие мастера «Поиск продавцов» (все шаги) и истории выбор сбрасывают,
  // но маршрут сохраняют.
  MapRuntime.dispatch({ type: "ROUTE_REQUEST", sellerId: asSellerId("seller-1") });
  MapRuntime.dispatch({ type: "SELLER_SEARCH_OPEN" });
  assert.equal(MapRuntime.getState().route.status, "loading", "SELLER_SEARCH_OPEN сохраняет маршрут");

  MapRuntime.dispatch({ type: "ROUTE_REQUEST", sellerId: asSellerId("seller-1") });
  MapRuntime.dispatch({
    type: "SELLER_SEARCH_ORIGIN_PICKED",
    origin: { lat: 50.1, lng: 8.6 },
    label: "Положение на карте",
  });
  assert.equal(MapRuntime.getState().route.status, "loading", "SELLER_SEARCH_ORIGIN_PICKED сохраняет маршрут");

  MapRuntime.dispatch({ type: "ROUTE_REQUEST", sellerId: asSellerId("seller-1") });
  MapRuntime.dispatch({ type: "SELLER_SEARCH_BACK" });
  assert.equal(MapRuntime.getState().route.status, "loading", "SELLER_SEARCH_BACK сохраняет маршрут");

  MapRuntime.dispatch({ type: "ROUTE_REQUEST", sellerId: asSellerId("seller-1") });
  MapRuntime.dispatch({ type: "SELLER_HISTORY_OPENED", history: [] });
  assert.equal(MapRuntime.getState().route.status, "loading", "SELLER_HISTORY_OPENED сохраняет маршрут");

  // Продавец выпал из видимого списка (фильтр) → выбор снят автоматически,
  // но маршрут сохраняется (withVisibleSellers).
  MapRuntime.dispatch({ type: "ROUTE_REQUEST", sellerId: asSellerId("seller-3") });
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [veg] });
  const filtered = MapRuntime.getState();
  assert.equal(filtered.selectedSellerId, null, "продавец вне фильтра снят с выбора");
  assert.equal(filtered.route.status, "loading", "снятие выбора сохраняет маршрут");

  // SET_USER_LOCATION: тихое определение местоположения — сохраняет позицию,
  // но НЕ двигает камеру (в отличие от CENTER_ON_USER_SUCCESS). Маршрут
  // строится от этой позиции, даже если пользователь не нажимал «Моё
  // местоположение».
  const beforeLocation = MapRuntime.getState().mapCenter;
  MapRuntime.dispatch({ type: "SET_USER_LOCATION", location: { lat: 50.05, lng: 8.6 } });
  let loc = MapRuntime.getState();
  assert.deepEqual(loc.userLocation, { lat: 50.05, lng: 8.6 }, "SET_USER_LOCATION сохраняет позицию");
  assert.deepEqual(loc.mapCenter, beforeLocation, "SET_USER_LOCATION не двигает камеру");

  // CENTER_ON_USER_SUCCESS — наоборот: и сохраняет позицию, и центрирует камеру.
  MapRuntime.dispatch({ type: "CENTER_ON_USER_SUCCESS", location: { lat: 50.0, lng: 8.55 } });
  loc = MapRuntime.getState();
  assert.deepEqual(loc.userLocation, { lat: 50.0, lng: 8.55 }, "CENTER_ON_USER_SUCCESS сохраняет позицию");
  assert.deepEqual(loc.mapCenter, { lat: 50.0, lng: 8.55 }, "CENTER_ON_USER_SUCCESS центрирует камеру");

  console.log("MapRuntime (маршрут): все проверки пройдены");
}

run();
