import type { GeoPoint } from "../viewmodels/MapViewModel";
import {
  RouteNetworkError,
  RouteNotFoundError,
  type RouteProvider,
  type RouteProviderResult,
} from "./RouteProvider";

/** HTTP-провайдер OSRM (MAP-020): публичный router.project-osrm.org или
 *  собственный osrm-routed (VITE_OSRM_SERVER_URL) — один и тот же контракт
 *  /route/v1/driving. CORS публичный сервер отдаёт, т.е. в веб-приложении
 *  работает напрямую без собственного Node-прокси (проверено: 200, и заголовок
 *  Access-Control-Allow-Origin: *, и реальный маршрут для тестовой территории
 *  Hessen/Франкфурт). Модель данных у OSRM фиксированная, поэтому здесь только
 *  URL, HTTP и отображение ответа — никакой логики маршрутизации.
 *
 *  Почему не Node-биндинг @project-osrm/osrm: он несовместим с подготовленным
 *  для этого проекта MLD-индексом (osrm-routed/mld-* файлы) — все запросы
 *  падают с NoSegment (у MLD нет метрик .hsgr CH). osrm-routed с тем же
 *  индексом работает — его и подключаем по env. */

export interface OsrmHttpProviderConfig {
  readonly name: string;
  readonly baseUrl: string;
  /** Округление координат до N знаков после запятой перед отправкой
   *  (публичный демо-сервер требует ≤ 5). undefined — без округления. */
  readonly roundTo?: number;
  readonly timeoutMs?: number;
}

interface OsrmRouteResponse {
  code: string;
  message?: string;
  routes?: Array<{ distance: number; duration: number; geometry: string }>;
}

function round(latLng: number, digits?: number): number {
  if (digits === undefined) return latLng;
  const factor = Math.pow(10, digits);
  return Math.round(latLng * factor) / factor;
}

/** URL запроса OSRM: координаты в формате "lng,lat;lng,lat" (широта/долгота
 *  в запросе наоборот относительно GeoPoint). geometries=polyline6 — геометрия
 *  как полилиния (декодируется PolylineCodec), overview=full — без упрощения. */
function buildOsrmRouteUrl(config: OsrmHttpProviderConfig, origin: GeoPoint, destination: GeoPoint): string {
  const originLng = round(origin.lng, config.roundTo);
  const originLat = round(origin.lat, config.roundTo);
  const destinationLng = round(destination.lng, config.roundTo);
  const destinationLat = round(destination.lat, config.roundTo);
  const coordinates = `${originLng},${originLat};${destinationLng},${destinationLat}`;
  return `${config.baseUrl}/route/v1/driving/${coordinates}?overview=full&geometries=polyline6&steps=false&alternatives=false`;
}

/** Таймаут + внешняя отмена в один AbortSignal: fetch по сигналу из браузера
 *  и по таймеру прерывается одним и тем же controller'ом. */
function withTimeoutAndExternal(
  config: OsrmHttpProviderConfig,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (config.timeoutMs === undefined) {
    return { signal: externalSignal ?? new AbortController().signal, cleanup: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onAbort);
    },
  };
}

export class OsrmHttpProvider implements RouteProvider {
  readonly name: string;
  private readonly config: OsrmHttpProviderConfig;

  constructor(config: OsrmHttpProviderConfig) {
    this.name = config.name;
    this.config = config;
  }

  async fetchRoute(origin: GeoPoint, destination: GeoPoint, signal?: AbortSignal): Promise<RouteProviderResult> {
    const { signal: combinedSignal, cleanup } = withTimeoutAndExternal(this.config, signal);
    let response: Response;
    try {
      response = await fetch(buildOsrmRouteUrl(this.config, origin, destination), { signal: combinedSignal });
    } catch (err) {
      throw new RouteNetworkError(`osrm: fetch failed (${this.config.name}): ${describeError(err)}`);
    } finally {
      cleanup();
    }
    if (!response.ok) {
      throw new RouteNetworkError(`osrm: HTTP ${response.status} (${this.config.name})`);
    }
    const data = (await response.json()) as OsrmRouteResponse;
    if (data.code !== "Ok") {
      // NoRoute/NoSegment/InvalidInput — путь между точками не найден; у другого
      // провайдера с той же парой точек результат может отличаться.
      throw new RouteNotFoundError(`osrm: ${data.code}${data.message ? ` ${data.message}` : ""} (${this.config.name})`);
    }
    const route = data.routes?.[0];
    if (!route) {
      throw new RouteNotFoundError(`osrm: Ok, но маршрут пуст (${this.config.name})`);
    }
    return {
      geometryEncoded: route.geometry,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    };
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.name === "AbortError" ? "timeout/abort" : err.message;
  return String(err);
}
