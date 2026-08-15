import type { GeoPoint, MapBounds } from "@/platform-core/map/viewmodels/MapViewModel";

/** IMP-003.1 §5: единый GeoService. Экран Map не обращается напрямую ни к
 *  navigator.geolocation, ни к API Leaflet — только к этому модулю.
 *  Геокодирование — через Nominatim (см. NOMINATIM_BASE_URL); в Stage 1
 *  используется по необходимости (например, для будущей строки поиска
 *  адреса), сам экран Map Stage 1 её не требует напрямую. */

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

/** Состояние периодического трекинга позиции (startTracking/stopTracking).
 *  Единственный таймер всего приложения, работающий с navigator.geolocation. */
let locationTrackingTimer: number | null = null;
let locationTrackingListener: ((location: GeoPoint) => void) | null = null;
let locationTrackingOnError: ((kind: "no-permission" | "unavailable") => void) | null = null;
let locationTrackingGeneration = 0;

function clearLocationTrackingTimer(): void {
  if (locationTrackingTimer !== null) {
    window.clearTimeout(locationTrackingTimer);
    locationTrackingTimer = null;
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

  /** Останавливает периодическое отслеживание позиции (если оно шло). */
  stopTracking(): void {
    clearLocationTrackingTimer();
    locationTrackingListener = null;
    locationTrackingOnError = null;
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
