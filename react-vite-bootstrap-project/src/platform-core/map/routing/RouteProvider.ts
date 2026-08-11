import type { GeoPoint } from "../viewmodels/MapViewModel";

/** Контракт провайдера маршрутов (MAP-020). Реализации: OSRM HTTP API
 *  (публичный демо-сервер router.project-osrm.org или собственный osrm-routed),
 *  в будущем — платная коммерческая гео-платформа. Одна реализация за другим
 *  перебирается сервисом (RouteService) как фолбэк: локальный сервер →
 *  публичный. Никакие детали транспорта/формата наружу не выходят. */

/** Маршрут не найден провайдером (OSRM вернул code ≠ "Ok": NoRoute, NoSegment,
 *  InvalidInput и т.п.) — переспрашивать другие провайдеры бессмысленно, но
 *  сервис может, т.к. у другого провайдера та же точка может быть достижима. */
export class RouteNotFoundError extends Error {}

/** Сетевой/транспортный сбой провайдера (HTTP-статус ≠ 200, таймаут, обрыв
 *  соединения, abort) — стоит попробовать следующий провайдер. */
export class RouteNetworkError extends Error {}

export interface RouteProviderResult {
  /** Геометрия маршрута в виде закодированной полилинии (точность на
   *  усмотрение провайдера — декодирует всегда один и тот же кодек). */
  geometryEncoded: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteProvider {
  readonly name: string;
  /** Построение маршрута от origin к destination. Кидает RouteNotFoundError
   *  (нет пути) или RouteNetworkError (сбой). signal — отмена/таймаут. */
  fetchRoute(origin: GeoPoint, destination: GeoPoint, signal?: AbortSignal): Promise<RouteProviderResult>;
}
