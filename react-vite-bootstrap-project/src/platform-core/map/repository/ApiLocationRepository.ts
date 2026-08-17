import type {
  LocationRepository,
  LocationWriteRequest,
  LocationWriteResult,
  LocationReadRequest,
  LocationReadResult,
  UserPosition,
} from '@/platform-core/map/repository/LocationRepository';

/* ============================================================================
 * ApiLocationRepository — чистый API-клиент для эндпоинта /location.
 *
 * Реализует контракт LocationRepository через бэкенд:
 * - POST /api/v1/location — запись геопозиции текущего пользователя
 * - GET  /api/v1/location — чтение позиции другого пользователя
 *
 * Никаких fallback/моков внутри — ошибка сети = выброшенное исключение
 * (чинит CachedLocationRepository или долетит до UI как failed state).
 * ========================================================================== */

const API_BASE = (import.meta.env?.VITE_API_BASE as string | undefined) ?? '/api/v1';

/** Бэкенд-формат ответа POST /location. */
interface BackendLocationWriteResponse {
  success: boolean;
}

/** Бэкенд-формат записи позиции (GET /location). */
interface BackendUserPosition {
  user_id: number;
  latitude: number;
  longitude: number;
  updated_at: string;
  /** Дополнительные данные (data JSON). */
  data?: Record<string, unknown>;
}

/** Бэкенд-формат ответа GET /location. */
interface BackendLocationReadResponse {
  point?: BackendUserPosition | null;
  history?: BackendUserPosition[];
}

/** Маппинг бэкенд-записи в доменную UserPosition. */
function mapBackendPosition(pos: BackendUserPosition): UserPosition {
  return {
    userId: String(pos.user_id),
    latitude: pos.latitude,
    longitude: pos.longitude,
    updatedAt: pos.updated_at,
  };
}

/**
 * ЧИСТЫЙ API-РЕПОЗИТОРИЙ ГЕОПОЗИЦИИ.
 * Отвечает ТОЛЬКО за сетевые вызовы к /location.
 * Ошибка сети = исключение ( CachedLocationRepository или UI обработают).
 */
export const ApiLocationRepository: LocationRepository = {
  async writeLocation(request: LocationWriteRequest): Promise<LocationWriteResult> {
    const body: Record<string, unknown> = {
      latitude: request.latitude,
      longitude: request.longitude,
    };
    if (request.data !== undefined) body.data = request.data;
    if (request.mode !== undefined) body.mode = request.mode;

    const res = await fetch(`${API_BASE}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

    const data = (await res.json()) as BackendLocationWriteResponse;
    return { success: data.success ?? true };
  },

  async readLocation(request: LocationReadRequest): Promise<LocationReadResult> {
    const params = new URLSearchParams({ u_id: request.userId });
    if (request.point !== undefined) params.set('point', String(request.point));
    if (request.history !== undefined) params.set('history', String(request.history));
    if (request.service !== undefined) params.set('service', request.service);

    const res = await fetch(`${API_BASE}/location?${params.toString()}`);

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

    const data = (await res.json()) as BackendLocationReadResponse;

    return {
      point: data.point ? mapBackendPosition(data.point) : null,
      history: (data.history ?? []).map(mapBackendPosition),
    };
  },
};
