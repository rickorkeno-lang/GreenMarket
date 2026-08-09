import type { ProductId } from "./Action";

/** CategoryId — общий доменный идентификатор категории. Раньше был локальным
 *  для catalog/, но категория используется и другими экранами (Search,
 *  Filters, Favorites, SellerCard, PurchaseOptions) — вынесен сюда по
 *  архитектурному решению. */
export type CategoryId = string & { readonly __brand: "CategoryId" };
export const asCategoryId = (id: string): CategoryId => id as CategoryId;

/** Агрегированная сводка по покупке — количество продавцов, недостающих
 *  товаров и итоговая стоимость. Раньше существовала как две одинаковые по
 *  форме модели (purchase_options/PurchaseSummary и basket/PurchaseSummary) —
 *  вынесена сюда по архитектурному решению: PurchaseOptionsViewModel и
 *  BasketViewModel используют один и тот же тип. Сырые числа — без
 *  форматирования, это забота presentation-слоя. */
export interface PurchaseSummary {
  sellersCount: number;
  missingCount: number;
  totalCost: number;
}

/** Доменная запись товара. Используется движком (mock-данные), Adapter'ом
 *  (сортировка/маппинг в RowItem) и SellerCardViewModel (basketProducts/
 *  otherProducts) — поэтому вынесена в общий пакет доменных контрактов,
 *  а не привязана к конкретному экрану. */
export interface ProductRecord {
  id: ProductId;
  name: string;
  price: number;
  unit: string;
  /** ТЗ-025 v1.1 §6: доступные (по умолчанию) / замена / отсутствует — определяет
   *  порядок и визуальную пометку строки. Backend вычисляет, не React. */
  availability?: "available" | "replacement" | "missing";
}

/** ТЗ-025 v1.1 §6: фиксированный порядок товаров продавца — доступные →
 *  замены → отсутствующие. Общий для того места, где производится сортировка
 *  (MockSellerRepository), и того, где список рендерится (SellerCardAdapter) —
 *  единый источник, чтобы порядок не разошёлся между данными и разметкой. */
export const PRODUCT_AVAILABILITY_ORDER: Record<NonNullable<ProductRecord["availability"]>, number> = {
  available: 0,
  replacement: 1,
  missing: 2,
};
