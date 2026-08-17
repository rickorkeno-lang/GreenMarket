import type {
  LocationRepository,
  LocationWriteRequest,
  LocationWriteResult,
  LocationReadRequest,
  LocationReadResult,
} from '@/platform-core/map/repository/LocationRepository';
import { OfflineCacheStore } from '@/platform-core/map/persistence/OfflineCacheStore';

/* ============================================================================
 * CachedLocationRepository — offline-кэш геопозиции (MAP-038 extension).
 *
 * Декоратор поверх ApiLocationRepository: write-through кэш с fallback.
 *
 * Стратегия:
 * - writeLocation: успешная запись НЕ кэшируется (это команда, а не данные
 *   для чтения); ошибка сети/5xx — молча пропускаем (позиция останется
 *   последней отправленной, повторная попытка при следующем тике трекинга);
 *   4xx — пробрасываем (авторизация/валидация).
 *
 * - readLocation: успешный ответ пишется в кэш по userId и возвращается;
 *   сеть/5xx — отдаём последний кэш для этого userId; 4xx — инвалидируем
 *   кэш, пробрасываем ошибку.
 *
 * Ключ кэша: `location:point:{userId}` — текущая позиция.
 * История НЕ кэшируется (объёмы большие, ценность для offline мала).
 * ========================================================================== */

const CACHE_KEYS = {
  point: (userId: string) => `location:point:${userId}`,
};

/** Сетевая ошибка fetch: TypeError («Failed to fetch»). */
function isNetworkUnreachable(err: unknown): boolean {
  return err instanceof TypeError;
}

function isServerError(err: unknown): boolean {
  return err instanceof Error && /^HTTP Error: 5\d/.test(err.message);
}

function isClientError(err: unknown): boolean {
  return err instanceof Error && /^HTTP Error: 4\d/.test(err.message);
}

/** Оборачивает репозиторий геопозиции кэшем с fallback. */
export function withLocationCache(inner: LocationRepository): LocationRepository {
  return {
    /** Запись позиции: write-through не нужен (команда, не данные для чтения).
     *  Ошибка сети/5xx — тихо пропускаем: трекинг продолжит при следующем
     *  тике; 4xx — пробрасываем (проблема с авторизацией). */
    async writeLocation(request: LocationWriteRequest): Promise<LocationWriteResult> {
      try {
        return await inner.writeLocation(request);
      } catch (err) {
        if (isNetworkUnreachable(err) || isServerError(err)) {
          return { success: false };
        }
        throw err;
      }
    },

    /** Чтение позиции: write-through + fallback.
     *  Онлайн — свежий ответ от бэкенда пишется в кэш.
     *  Оффлайн/5xx — последний кэш для этого userId.
     *  4xx — кэш инвалидируется, ошибка пробрасывается. */
    async readLocation(request: LocationReadRequest): Promise<LocationReadResult> {
      const cacheKey = CACHE_KEYS.point(request.userId);

      try {
        const result = await inner.readLocation(request);
        // Кэшируем только point (history не кэшируем — см. шапку).
        if (request.point !== false && result.point !== null) {
          OfflineCacheStore.write(cacheKey, result.point);
        }
        return result;
      } catch (err) {
        if (isNetworkUnreachable(err) || isServerError(err)) {
          const cached = OfflineCacheStore.read<LocationReadResult['point']>(cacheKey);
          if (cached !== null) {
            return { point: cached, history: [] };
          }
        }
        if (isClientError(err)) OfflineCacheStore.remove(cacheKey);
        throw err;
      }
    },
  } satisfies LocationRepository;
}
