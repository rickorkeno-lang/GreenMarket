import type { SellerId } from "@/platform-core/contracts/Action";
import type { CategoryId } from "@/platform-core/contracts/DomainTypes";
import type { GeoPoint, MapBounds, SellerMapRecord } from "@/platform-core/map/viewmodels/MapViewModel";
import type { SellerCardViewModel } from "@/platform-core/viewmodels/SellerCardViewModel";
import type { SellerProductRecord } from "@/platform-core/map/repository/mockSellerCatalog";
import type { RecommendedSeller } from "@/platform-core/map/recommendations/SellerRecommendations";

export interface CategoryOption {
  categoryId: CategoryId;
  name: string;
}

/** Ключ сортировки результатов «Поиска продавцов» (MAP-053/MAP-018). Сейчас
 *  реализован только "distance"; добавление нового ключа (rating, popularity,
 *  deliveryTime, ...) не меняет мастер поиска и метод searchSellersNear —
 *  только этот union-тип и запись в SELLER_SORTS (см. MockSellerRepository). */
export type SellerSortKey = "distance";

export interface SellerSort {
  key: SellerSortKey;
}

/** Запрос «Поиска продавцов»: точка поиска + радиус + способ сортировки.
 *  Разделение «что ищем» и «как сортируем» позволяет добавлять новые
 *  сортировки без переработки поиска. */
export interface SellerSearchRequest {
  origin: GeoPoint;
  radiusMeters: number;
  sort: SellerSort;
}

/** IMP-003.1 §13: минимальный контракт Repository для экрана Map. Экран и
 *  ViewModel обращаются только к этому интерфейсу — реализация (сегодня
 *  MockSellerRepository, завтра — HTTP-клиент к Backend) может замениться
 *  без изменения экрана. */
export interface SellerRepository {
  /** Весь каталог продавцов без геофильтра — то, что показывает экран
   *  SellerList (список не отражает вьюпорт карты, а отдаёт всех). */
  getAllSellers(): Promise<SellerMapRecord[]>;
  getVisibleSellers(bounds: MapBounds): Promise<SellerMapRecord[]>;
  getSeller(id: SellerId): Promise<SellerMapRecord | null>;
  /** Поиск продавцов вокруг точки (MAP-053/MAP-018): продавцы в радиусе от
   *  точки, отсортированные согласно request.sort (сейчас — только по
   *  расстоянию). distanceMeters в результате пересчитывается от точки
   *  поиска (а не от центра тестовой территории). */
  searchSellersNear(request: SellerSearchRequest): Promise<SellerMapRecord[]>;
  searchSellers(query: string): Promise<SellerMapRecord[]>;
  /** IMP-003.1.2 §11: единичный лучший результат по названию — то, что
   *  строка поиска (§6) центрирует карту и открывает Bottom Sheet на одном
   *  продавце. searchSellers() остаётся для случаев, когда нужен весь
   *  список совпадений. */
  findSeller(query: string): Promise<SellerMapRecord | null>;
  getCategories(): Promise<CategoryOption[]>;
  /** Страница продавца (ТЗ-025 §12): доменная SellerCardViewModel. Методы ниже
   *  обслуживают экран SellerCard и живут в этом же репозитории, т.к. продавец
   *  и его товары — один источник данных (Map о них не знает). */
  getSellerCard(id: SellerId): Promise<SellerCardViewModel>;
  /** Каталог товаров продавца с полями для страницы (эмодзи, описание,
   *  категория), отсортированный доступные → замены → отсутствующие. */
  getSellerProducts(id: SellerId): Promise<SellerProductRecord[]>;
  /** Похожие продавцы: сначала все общие категории, затем по убыванию числа
   *  общих — см. rankRecommendedSellers. */
  getRecommendedSellers(id: SellerId): Promise<RecommendedSeller[]>;
}
