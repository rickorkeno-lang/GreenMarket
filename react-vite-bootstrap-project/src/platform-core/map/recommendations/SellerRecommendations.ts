import type { SellerMapRecord } from "@/platform-core/map/viewmodels/MapViewModel";

/* ============================================================================
 * Рекомендации продавцов (низ страницы продавца).
 *
 * Рекомендуем продавцов, у которых есть общие категории с текущим. Сортировка
 * по требованию задачи: сначала те, с кем совпадают ВСЕ категории, затем —
 * по убыванию количества общих категорий. При равенстве — ближайшие по
 * расстоянию, затем стабильный порядок по sellerId.
 *
 * Чистая функция над доменными записями — её просто тестировать без
 * репозитория; сам Repository использует её в getRecommendedSellers.
 * ========================================================================== */

export interface RecommendedSeller {
  seller: SellerMapRecord;
  /** Сколько категорий общих с текущим продавцом. */
  commonCategories: number;
  /** Названия общих категорий — показываем в подсказке «почему рекомендован». */
  sharedCategoryNames: string[];
  /** true, когда совпадают ВСЕ категории обеих сторон. */
  allCategoriesShared: boolean;
}

/** Ранжирование «похожих» продавцов. current не включается в результат;
 *  продавцы без общих категорий отбрасываются. */
export function rankRecommendedSellers(
  current: SellerMapRecord,
  all: SellerMapRecord[],
): RecommendedSeller[] {
  const currentCategories = new Set(current.categories);

  return all
    .filter((seller) => seller.sellerId !== current.sellerId)
    .map((seller) => {
      const sharedCategoryIds = seller.categories.filter((categoryId) => currentCategories.has(categoryId));
      const sharedCategoryNames = sharedCategoryIds.map(
        (categoryId) => seller.categoryNames[seller.categories.indexOf(categoryId)],
      );
      return {
        seller,
        commonCategories: sharedCategoryIds.length,
        sharedCategoryNames,
        allCategoriesShared:
          sharedCategoryIds.length === current.categories.length &&
          sharedCategoryIds.length === seller.categories.length,
      };
    })
    .filter((recommendation) => recommendation.commonCategories > 0)
    .sort((a, b) => {
      // 1) все общие категории — вперёд; 2) больше общих — вперёд;
      // 3) ближе по расстоянию; 4) детерминированный порядок по sellerId.
      return (
        Number(b.allCategoriesShared) - Number(a.allCategoriesShared) ||
        b.commonCategories - a.commonCategories ||
        (a.seller.distanceMeters ?? 0) - (b.seller.distanceMeters ?? 0) ||
        (a.seller.sellerId < b.seller.sellerId ? -1 : 1)
      );
    });
}
