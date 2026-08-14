import assert from "node:assert/strict";
import { compareDistanceMeters } from "../compare";

/** Формат — как в остальных тестах: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/__tests__/compare.test.ts */

function run() {
  // Известные расстояния — обычный порядок по возрастанию.
  assert.ok(compareDistanceMeters(100, 500) < 0, "100 м раньше 500 м");
  assert.ok(compareDistanceMeters(500, 100) > 0, "500 м позже 100 м");
  assert.equal(compareDistanceMeters(200, 200), 0, "равные расстояния равны");

  // Upd-8: неизвестное расстояние (undefined) — ПОСЛЕ любого известного,
  // а не «рядом» (бывшее `?? 0` поднимало такого продавца наверх).
  assert.ok(compareDistanceMeters(undefined, 0) > 0, "undefined после 0 м");
  assert.ok(compareDistanceMeters(undefined, 100) > 0, "undefined после известного");
  assert.ok(compareDistanceMeters(0, undefined) < 0, "известное перед undefined");
  assert.equal(compareDistanceMeters(undefined, undefined), 0, "два неизвестных равны");

  // null трактуется как «неизвестно» (== null), как в остальном коде.
  assert.ok(compareDistanceMeters(null, 100) > 0, "null после известного");
  assert.equal(compareDistanceMeters(null, undefined), 0, "null и undefined равны");
  assert.ok(compareDistanceMeters(100, null) < 0, "известное перед null");

  console.log("compare: все проверки пройдены");
}

run();
