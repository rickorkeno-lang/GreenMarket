import assert from "node:assert/strict";
import { asMarketId, asSellerId } from "../../../contracts/Action";
import { asCategoryId } from "../../../contracts/DomainTypes";
import {
  buildClusterMarkerHtml,
  buildMarketMarkerHtml,
  buildSellerMarkerHtml,
  categoryMarkerVisual,
  CLUSTER_ICON_ANCHOR,
  CLUSTER_ICON_SIZE,
  DEFAULT_CATEGORY_MARKER_VISUAL,
  DEFAULT_SELLER_MARKER_TREATMENT,
  dotScale,
  dotSizeForState,
  escapeHtml,
  glowScale,
  LOCK_OVERLAY_OFFSET,
  LOCK_OVERLAY_SIZE,
  MARKET_ICON_ANCHOR,
  MARKET_ICON_SIZE,
  marketIconMetrics,
  resolveSellerMarkerVisual,
  sellerIconMetrics,
  sellerMarkerState,
  sellerMarkerTreatment,
} from "../MarkerStyle";

/** Формат — как в MapRuntime.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/gis/__tests__/MarkerStyle.test.ts
 *
 *  MarkerStyle намеренно не импортирует "leaflet" — это чистый модуль, и его
 *  можно гонять в Node без DOM/jsdom (leaflet падает при импорте вне браузера
 *  из-за window.requestAnimationFrame). */

function run() {
  // ---- sellerMarkerState: выбор важнее доступности ----
  assert.equal(sellerMarkerState(true, true), "selected", "selected+available → selected");
  assert.equal(sellerMarkerState(true, false), "selected", "selected+closed → selected");
  assert.equal(sellerMarkerState(false, true), "available", "available → available");
  assert.equal(sellerMarkerState(false, false), "disabled", "closed → disabled");

  // Upd-8: статус неизвестен (undefined/null) НЕ приравнивается к false —
  // отдельное нейтральное состояние "unknown", а не «недоступен».
  assert.equal(sellerMarkerState(false, undefined), "unknown", "undefined → unknown (не disabled)");
  assert.equal(sellerMarkerState(false, null), "unknown", "null → unknown (не disabled)");
  assert.equal(sellerMarkerState(true, undefined), "selected", "выбор важнее неизвестного статуса");

  // ---- glowScale: база 1 на zoom 13, зажим снизу, boost на 16–19 ----
  assert.equal(glowScale(13), 1, "zoom 13 → база 1");
  assert.equal(glowScale(10), 0.3, "отдаление не ниже 0.3");
  assert.equal(glowScale(19), 8, "zoom 19: база 4 × boost 2");
  assert.equal(glowScale(16), (1 + 3 * 0.6) * 1.25, "zoom 16: (1 + 0.6*3) × 1.25");
  for (let z = 1; z < 19; z++) {
    assert.ok(glowScale(z + 1) >= glowScale(z), `glowScale монотонно растёт (${z} → ${z + 1})`);
  }

  // ---- dotScale: размер точки растёт плавно и не ниже 1 ----
  assert.equal(dotScale(13), 1, "zoom 13 → 1");
  assert.equal(dotScale(19), 1.24, "zoom 19 → 1 + 0.04*6");
  assert.equal(dotScale(10), 1, "отдаление не меньше 1 (точка не мельчает)");
  for (let z = 1; z < 19; z++) {
    assert.ok(dotScale(z + 1) >= dotScale(z), `dotScale монотонно растёт (${z} → ${z + 1})`);
  }

  // ---- dotSizeForState ----
  assert.equal(dotSizeForState("selected"), 20, "выбранная точка крупнее");
  assert.equal(dotSizeForState("available"), 14, "обычная точка 14px");
  assert.equal(dotSizeForState("unknown"), 14, "неизвестный статус — та же геометрия");
  assert.equal(dotSizeForState("disabled"), 14, "закрытая точка 14px");

  // ---- sellerIconMetrics: контейнер = точка + поле клика, якорь в центре ----
  const avail = sellerIconMetrics("available");
  assert.deepEqual(avail.size, [26, 26], "available: контейнер = 14 + 2*6");
  assert.deepEqual(avail.anchor, [13, 13], "available: якорь в центре контейнера");
  assert.equal(avail.dotSize, 14, "available: диаметр точки");

  const sel = sellerIconMetrics("selected");
  assert.deepEqual(sel.size, [32, 32], "selected: контейнер = 20 + 2*6");
  assert.deepEqual(sel.anchor, [16, 16], "selected: якорь в центре");
  assert.equal(sel.dotSize, 20, "selected: диаметр точки");

  // unknown — та же базовая геометрия, что у available (меняется только цвет).
  assert.deepEqual(sellerIconMetrics("unknown"), avail, "unknown: метрики как у обычной точки");

  // Геометрия НЕ зависит от zoom: контейнер чётный, якорь — точная половина
  // (без Math.ceil), поэтому визуальный центр точки совпадает с lat/lng на
  // любом масштабе и не «прыгает» при зуммах. zoom-эффекты уехали в CSS.
  assert.deepEqual(sellerIconMetrics("available"), avail, "метрики стабильны (zoom-независимы)");

  // ---- buildSellerMarkerHtml: структура, состояния, экранирование ----
  const html = buildSellerMarkerHtml("Ферма «Грюн»", asSellerId("seller-1"), "available", avail);
  assert.ok(html.includes('data-testid="seller-marker"'), "data-testid сохранён");
  assert.ok(html.includes('data-seller-id="seller-1"'), "data-seller-id сохранён");
  assert.ok(html.includes('class="gm-map-marker__label"'), "обычная подпись без модификатора");
  assert.ok(html.includes("gm-map-marker__dot"), "точка с базовым классом");
  assert.ok(!html.includes("gm-map-marker__dot--selected"), "обычная точка без selected");
  assert.ok(!html.includes("gm-map-marker__dot--disabled"), "обычная точка без disabled");
  assert.ok(html.includes('width:14px;height:14px'), "inline-размер точки из метрик");
  assert.ok(!html.includes("--gm-glow-scale"), "zoom-зависимые переменные в иконку не попадают (геометрия стабильна)");

  // Доступность (MAP-033): точка — role="img" + aria-label «название, статус».
  assert.ok(html.includes('role="img"'), "маркер продавца — role=\"img\"");
  assert.ok(html.includes('aria-label="Ферма «Грюн», открыт"'), "aria-label: название + статус открыт");
  assert.ok(html.includes('title="Ферма «Грюн»"'), "title остаётся тултипом");

  const selHtml = buildSellerMarkerHtml("Выбранный", asSellerId("s2"), "selected", sel);
  assert.ok(selHtml.includes("gm-map-marker__dot--selected"), "selected: модификатор точки");
  assert.ok(selHtml.includes("gm-map-marker__label--selected"), "selected: модификатор подписи");
  assert.ok(selHtml.includes('width:20px;height:20px'), "selected: размер точки из метрик");

  const disHtml = buildSellerMarkerHtml("Закрыт", asSellerId("s3"), "disabled", avail, { kind: "circle" }, { kind: "closed" });
  assert.ok(disHtml.includes("gm-map-marker__dot--disabled"), "disabled: модификатор точки");
  assert.ok(disHtml.includes('aria-label="Закрыт, закрыт"'), "aria-label: статус закрыт");

  // Upd-8: unknown (isAvailable = undefined) — полая нейтральная точка,
  // модификатор --unknown, а НЕ --disabled («недоступен» — ложный факт).
  const unkHtml = buildSellerMarkerHtml("Без статуса", asSellerId("s5"), "unknown", avail, { kind: "circle" }, { kind: "faded" });
  assert.ok(unkHtml.includes("gm-map-marker__dot--unknown"), "unknown: модификатор точки");
  assert.ok(!unkHtml.includes("gm-map-marker__dot--disabled"), "unknown: НЕ выглядит как недоступен");
  assert.ok(!unkHtml.includes("gm-map-marker__label--selected"), "unknown: подпись без selected");
  assert.ok(unkHtml.includes('aria-label="Без статуса, статус неизвестен"'), "aria-label: статус неизвестен");

  const evil = "<script>alert(\"x\")</script> & co";
  const safe = buildSellerMarkerHtml(evil, asSellerId("s4"), "available", avail);
  assert.ok(!safe.includes("<script>"), "имя экранировано (нет сырого <script>)");
  assert.ok(safe.includes("&lt;script&gt;"), "экранированное имя присутствует");
  assert.ok(safe.includes("&amp;"), "амперсанд экранирован");

  // ---- escapeHtml ----
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;", "все спецсимволы экранируются");

  // ---- Визуальное кодирование категорий (архитектурная заготовка) ----
  // Заглушка: реестр CATEGORY_MARKER_VISUALS пуст, поэтому ЛЮБАЯ категория
  // получает дефолтный визуал — обычный кружок, как у всех шопов до системы.
  assert.deepEqual(categoryMarkerVisual(asCategoryId("meat")), DEFAULT_CATEGORY_MARKER_VISUAL, "категория → кружок (заглушка)");
  assert.deepEqual(categoryMarkerVisual(asCategoryId("уникальная-категория-xyz")), DEFAULT_CATEGORY_MARKER_VISUAL, "неизвестная категория → кружок");

  // Маркер у продавца один, категорий несколько — resolver выбирает один
  // визуал; пока все категории дают кружок, результат всегда дефолтный.
  assert.deepEqual(resolveSellerMarkerVisual([]), DEFAULT_CATEGORY_MARKER_VISUAL, "без категорий → кружок");
  assert.deepEqual(
    resolveSellerMarkerVisual([asCategoryId("meat"), asCategoryId("veg")]),
    DEFAULT_CATEGORY_MARKER_VISUAL,
    "несколько категорий → кружок (все — заглушка)",
  );

  // Визуал прокидывается в геометрию/разметку (точка расширения): явный
  // { kind: "circle" } даёт ровно ту же геометрию и разметку, что дефолт.
  assert.deepEqual(
    sellerIconMetrics("available", { kind: "circle" }),
    sellerIconMetrics("available"),
    "визуал circle: метрики совпадают с дефолтом",
  );
  assert.equal(
    buildSellerMarkerHtml("Ферма «Грюн»", asSellerId("seller-1"), "available", avail, { kind: "circle" }),
    html,
    "визуал circle: разметка совпадает с дефолтом",
  );

  // ---- Оформление маркера по статусу (вторая ось визуального кодирования) ----
  // sellerMarkerTreatment строится от isAvailable (Upd-8, undefined/null =
  // статус неизвестен): открыт → plain, закрыт → closed, неизвестно → faded.
  assert.deepEqual(sellerMarkerTreatment(true), { kind: "plain" }, "isAvailable=true → plain (просто иконка)");
  assert.deepEqual(sellerMarkerTreatment(false), { kind: "closed" }, "isAvailable=false → closed (замочек)");
  assert.deepEqual(sellerMarkerTreatment(undefined), { kind: "faded" }, "isAvailable=undefined → faded (теряет цвет)");
  assert.deepEqual(sellerMarkerTreatment(null), { kind: "faded" }, "isAvailable=null → faded (теряет цвет)");

  // Дефолтное оформление — открыт, просто иконка.
  assert.deepEqual(DEFAULT_SELLER_MARKER_TREATMENT, { kind: "plain" }, "дефолт — plain");

  // Геометрия от оформления статуса НЕ зависит (заглушка): любой kind даёт те
  // же метрики, что дефолт. Точка расширения — замочек (closed) в будущем
  // может потребовать контейнер больше (LOCK_OVERLAY_SIZE/LOCK_OVERLAY_OFFSET).
  for (const treatment of [{ kind: "plain" as const }, { kind: "closed" as const }, { kind: "faded" as const }]) {
    assert.deepEqual(
      sellerIconMetrics("available", { kind: "circle" }, treatment),
      avail,
      `treatment ${treatment.kind}: метрики как у дефолта`,
    );
  }
  assert.ok(LOCK_OVERLAY_SIZE > 0, "LOCK_OVERLAY_SIZE задан");
  assert.deepEqual(LOCK_OVERLAY_OFFSET, [14, 14], "LOCK_OVERLAY_OFFSET — правый нижний угол (заглушка)");

  // Статусная окраска точки — от оформления: closed → --disabled, faded →
  // --unknown, plain → без модификатора (выбор --selected — ортогонален и
  // важнее статусной окраски).
  const plainHtml = buildSellerMarkerHtml("Ферма «Грюн»", asSellerId("seller-1"), "available", avail, { kind: "circle" }, { kind: "plain" });
  assert.equal(plainHtml, html, "plain: разметка совпадает с обычной точкой");
  assert.ok(!plainHtml.includes("gm-map-marker__dot--disabled"), "plain: без --disabled");
  assert.ok(!plainHtml.includes("gm-map-marker__dot--unknown"), "plain: без --unknown");
  assert.ok(
    buildSellerMarkerHtml("Закрыт", asSellerId("s7"), "disabled", avail, { kind: "circle" }, { kind: "closed" }).includes(
      "gm-map-marker__dot--disabled",
    ),
    "closed → --disabled (заглушка замочка)",
  );
  assert.ok(
    buildSellerMarkerHtml("Без статуса", asSellerId("s8"), "unknown", avail, { kind: "circle" }, { kind: "faded" }).includes(
      "gm-map-marker__dot--unknown",
    ),
    "faded → --unknown (полая точка, теряет цвет)",
  );
  // Выбор важнее статусной окраски: выбранный закрытый маркер — акцентная
  // точка (--selected), без статусного --disabled; замочек появится в будущем
  // в ветке иконок, а не в кружке-заглушке.
  const selClosedHtml = buildSellerMarkerHtml("Закрытый выбранный", asSellerId("s9"), "selected", sel, { kind: "circle" }, { kind: "closed" });
  assert.ok(selClosedHtml.includes("gm-map-marker__dot--selected"), "selected+closed → --selected");
  assert.ok(!selClosedHtml.includes("gm-map-marker__dot--disabled"), "selected+closed → без --disabled (статус не перекрашивает выбранную точку)");

  // ---- buildClusterMarkerHtml: бейдж + точка, count и data-testid ----
  const cluster = buildClusterMarkerHtml(7);
  assert.ok(cluster.includes('data-testid="seller-cluster"'), "data-testid кластера");
  assert.ok(cluster.includes("gm-map-cluster__count"), "бейдж количества");
  assert.ok(cluster.includes("gm-map-cluster__dot"), "точка кластера");
  assert.ok(cluster.includes(">7<"), "количество в бейдже");

  // Доступность (MAP-033): бейдж — role="img" + aria-label «N продавцов»
  // (русская плюрализация), точка декоративная (aria-hidden).
  assert.ok(cluster.includes('role="img"'), "бейдж кластера — role=\"img\"");
  assert.ok(cluster.includes('aria-label="7 продавцов"'), "aria-label: 7 продавцов");
  assert.ok(cluster.includes('aria-hidden="true"'), "точка кластера скрыта от скринридера (декор)");
  assert.ok(buildClusterMarkerHtml(1).includes('aria-label="1 продавец"'), "плюрализация: 1 продавец");
  assert.ok(buildClusterMarkerHtml(3).includes('aria-label="3 продавца"'), "плюрализация: 3 продавца");
  assert.ok(buildClusterMarkerHtml(21).includes('aria-label="21 продавец"'), "плюрализация: 21 продавец");
  assert.ok(buildClusterMarkerHtml(14).includes('aria-label="14 продавцов"'), "плюрализация: 14 продавцов");

  // ---- Константы кластера: якорь = центр ТОЧКИ (16px, прижата к низу
  // контейнера 38px → центр на 8px от низа = 30px от верха) ----
  assert.deepEqual(CLUSTER_ICON_SIZE, [30, 38], "контейнер кластера");
  assert.deepEqual(CLUSTER_ICON_ANCHOR, [15, 30], "якорь кластера — центр точки, у координаты");

  // ---- Маркер точки торговли (задача «Маркеты») ----
  // Метрики: габаритный бокс булавки (34px × √2 ≈ 48px), якорь — остриё [24,48].
  const marketMetrics = marketIconMetrics();
  assert.deepEqual(marketMetrics.size, [48, 48], "контейнер маркера точки = 48×48");
  assert.deepEqual(marketMetrics.anchor, [24, 48], "якорь — остриё булавки, точка контакта с координатой");
  assert.deepEqual(MARKET_ICON_SIZE, [48, 48], "MARKET_ICON_SIZE = 48×48");
  assert.deepEqual(MARKET_ICON_ANCHOR, [24, 48], "MARKET_ICON_ANCHOR = [24, 48]");

  // Разметка: подпись + булавка со счётчиком; data-testid/data-market-id.
  const marketHtml = buildMarketMarkerHtml("Центральный рынок", asMarketId("market-1"), 45, false);
  assert.ok(marketHtml.includes('class="gm-map-market__label"'), "подпись маркета без модификатора");
  assert.ok(marketHtml.includes('data-testid="market-marker"'), "data-testid маркера точки");
  assert.ok(marketHtml.includes('data-market-id="market-1"'), "data-market-id сохранён");
  assert.ok(marketHtml.includes('class="gm-map-market__pin"'), "булавка с базовым классом");
  assert.ok(!marketHtml.includes("gm-map-market__pin--selected"), "невыбранная точка без модификатора");
  assert.ok(marketHtml.includes(">45<"), "счётчик продавцов в булавке");
  assert.ok(marketHtml.includes('title="Центральный рынок"'), "title для тултипа/доступности");

  // Доступность (MAP-033): булавка — role="img" + aria-label «название,
  // N продавцов»; видимый счётчик скрыт (роль img читается целиком по
  // aria-label, чтобы не дублировать число).
  assert.ok(marketHtml.includes('role="img"'), "булавка маркета — role=\"img\"");
  assert.ok(marketHtml.includes('aria-label="Центральный рынок, 45 продавцов"'), "aria-label: название + N продавцов");
  assert.ok(marketHtml.includes('class="gm-map-market__count" aria-hidden="true"'), "счётчик скрыт от скринридера (не дублирует aria-label)");

  const selectedMarketHtml = buildMarketMarkerHtml("Лавка", asMarketId("market-2"), 3, true);
  assert.ok(selectedMarketHtml.includes("gm-map-market__pin--selected"), "выбранная точка — модификатор булавки");

  // Экранирование имени/ID точки — как у продавцов (название из API может
  // содержать любые символы, разметка подставляется в innerHTML).
  const evilMarket = buildMarketMarkerHtml("<script>alert(\"x\")</script>", asMarketId("m&1"), 1, false);
  assert.ok(!evilMarket.includes("<script>"), "имя точки экранировано (нет сырого <script>)");
  assert.ok(evilMarket.includes("&lt;script&gt;"), "экранированное имя присутствует");

  console.log("MarkerStyle: все проверки пройдены");
}

run();
