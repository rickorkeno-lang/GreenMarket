import assert from "node:assert/strict";
import { createTileFallbackTracker, TILE_ERROR_THRESHOLD } from "../TileFallback";
import {
  CleanMapTileProvider,
  EsriWorldStreetMapTileProvider,
  OpenStreetMapTileProvider,
  resolveActiveTileConfig,
} from "../TileProvider";

/** Формат — как в MarkerStyle.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/gis/__tests__/TileFallback.test.ts
 *
 *  Логика фолбэка тайлов (MAP-036) — чистая функция без React/Leaflet,
 *  гоняется в Node без DOM. Связка «счётчик → состояние → активный конфиг»
 *  тоже вынесена в чистую resolveActiveTileConfig и проверена здесь же;
 *  полное перемонтирование TileLayer (key) остаётся за границей юнит-тестов
 *  (требует DOM + react-leaflet). */

function run() {
  // ---- Одиночная ошибка без последующих — фолбэк не срабатывает ----
  {
    const tracker = createTileFallbackTracker();
    assert.equal(tracker.onTileError(), false, "1 ошибка < порога → не срабатывает");
    assert.equal(tracker.isArmed(), false, "не вооружён");
  }

  // ---- Ошибки вперемешку с успешными загрузками — сброс счётчика ----
  {
    const tracker = createTileFallbackTracker();
    for (let i = 0; i < TILE_ERROR_THRESHOLD - 1; i++) {
      tracker.onTileError();
    }
    assert.equal(tracker.isArmed(), false, "ниже порога не вооружён");
    tracker.onTileLoad(); // один живой тайл сбрасывает накопленное
    assert.equal(tracker.onTileError(), false, "после успешной загрузки счёт обнулён");
    for (let i = 0; i < TILE_ERROR_THRESHOLD; i++) {
      tracker.onTileError();
    }
    assert.equal(tracker.isArmed(), true, "новый бурст после сброса вооружает");
  }

  // ---- Бурст из порога ошибок подряд — срабатывает ровно один раз ----
  {
    const tracker = createTileFallbackTracker();
    let triggered = false;
    for (let i = 0; i < TILE_ERROR_THRESHOLD; i++) {
      triggered = tracker.onTileError() || triggered;
    }
    assert.equal(triggered, true, "порог достигнут → фолбэк применён");
    assert.equal(tracker.isArmed(), true, "фолбэк зафиксирован");
  }

  // ---- После срабатывания ошибки/загрузки больше ничего не меняют ----
  {
    const tracker = createTileFallbackTracker();
    for (let i = 0; i < TILE_ERROR_THRESHOLD; i++) tracker.onTileError();
    assert.equal(tracker.onTileError(), false, "повторные ошибки не возвращают true");
    assert.equal(tracker.isArmed(), true, "armed остаётся");
    tracker.onTileLoad();
    assert.equal(tracker.isArmed(), true, "успешные загрузки не разоружают (однонаправленно)");
  }

  // ---- Сброс позволяет фолбэку сработать заново (смена провайдера) ----
  {
    const tracker = createTileFallbackTracker();
    for (let i = 0; i < TILE_ERROR_THRESHOLD; i++) tracker.onTileError();
    assert.equal(tracker.isArmed(), true, "вооружён до сброса");
    tracker.reset();
    assert.equal(tracker.isArmed(), false, "после reset не вооружён");
    assert.equal(tracker.onTileError(), false, "счётчик ошибок тоже обнулён");
    for (let i = 0; i < TILE_ERROR_THRESHOLD; i++) tracker.onTileError();
    assert.equal(tracker.isArmed(), true, "новый бурст снова вооружает");
  }

  // ---- Кастомный порог ----
  {
    const tracker = createTileFallbackTracker(3);
    tracker.onTileError();
    tracker.onTileError();
    assert.equal(tracker.isArmed(), false, "2 < 3");
    tracker.onTileError();
    assert.equal(tracker.isArmed(), true, "3 ошибки с порогом 3 → вооружён");
  }

  // ---- MAP-036: выбор активного конфига (resolveActiveTileConfig) ----
  {
    assert.equal(
      resolveActiveTileConfig(OpenStreetMapTileProvider, false),
      OpenStreetMapTileProvider,
      "фолбэк не применён → базовый провайдер как есть",
    );
    assert.equal(
      resolveActiveTileConfig(OpenStreetMapTileProvider, true).urlTemplate,
      EsriWorldStreetMapTileProvider.urlTemplate,
      "применён → OSM переключается на Esri",
    );
    assert.equal(
      resolveActiveTileConfig(CleanMapTileProvider, true).urlTemplate,
      OpenStreetMapTileProvider.urlTemplate,
      "применён → CleanMap переключается на OSM",
    );
    assert.equal(
      resolveActiveTileConfig(EsriWorldStreetMapTileProvider, true),
      EsriWorldStreetMapTileProvider,
      "Esri без fallback остаётся собой (он сам терминальный резервный)",
    );
  }

  // ---- MAP-036: полная цепочка счётчик → applied → активный конфиг ----
  // (без React/Leaflet: счётчик кормится ошибками, как это делает
  // handleTileError в LeafletAdapter, результат трактуется как состояние
  // tileFallbackApplied, и из него выводится конфиг для key/urlTemplate.)
  {
    const tracker = createTileFallbackTracker();
    let applied = false;
    for (let i = 0; i < TILE_ERROR_THRESHOLD; i++) {
      if (tracker.onTileError()) applied = true;
    }
    assert.equal(applied, true, "порог достигнут → фолбэк применён");
    assert.equal(
      resolveActiveTileConfig(OpenStreetMapTileProvider, applied).urlTemplate,
      EsriWorldStreetMapTileProvider.urlTemplate,
      "карта переключается OSM → Esri",
    );
    tracker.onTileLoad();
    assert.equal(applied, true, "однонаправленно: успешные загрузки не откатывают");
  }

  console.log("TileFallback: все проверки пройдены");
}

run();
