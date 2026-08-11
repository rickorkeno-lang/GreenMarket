import assert from "node:assert/strict";
import { decodePolyline } from "../PolylineCodec";

/** Формат — как в MapRuntime.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/routing/__tests__/PolylineCodec.test.ts */

function run() {
  // Официальный пример Google (precision 5):
  // _p~iF~ps|U_ulLnnqC_mqNvxq`@ → (38.5,-120.2), (40.7,-120.95), (43.252,-126.453)
  const example = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5);
  assert.deepEqual(example, [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
    { lat: 43.252, lng: -126.453 },
  ], "официальный пример Google (precision 5)");

  // Обратный маршрут той же пары точек — знаки координат меняются на
  // противоположные: декодирование обязано отработать отрицательные значения.
  const reverse = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5);
  assert.equal(reverse.length, 3, "длина не зависит от направления");

  // Пустая строка — пустой маршрут (не падает).
  assert.deepEqual(decodePolyline("", 6), [], "пустая полилиния → []");

  // Точка без знака (все дельты нулевые) — «??» для precision 6: нулевые
  // значения кодируются двумя байтами 0x3F подряд и не должны ронять декодер.
  const origin = decodePolyline("??", 6);
  assert.equal(origin.length, 1, "одна точка декодируется");
  assert.equal(origin[0].lat, 0, "lat нулевой точки равен 0");
  assert.equal(origin[0].lng, 0, "lng нулевой точки равен 0");

  console.log("Поликодек: все проверки пройдены");
}

run();
