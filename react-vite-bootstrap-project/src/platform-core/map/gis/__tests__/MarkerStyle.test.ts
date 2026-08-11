import assert from "node:assert/strict";
import { asSellerId } from "../../../contracts/Action";
import {
  buildClusterMarkerHtml,
  buildSellerMarkerHtml,
  CLUSTER_ICON_ANCHOR,
  CLUSTER_ICON_SIZE,
  dotScale,
  dotSizeForState,
  escapeHtml,
  glowScale,
  sellerIconMetrics,
  sellerMarkerState,
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

  const selHtml = buildSellerMarkerHtml("Выбранный", asSellerId("s2"), "selected", sel);
  assert.ok(selHtml.includes("gm-map-marker__dot--selected"), "selected: модификатор точки");
  assert.ok(selHtml.includes("gm-map-marker__label--selected"), "selected: модификатор подписи");
  assert.ok(selHtml.includes('width:20px;height:20px'), "selected: размер точки из метрик");

  const disHtml = buildSellerMarkerHtml("Закрыт", asSellerId("s3"), "disabled", avail);
  assert.ok(disHtml.includes("gm-map-marker__dot--disabled"), "disabled: модификатор точки");

  const evil = "<script>alert(\"x\")</script> & co";
  const safe = buildSellerMarkerHtml(evil, asSellerId("s4"), "available", avail);
  assert.ok(!safe.includes("<script>"), "имя экранировано (нет сырого <script>)");
  assert.ok(safe.includes("&lt;script&gt;"), "экранированное имя присутствует");
  assert.ok(safe.includes("&amp;"), "амперсанд экранирован");

  // ---- escapeHtml ----
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;", "все спецсимволы экранируются");

  // ---- buildClusterMarkerHtml: бейдж + точка, count и data-testid ----
  const cluster = buildClusterMarkerHtml(7);
  assert.ok(cluster.includes('data-testid="seller-cluster"'), "data-testid кластера");
  assert.ok(cluster.includes("gm-map-cluster__count"), "бейдж количества");
  assert.ok(cluster.includes("gm-map-cluster__dot"), "точка кластера");
  assert.ok(cluster.includes(">7<"), "количество в бейдже");

  // ---- Константы кластера: якорь = центр ТОЧКИ (16px, прижата к низу
  // контейнера 38px → центр на 8px от низа = 30px от верха) ----
  assert.deepEqual(CLUSTER_ICON_SIZE, [30, 38], "контейнер кластера");
  assert.deepEqual(CLUSTER_ICON_ANCHOR, [15, 30], "якорь кластера — центр точки, у координаты");

  console.log("MarkerStyle: все проверки пройдены");
}

run();
