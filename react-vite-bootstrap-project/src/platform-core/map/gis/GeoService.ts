import type { GeoPoint, MapBounds } from "@/platform-core/map/viewmodels/MapViewModel";
import { locationRepository } from "@/platform-core/map/repository/locationIndex";
import type { UserPosition } from "@/platform-core/map/repository/LocationRepository";

/** IMP-003.1 §5: единый GeoService. Экран Map не обращается напрямую ни к
 *  navigator.geolocation, ни к API Leaflet — только к этому модулю.
 *  Геокодирование — через Nominatim (см. NOMINATIM_BASE_URL); в Stage 1
 *  используется по необходимости (например, для будущей строки поиска
 *  адреса), сам экран Map Stage 1 её не требует напрямую.
 *
 *  MAP-038 extension: интеграция с backend /location — позиция пользователя
 *  синхронизируется с сервером при включённом трекинге (POST /location),
 *  позиция другого пользователя (курьер/исполнитель) читается через
 *  readUserLocation (GET /location). */

const EARTH_RADIUS_METERS = 6_371_000;
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export interface GeocodeResult {
  point: GeoPoint;
  displayName: string;
}

/** Исход определения местоположения через GeoService#resolveUserLocation:
 *  "no-permission" — браузер явно запретил доступ (повторный промпт из JS
 *  невозможен), "unavailable" — геолокация недоступна/ошибка. Экран по этому
 *  результату показывает snackbar и не меняет положение карты. */
export type UserLocationResolution =
  | { status: "ok"; location: GeoPoint }
  | { status: "no-permission" }
  | { status: "unavailable" };

/** Период обновления позиции при включённой геолокации (см. startTracking):
 *  каждые 3 секунды запрашивается текущее местоположение и позиция
 *  обновляется на сайте (маркер пользователя, расстояния). */
export const LOCATION_TRACKING_INTERVAL_MS = 3000;

/** Интервал синхронизации позиции с бэкендом (POST /location).
 *  Отдельный от локального трекинга: бэкенд-запрос — fire-and-forget,
 *  не блокирует обновление маркера на карте. Каждые 10 секунд — компромисс
 *  между свежестью данных на сервере и нагрузкой. */
const BACKEND_SYNC_INTERVAL_MS = 10_000;

/** Состояние периодического трекинга позиции (startTracking/stopTracking).
 *  Единственный таймер всего приложения, работающий с navigator.geolocation. */
let locationTrackingTimer: number | null = null;
let locationTrackingListener: ((location: GeoPoint) => void) | null = null;
let locationTrackingOnError: ((kind: "no-permission" | "unavailable") => void) | null = null;
let locationTrackingGeneration = 0;

/** Состояние синхронизации позиции с бэкендом (MAP-038 extension).
 *  Отдельный таймер: POST /location — fire-and-forget, не влияет на
 *  локальный трекинг (маркер обновляется мгновенно от navigator.geolocation). */
let backendSyncTimer: number | null = null;
let backendSyncGeneration = 0;
let lastSyncedLocation: GeoPoint | null = null;

function clearLocationTrackingTimer(): void {
  if (locationTrackingTimer !== null) {
    window.clearTimeout(locationTrackingTimer);
    locationTrackingTimer = null;
  }
}

function clearBackendSyncTimer(): void {
  if (backendSyncTimer !== null) {
    window.clearTimeout(backendSyncTimer);
    backendSyncTimer = null;
  }
}

export const GeoService = {
  /** Haversine — расстояние по большому кругу между двумя точками WGS84. */
  distanceMeters(a: GeoPoint, b: GeoPoint): number {
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
  },

  /** Границы видимой области по центру и приблизительному масштабу — для
   *  Mock Repository (getVisibleSellers) на этапе, пока карта не отдаёт
   *  реальные границы через MapAdapter#onBoundsChanged. */
  boundsFromCenter(center: GeoPoint, radiusMeters: number): MapBounds {
    const latDelta = radiusMeters / 111_320; // ~метров в одном градусе широты
    const lngDelta = radiusMeters / (111_320 * Math.cos(toRadians(center.lat)));
    return {
      north: center.lat + latDelta,
      south: center.lat - latDelta,
      east: center.lng + lngDelta,
      west: center.lng - lngDelta,
    };
  },

  /** Состояние разрешения на геолокацию через Permissions API:
   *  'granted' | 'prompt' | 'denied'. null — если API недоступен. */
  async getPermissionState(): Promise<'granted' | 'prompt' | 'denied' | null> {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null;
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state;
    } catch {
      return null;
    }
  },

  /** Текущее местоположение пользователя. Единственное место в приложении,
   *  вызывающее navigator.geolocation — экран Map об этом API не знает.
   *  maximumAgeMs — допустимый возраст кэша позиции: разовый запрос допускает
   *  кэш (30 с), периодический трекинг — нет (0, только свежий фикс, см.
   *  startTracking). */
  getCurrentLocation(maximumAgeMs = 30_000): Promise<GeoPoint> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("Геолокация недоступна в этом окружении"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (error) => reject(error),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: maximumAgeMs },
      );
    });
  },

  /** Результат определения местоположения: успех с координатами либо причина
   *  отказа/недоступности (для snackbar экрана). */
  resolveUserLocation(): Promise<UserLocationResolution> {
    return (async () => {
      const permission = await this.getPermissionState();
      if (permission === "denied") return { status: "no-permission" };
      try {
        return { status: "ok", location: await this.getCurrentLocation() };
      } catch {
        return { status: "unavailable" };
      }
    })();
  },

  /** Запускает периодическое отслеживание позиции («при включённой гео»):
   *  пока идёт, каждые LOCATION_TRACKING_INTERVAL_MS запрашивается текущее
   *  местоположение (maximumAge 0 — только свежий фикс) и результат отдаётся
   *  в onLocation, чтобы экран обновил позицию на сайте (маркер пользователя,
   *  расстояния). Очередной запрос стартует через 3 с ПОСЛЕ завершения
   *  предыдущего — запросы не пересекаются. Сбой отдельного тика тихо
   *  пропускается (временная потеря сигнала не останавливает трекинг); если
   *  доступ отозван (denied) — трекинг останавливается и вызывается
   *  onError("no-permission"). Каждый запуск увеличивает locationTrackingGeneration:
   *  тики устаревшего цикла (пока их getCurrentLocation ещё в полёте) теряют право
   *  передавать позицию, обрабатывать ошибку и ставить следующий таймер, поэтому
   *  повторный вызов гарантированно сбрасывает предыдущий цикл — параллельных
   *  циклов и передачи устаревшей позиции новому слушателю не бывает.
   *  Остановка — GeoService#stopTracking (экран зовёт её при размонтировании). */
  startTracking(
    onLocation: (location: GeoPoint) => void,
    onError?: (kind: "no-permission" | "unavailable") => void,
  ): void {
    this.stopTracking();
    const generation = ++locationTrackingGeneration;
    locationTrackingListener = onLocation;
    locationTrackingOnError = onError ?? null;
    const tick = async (): Promise<void> => {
      if (generation !== locationTrackingGeneration || !locationTrackingListener) return;
      try {
        const location = await this.getCurrentLocation(0);
        if (generation !== locationTrackingGeneration) return;
        locationTrackingListener?.(location);
      } catch {
        const permission = await this.getPermissionState();
        if (generation !== locationTrackingGeneration) return;
        if (permission === "denied") {
          locationTrackingOnError?.("no-permission");
          this.stopTracking();
          return;
        }
      }
      if (generation !== locationTrackingGeneration || !locationTrackingListener) return;
      locationTrackingTimer = window.setTimeout(tick, LOCATION_TRACKING_INTERVAL_MS);
    };
    void tick();
  },

  /** Останавливает периодическое отслеживание позиции (если оно шло).
   *  Также останавливает синхронизацию с бэкендом. */
  stopTracking(): void {
    clearLocationTrackingTimer();
    clearBackendSyncTimer();
    locationTrackingListener = null;
    locationTrackingOnError = null;
    lastSyncedLocation = null;
  },

  /** Запускает синхронизацию позиции с бэкендом (MAP-038 extension).
   *  Каждые BACKEND_SYNC_INTERVAL_MS отправляет последнюю известную позицию
   *  на сервер через POST /location (fire-and-forget). Запросы не пересекаются
   *  (предыдущий тик завершается до запуска следующего). Ошибки отправки
   *  тихо пропускаются — локальный трекинг продолжает работать. */
  startBackendSync(getCurrentLocation: () => GeoPoint | null): void {
    this.stopBackendSync();
    const generation = ++backendSyncGeneration;

    const tick = async (): Promise<void> => {
      if (generation !== backendSyncGeneration) return;

      const location = getCurrentLocation();
      if (location !== null) {
        // Отправляем только если позиция изменилась ( экономим трафик).
        const changed =
          lastSyncedLocation === null ||
          Math.abs(lastSyncedLocation.lat - location.lat) > 1e-6 ||
          Math.abs(lastSyncedLocation.lng - location.lng) > 1e-6;

        if (changed) {
          lastSyncedLocation = location;
          try {
            await locationRepository.writeLocation({
              latitude: location.lat,
              longitude: location.lng,
              mode: 'point',
            });
          } catch {
            // Fire-and-forget: ошибка отправки не критична,
            // трекинг продолжит при следующем тике.
          }
        }
      }

      if (generation !== backendSyncGeneration) return;
      backendSyncTimer = window.setTimeout(tick, BACKEND_SYNC_INTERVAL_MS);
    };

    void tick();
  },

  /** Останавливает синхронизацию с бэкендом (без остановки локального
   *  трекинга). */
  stopBackendSync(): void {
    clearBackendSyncTimer();
    lastSyncedLocation = null;
  },

  /** Чтение позиции пользователя с бэкенда (MAP-038 extension).
   *  Для отображения позиции курьера/исполнителя на карте активного заказа.
   *  Использует CachedLocationRepository — offline fallback на последний
   *  кэш. Возвращает null, если позиция не найдена или бэкенд недоступен
   *  (без кэша). */
  async readUserLocation(userId: string): Promise<GeoPoint | null> {
    try {
      const result = await locationRepository.readLocation({
        userId,
        point: true,
        history: false,
      });
      if (result.point === null) return null;
      return { lat: result.point.latitude, lng: result.point.longitude };
    } catch {
      return null;
    }
  },

  /** Чтение позиции пользователя с бэкенда (с расширенной информацией).
   *  Возвращает UserPosition с временем обновления — для проверки актуальности
   *  (например, «позиция обновлена более минуты назад — показать предупреждение»). */
  async readUserPosition(userId: string): Promise<UserPosition | null> {
    try {
      const result = await locationRepository.readLocation({
        userId,
        point: true,
        history: false,
      });
      return result.point;
    } catch {
      return null;
    }
  },

  /** Геокодирование адреса через Nominatim. Сетевой вызов — при недоступности
   *  сети возвращает пустой массив, а не бросает исключение (не блокирует
   *  остальной экран). */
  async geocodeAddress(query: string): Promise<GeocodeResult[]> {
    try {
      const url = `${NOMINATIM_BASE_URL}/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=5`;
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) return [];
      const data: Array<{ lat: string; lon: string; display_name: string }> = await response.json();
      return data.map((item) => ({
        point: { lat: Number.parseFloat(item.lat), lng: Number.parseFloat(item.lon) },
        displayName: item.display_name,
      }));
    } catch {
      return [];
    }
  },

  /** Обратное геокодирование координат в название района/города. */
  async reverseGeocode(point: GeoPoint): Promise<string | null> {
    try {
      const url = `${NOMINATIM_BASE_URL}/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lng}`;
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) return null;
      const data: { address?: { suburb?: string; city?: string; town?: string; village?: string } } =
        await response.json();
      return data.address?.suburb ?? data.address?.city ?? data.address?.town ?? data.address?.village ?? null;
    } catch {
      return null;
    }
  },
};
