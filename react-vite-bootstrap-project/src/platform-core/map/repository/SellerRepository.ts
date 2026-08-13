import type { MarketId, SellerId } from "@/platform-core/contracts/Action";
import type { CategoryId, ProductRecord } from "@/platform-core/contracts/DomainTypes";
import type {
  GeoPoint,
  MapBounds,
  MarketMapRecord,
  MarketSellerRecord,
  SellerMapRecord,
} from "@/platform-core/map/viewmodels/MapViewModel";
import type { SellerCardViewModel } from "@/platform-core/viewmodels/SellerCardViewModel";
import type { RecommendedSeller } from "@/platform-core/map/recommendations/SellerRecommendations";
import type { ProductNameSuggestion, ProductSearchResult } from "@/platform-core/map/product-search/ProductSearch";

export interface CategoryOption {
  categoryId: CategoryId;
  name: string;
}

/** Товар продавца на странице SellerCard (ТЗ-025): расширяет доменный
 *  ProductRecord (id/name/price/unit/availability) полями, которые нужны
 *  странице для красивого вывода: categoryId (для группировки/эмодзи),
 *  emoji и description. Тип определён в контракте, а не в mock-каталоге
 *  (замечание ревью №14): экран и репозиторий работают с ним независимо от
 *  реализации источника данных.
 *
 *  tags — ключевые слова для поиска по товару (синонимы/варианты написания).
 *  Страница продавца их не показывает, но поиск по товарам строится на них
 *  (см. platform-core/map/product-search/ProductSearch.ts). */
export interface SellerProductRecord extends ProductRecord {
  categoryId: CategoryId;
  emoji: string;
  description: string;
  tags: string[];
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

/** Допустимые границы радиуса «Поиска продавцов» (метры). Диапазон намеренно
 *  широкий: верхняя граница — половина окружности Земли (~20 037 км), т.е.
 *  охватывает любую точку планеты (противоположный конец России ~10 000 км,
 *  соседняя страна — ещё меньше), чтобы пользователь не мог упереться в лимит
 *  даже при самом смелом запросе. Нижняя — минимально осмысленный радиус. */
export const SELLER_SEARCH_RADIUS_MIN_METERS = 100;
export const SELLER_SEARCH_RADIUS_MAX_METERS = 20_000_000;

/** IMP-003.1 §13: минимальный контракт Repository для экрана Map. Экран и
 *  ViewModel обращаются только к этому интерфейсу — реализация (сегодня
 *  MockSellerRepository, завтра — HTTP-клиент к Backend) может замениться
 *  без изменения экрана.
 *
 *  ГРАНИЦЫ ОТВЕТСТВЕННОСТИ (замечание №48): гео-фильтрация (по границам
 *  карты/радиусу), пересчёт distanceMeters от точки запроса и сортировка
 *  результатов — ОБЯЗАННОСТЬ реализации, а не клиента. Контракт каждого
 *  метода отдаёт результат уже отфильтрованным, с актуальными расстояниями
 *  и в оговорённом порядке. Клиент не выполняет эти операции сам (и не
 *  должен рассчитывать, что реализация их пропустит): при замене Mock на
 *  Backend это гарантирует одинаковое поведение без правок экрана. */
export interface SellerRepository {
  /** Весь каталог продавцов без геофильтра — то, что показывает экран
   *  SellerList (список не отражает вьюпорт карты, а отдаёт всех). Сортировка
   *  не оговорена — каталог в порядке, заявленном реализацией. */
  getAllSellers(): Promise<SellerMapRecord[]>;
  /** Продавцы, попадающие в прямоугольник границ карты (гео-фильтр по
   *  bounds — обязанность реализации, см. выше). Сортировка не оговорена. */
  getVisibleSellers(bounds: MapBounds): Promise<SellerMapRecord[]>;
  /* ====== Точки торговли — рынки/лавки (задача «Маркеты», GET /markets) ======
   * Пин точки — отдельная сущность от пинов продавцов: рынок с сотнями
   * продавцов не должен рисоваться их кластерами. Методы обслуживают карту
   * (MapRuntime.requestVisibleMarkets/loadMarketSellers); гео-фильтр по bounds
   * и приведение id к доменным (market-…) — обязанность реализации. */
  /** Точки торговли в прямоугольнике границ карты. Сортировка не оговорена. */
  getVisibleMarkets(bounds: MapBounds): Promise<MarketMapRecord[]>;
  /** Продавцы конкретной точки (GET /markets/{id}/sellers): краткие записи
   *  списка (ряд/место, часы, число товаров); полный профиль/товары
   *  догружаются по sellerId штатными getSeller/getSellerCard. */
  getMarketSellers(marketId: MarketId): Promise<MarketSellerRecord[]>;
  getSeller(id: SellerId): Promise<SellerMapRecord | null>;
  /** Поиск продавцов вокруг точки (MAP-053/MAP-018): продавцы в радиусе от
   *  точки, отсортированные согласно request.sort (сейчас — только по
   *  расстоянию). Фильтрация по радиусу, пересчёт distanceMeters от точки
   *  поиска (а не от центра тестовой территории) и сортировка — обязанность
   *  реализации; клиент получает готовый список. */
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
  /* ====== Поиск продавцов по товарам (см. platform-core/map/product-search) ======
   * Два метода: автодополнение названий товаров (подсказки «допиши название»)
   * и поиск продавцов по товару. Продавцы в результатах отсортированы по
   * расстоянию, как в обычном поиске; цена на товар прилагается к каждому. */
  searchProductNames(query: string): Promise<ProductNameSuggestion[]>;
  searchSellersByProduct(query: string): Promise<ProductSearchResult>;
}
