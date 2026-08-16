import { ApiSellerRepository } from "./ApiSellerRepository";
import { isMockSeller, MockSellerRepository } from "./MockSellerRepository";
import { withOfflineCache } from "./CachedSellerRepository";
import type { SellerRepository } from "./SellerRepository";

/**
 * Явная политика распределения данных (Паттерн Proxy / Composite).
 * Решает проблему маскировки ошибок и ложного offline-support'а.
 *
 * ПОЛИТИКА (Вариант A "production-like" для готового API + Вариант B для Демо):
 * 1. Реализованные методы бэкенда (markets, market sellers, seller products)
 *    маршрутизируются СТРОГО в API. При сетевой ошибке выбрасывается
 *    исключение, и UI честно покажет Error State, а не скроет его пустым моком.
 * 2. Запросы демо-сущностей, которых ещё нет на бэкенде (полный каталог,
 *    поиск, категории) идут в Mock.
 * 3. Гибридные запросы (Карточка продавца) прозрачно склеивают профиль из API
 *    с товарами из API (каталог продавца), а для демо-продавцов — из Mock'а.
 *
 * MAP-038 (offline-кэш): композиция дополнительно обёрнута
 * CachedSellerRepository — write-through кэш с fallback на последний удачный
 * ответ при недоступности сети. Архитектурно слой отделён (persistence/
 * OfflineCacheStore + repository/CachedSellerRepository), для потребителей
 * sellerRepository контракт и поведение не меняются: онлайн — свежие данные,
 * оффлайн — реальные данные из кэша вместо ошибки.
 */
const baseRepository: SellerRepository = {
  // Честные сетевые вызовы. Без скрытых моков.
  getVisibleMarkets: (bounds) => ApiSellerRepository.getVisibleMarkets(bounds),
  getMarketSellers: (marketId) => ApiSellerRepository.getMarketSellers(marketId),

  // Маршрутизация по принадлежности к Mock-каталогу (isMockSeller):
  // демо-продавцы отдаются из мока, реальные — с сервера.
  getSeller: (id) => (isMockSeller(id) ? MockSellerRepository.getSeller(id) : ApiSellerRepository.getSeller(id)),

  getSellerCard: async (id) => {
    if (isMockSeller(id)) return MockSellerRepository.getSellerCard(id);

    // Гибридная сборка для реального продавца: профиль из API, товары — из
    // реального каталога продавца (GET /sellers/{id}/products, уже на проде),
    // чтобы карточка продавца была на настоящих данных.
    const [card, products] = await Promise.all([
      ApiSellerRepository.getSellerCard(id),
      ApiSellerRepository.getSellerProducts(id),
    ]);
    const basketProducts = products.slice(0, 4);
    const have = basketProducts.filter((p) => p.availability === "available").length;
    return {
      ...card,
      basketProducts,
      otherProducts: products.slice(4),
      coverage: {
        have,
        total: basketProducts.length,
        fullyCovered: have === basketProducts.length,
      },
    };
  },

  // Делегирование в MockSellerRepository тех частей домена, которые ещё не написаны на Backend'е.
  getAllSellers: () => MockSellerRepository.getAllSellers(),
  getVisibleSellers: (bounds) => MockSellerRepository.getVisibleSellers(bounds),
  searchSellersNear: (req) => MockSellerRepository.searchSellersNear(req),
  searchSellers: (query) => MockSellerRepository.searchSellers(query),
  findSeller: (query) => MockSellerRepository.findSeller(query),
  getCategories: () => MockSellerRepository.getCategories(),
  // Каталог товаров продавца: реальные продавцы — с API (GET /sellers/{id}/products),
  // демо-продавцы (отрицательные ID) — из мока.
  getSellerProducts: (id) =>
    isMockSeller(id) ? MockSellerRepository.getSellerProducts(id) : ApiSellerRepository.getSellerProducts(id),
  getRecommendedSellers: (id) => MockSellerRepository.getRecommendedSellers(id),
  searchProductNames: (query) => MockSellerRepository.searchProductNames(query),
  searchSellersByProduct: (query) => MockSellerRepository.searchSellersByProduct(query),
};

/** Единственная точка входа для всех потребителей (MapRuntime, контроллер
 *  страницы продавца, SellerListScreenView): гибридная композиция, обёрнутая
 *  offline-кэшем (MAP-038). Слой кэша прозрачен — контракт SellerRepository. */
export const sellerRepository: SellerRepository = withOfflineCache(baseRepository);
