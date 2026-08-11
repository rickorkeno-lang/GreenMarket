import assert from "node:assert/strict";
import type { GeoPoint } from "../../viewmodels/MapViewModel";
import { RouteNetworkError, RouteNotFoundError, type RouteProvider, type RouteProviderResult } from "../RouteProvider";
import { createRouteService } from "../RouteService";

/** Формат — как в MapRuntime.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/routing/__tests__/RouteService.test.ts */

const ORIGIN: GeoPoint = { lat: 50.11, lng: 8.68 };
const DESTINATION: GeoPoint = { lat: 50.12, lng: 8.69 };

function okResult(geometryEncoded = "??"): RouteProviderResult {
  return { geometryEncoded, distanceMeters: 100, durationSeconds: 60 };
}

function provider(name: string, behavior: () => Promise<RouteProviderResult>): RouteProvider {
  return {
    name,
    fetchRoute: (_o, _d, _s) => behavior(),
  };
}

async function run() {
  // Первый успешный провайдер выигрывает: геометрия декодируется в точки,
  // метрики проходят в RouteModel без изменений.
  {
    const service = createRouteService({
      providers: [
        provider("fake-ok", async () => okResult()),
        provider("unused", async () => {
          throw new Error("не должен вызываться");
        }),
      ],
    });
    const route = await service.getRoute(ORIGIN, DESTINATION);
    assert.equal(route.distanceMeters, 100, "distanceMeters из ответа провайдера");
    assert.equal(route.durationSeconds, 60, "durationSeconds из ответа провайдера");
    assert.equal(route.geometry.length, 1, "полилиния декодирована в точки");
    assert.deepEqual(route.geometry[0], { lat: 0, lng: 0 }, "декодирование геометрии");
  }

  // Сетевой сбой первого провайдера не останавливает перебор — работает фолбэк.
  {
    const service = createRouteService({
      providers: [
        provider("down", async () => {
          throw new RouteNetworkError("сеть недоступна");
        }),
        provider("backup", async () => okResult("_p~iF~ps|U_ulLnnqC_mqNvxq`@")),
      ],
    });
    const route = await service.getRoute(ORIGIN, DESTINATION);
    assert.equal(route.geometry.length, 3, "фолбэк отработал: маршрут от второго провайдера");
  }

  // «Маршрут не найден» от первого провайдера тоже пробует следующий
  // (у другого провайдера та же пара точек может быть достижима).
  {
    const calls: string[] = [];
    const service = createRouteService({
      providers: [
        provider("no-route-first", async () => {
          calls.push("first");
          throw new RouteNotFoundError("NoRoute");
        }),
        provider("ok-second", async () => {
          calls.push("second");
          return okResult();
        }),
      ],
    });
    const route = await service.getRoute(ORIGIN, DESTINATION);
    assert.deepEqual(calls, ["first", "second"], "перебор продолжился после no-route");
    assert.equal(route.distanceMeters, 100, "успех второго провайдера");
  }

  // Все провайдеры вернули «не найдено» — итоговая ошибка того же типа.
  {
    const service = createRouteService({
      providers: [
        provider("a", async () => {
          throw new RouteNotFoundError("NoRoute");
        }),
        provider("b", async () => {
          throw new RouteNotFoundError("NoSegment");
        }),
      ],
    });
    await assert.rejects(
      () => service.getRoute(ORIGIN, DESTINATION),
      (err: unknown) => err instanceof RouteNotFoundError,
      "все no-route → RouteNotFoundError",
    );
  }

  // Все провайдеры упали по сети — итоговая ошибка сетевого типа.
  {
    const service = createRouteService({
      providers: [
        provider("a", async () => {
          throw new RouteNetworkError("timeout");
        }),
        provider("b", async () => {
          throw new RouteNetworkError("http 500");
        }),
      ],
    });
    await assert.rejects(
      () => service.getRoute(ORIGIN, DESTINATION),
      (err: unknown) => err instanceof RouteNetworkError,
      "все сетевые → RouteNetworkError",
    );
  }

  console.log("RouteService: все проверки пройдены");
}

run();
