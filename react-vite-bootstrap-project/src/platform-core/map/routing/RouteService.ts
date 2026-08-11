import type { GeoPoint, RouteModel } from "../viewmodels/MapViewModel";
import { decodePolyline } from "./PolylineCodec";
import {
  RouteNetworkError,
  RouteNotFoundError,
  type RouteProvider,
} from "./RouteProvider";

/** Сервис построения маршрута (MAP-020): перебирает провайдеров по порядку
 *  (первый успешный ответ выигрывает) и отображает сырой ответ в доменную
 *  RouteModel (декодированная полилиния + метрики). Ошибки классифицируются
 *  по типу: сетевой сбой одного провайдера не останавливает перебор,
 *  «маршрут не найден» тоже — другой провайдер может построить путь.
 *
 *  Задача сервиса — связка провайдеров и кодека; время/порядок запросов
 *  (дебаунс, отмена устаревшего запроса) живут в MapRuntime#requestRoute. */
export interface RouteServiceConfig {
  providers: RouteProvider[];
}

export interface RouteService {
  getRoute(origin: GeoPoint, destination: GeoPoint, signal?: AbortSignal): Promise<RouteModel>;
}

export function createRouteService(config: RouteServiceConfig): RouteService {
  async function getRoute(origin: GeoPoint, destination: GeoPoint, signal?: AbortSignal): Promise<RouteModel> {
    let sawNotFound = false;
    for (const provider of config.providers) {
      if (signal?.aborted) throw new RouteNetworkError("route: aborted");
      try {
        const result = await provider.fetchRoute(origin, destination, signal);
        return {
          geometry: decodePolyline(result.geometryEncoded),
          distanceMeters: result.distanceMeters,
          durationSeconds: result.durationSeconds,
        };
      } catch (err) {
        if (err instanceof RouteNotFoundError) {
          sawNotFound = true;
          continue;
        }
        if (err instanceof RouteNetworkError) continue;
        throw new RouteNetworkError("route: unexpected provider error");
      }
    }
    if (sawNotFound) throw new RouteNotFoundError("route: не найден ни одним провайдером");
    throw new RouteNetworkError("route: все провайдеры недоступны");
  }

  return { getRoute };
}
