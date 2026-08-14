import { ApiSellerRepository } from "./ApiSellerRepository";
import { isMockSeller, MockSellerRepository } from "./MockSellerRepository";
import type { SellerRepository } from "./SellerRepository";

/**
 * Явная политика распределения данных (Паттерн Proxy / Composite).
 * Решает проблему маскировки ошибок и ложного offline-support'а.
 *
 * ПОЛИТИКА (Вариант A "production-like" для готового API + Вариант B для Демо):
 * 1. Реализованные методы бэкенда (markets, market sellers) маршрутизируются СТРОГО в API. 
 *    При сетевой ошибке выбрасывается исключение, и UI честно покажет Error State, а не скроет его пустым моком.
 * 2. Запросы демо-сущностей, которых ещё нет на бэкенде (полный каталог, поиск, категории) идут в Mock.
 * 3. Гибридные запросы (Карточка продавца) прозрачно склеивают профиль из API с товарами из Mock'а.
 */
export const sellerRepository: SellerRepository = {
  // Честные сетевые вызовы. Без скрытых моков.
  getVisibleMarkets: (bounds) => ApiSellerRepository.getVisibleMarkets(bounds),
  getMarketSellers: (marketId) => ApiSellerRepository.getMarketSellers(marketId),

  // Маршрутизация по принадлежности к Mock-каталогу (isMockSeller):
  // демо-продавцы отдаются из мока, реальные — с сервера.
  getSeller: (id) => (isMockSeller(id) ? MockSellerRepository.getSeller(id) : ApiSellerRepository.getSeller(id)),

  getSellerCard: async (id) => {
    if (isMockSeller(id)) return MockSellerRepository.getSellerCard(id);

    // Гибридная сборка для реального продавца: профиль берем с API, а товары из мока 
    // (так как апи товаров пока не готово), чтобы карточка продавца не была пустой.
    const [card, products] = await Promise.all([
      ApiSellerRepository.getSellerCard(id),
      MockSellerRepository.getSellerProducts(id) // Демо-fallback для товаров
    ]);

    return {
      ...card,
      basketProducts: products.slice(0, 4),
      otherProducts: products.slice(4),
      coverage: {
        have: products.length,
        total: products.length,
        fullyCovered: true,
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
  getSellerProducts: (id) => MockSellerRepository.getSellerProducts(id),
  getRecommendedSellers: (id) => MockSellerRepository.getRecommendedSellers(id),
  searchProductNames: (query) => MockSellerRepository.searchProductNames(query),
  searchSellersByProduct: (query) => MockSellerRepository.searchSellersByProduct(query),
};
