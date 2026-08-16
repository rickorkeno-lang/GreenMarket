import type {
  MapBounds,
  MarketMapRecord,
  SellerMapRecord,
} from '@/platform-core/map/viewmodels/MapViewModel';
import type { SellerRepository } from '@/platform-core/map/repository/SellerRepository';
import { OfflineCacheStore } from '@/platform-core/map/persistence/OfflineCacheStore';
import { isMockSeller } from '@/platform-core/map/repository/MockSellerRepository';

/* ============================================================================
 * CachedSellerRepository — offline-кэш карты и продавцов (MAP-038).
 *
 * Архитектурно — отдельный декоратор поверх композиции repository.ts
 * (гибрид «реальный API + мок»): сам по себе источник данных не меняет,
 * только оборачивает сетевые методы. Мок-методы (поиск, рекомендации,
 * категории) работают локально всегда и в кэш не попадают.
 *
 * Стратегия — write-through + fallback:
 *  - успешный ответ бэкенда пишется в OfflineCacheStore и возвращается как есть
 *    (онлайн — всегда свежие данные, пользователь разницы не видит);
 *  - сетевая недоступность (fetch → TypeError) или 5xx отдаёт последний
 *    удачный ответ из кэша — реальные данные, не выдуманные (принцип repository.ts:
 *    ошибка не маскируется пустым моком, а заменяется честным кэшем);
 *  - 4xx (ресурс удалён/деактивирован) — кэш инвалидируется, ошибка
 *    пробрасывается: устаревший продавец не должен «оживать» оффлайн.
 *
 * Кэшируются только сетевые данные: точки торговли (глобальный список, на
 * чтении фильтруется по границам), продавцы точки, продавец, карточка
 * продавца и каталог его товаров — ровно слой карты из контракта 12.08.2026
 * («это ровно то, что MAP-038 кэширует»).
 * ========================================================================== */

/** «Весь мир» для единичного запроса точек торговли: бэкенд отдаёт все точки
 *  одним списком (bounds-фильтр — обязанность клиента), поэтому кэшируется
 *  полный список, а на чтении он фильтруется по фактическим границам карты. */
const FULL_WORLD_BOUNDS: MapBounds = { north: 90, south: -90, east: 180, west: -180 };

const CACHE_KEYS = {
  markets: 'markets',
  marketSellers: (marketId: string) => `market-sellers:${marketId}`,
  seller: (sellerId: string) => `seller:${sellerId}`,
  sellerCard: (sellerId: string) => `seller-card:${sellerId}`,
  sellerProducts: (sellerId: string) => `seller-products:${sellerId}`,
};

/** Сетевая ошибка fetch: TypeError («Failed to fetch») бросает сам браузер,
 *  когда соединение недоступно (offline, DNS, TLS). HTTP-ошибки до этой
 *  ветки не доходят — у репозитория это Error с сообщением «HTTP Error: N». */
function isNetworkUnreachable(err: unknown): boolean {
  return err instanceof TypeError;
}

function isServerError(err: unknown): boolean {
  return err instanceof Error && /^HTTP Error: 5\d/.test(err.message);
}

function isClientError(err: unknown): boolean {
  return err instanceof Error && /^HTTP Error: 4\d/.test(err.message);
}

function filterMarketsByBounds(markets: MarketMapRecord[], bounds: MapBounds): MarketMapRecord[] {
  return markets.filter(
    (m) =>
      m.location.lat <= bounds.north &&
      m.location.lat >= bounds.south &&
      m.location.lng >= bounds.west &&
      m.location.lng <= bounds.east,
  );
}

/** Мок-продавцы (отрицательные id) — локальные демо-данные, сети не трогают:
 *  кэшировать их незачем (и нечего), поэтому они не пишутся в localStorage. */
function isCachableId(id: string): boolean {
  return !isMockSeller(id);
}

/** Оборачивает репозиторий кэшем: loader вызывается всегда (write-through),
 *  кэш отдаётся только при недоступности сети/5xx, 4xx инвалидирует запись.
 *  Синхронный throw от loader'а обрабатывается так же, как сетевая ошибка:
 *  Promise.resolve().then() ловит и его, и асинхронный rejection. */
function cacheOrFail<T>(key: string, loader: () => Promise<T>): Promise<T> {
  return Promise.resolve()
    .then(loader)
    .then(
      (value) => {
        OfflineCacheStore.write(key, value);
        return value;
      },
      (err: unknown) => {
        if (isNetworkUnreachable(err) || isServerError(err)) {
          const cached = OfflineCacheStore.read<T>(key);
          if (cached !== null) return cached;
        }
        if (isClientError(err)) OfflineCacheStore.remove(key);
        throw err;
      },
    );
}

export function withOfflineCache(inner: SellerRepository): SellerRepository {
  return {
    // Все немодифицированные методы делегируются внутреннему источнику.
    ...inner,

    /** Точки торговли: кэшируем полный список, на чтении фильтруем по
     *  фактическим границам — и онлайн, и из кэша поведение одинаково. */
    getVisibleMarkets: async (bounds) => {
      try {
        const all = await inner.getVisibleMarkets(FULL_WORLD_BOUNDS);
        OfflineCacheStore.write(CACHE_KEYS.markets, all);
        return filterMarketsByBounds(all, bounds);
      } catch (err) {
        if (isNetworkUnreachable(err) || isServerError(err)) {
          const cached = OfflineCacheStore.read<MarketMapRecord[]>(CACHE_KEYS.markets);
          if (cached !== null) return filterMarketsByBounds(cached, bounds);
        }
        throw err;
      }
    },

    getMarketSellers: (marketId) =>
      cacheOrFail(CACHE_KEYS.marketSellers(marketId), () => inner.getMarketSellers(marketId)),

    getSeller: async (id) => {
      const key = CACHE_KEYS.seller(id);
      try {
        const seller = await inner.getSeller(id);
        if (seller === null) {
          // Онлайн ответил «не существует» — устаревший кэш больше не нужен.
          OfflineCacheStore.remove(key);
          return null;
        }
        if (isCachableId(id)) OfflineCacheStore.write(key, seller);
        return seller;
      } catch (err) {
        if (isNetworkUnreachable(err) || isServerError(err)) {
          const cached = OfflineCacheStore.read<SellerMapRecord>(key);
          if (cached !== null) return cached;
        }
        if (isClientError(err)) OfflineCacheStore.remove(key);
        throw err;
      }
    },

    getSellerCard: (id) =>
      isCachableId(id)
        ? cacheOrFail(CACHE_KEYS.sellerCard(id), () => inner.getSellerCard(id))
        : inner.getSellerCard(id),

    getSellerProducts: (id) =>
      isCachableId(id)
        ? cacheOrFail(CACHE_KEYS.sellerProducts(id), () => inner.getSellerProducts(id))
        : inner.getSellerProducts(id),
  } satisfies SellerRepository;
}
