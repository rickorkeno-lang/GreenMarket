import { ApiLocationRepository } from './ApiLocationRepository';
import { withLocationCache } from './CachedLocationRepository';
import type { LocationRepository } from './LocationRepository';

/* ============================================================================
 * locationIndex — единственный вход для потребителей геопозиции.
 *
 * Аналог repository.ts для продавцов: API-реализация обёрнута offline-кэшем
 * (CachedLocationRepository). Потребители (GeoService, MapRuntime) не знают,
 * идёт запрос к бэкенду или данные берутся из кэша — контракт LocationRepository.
 *
 * Мок-реализация не нужна: геопозиция — системный ресурс, не доменные данные.
 * В окружениях без бэкенда (тесты) мокается на уровне API-клиента.
 * ========================================================================== */

export const locationRepository: LocationRepository = withLocationCache(ApiLocationRepository);
