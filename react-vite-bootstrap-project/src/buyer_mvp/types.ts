// Buyer MVP (Stage 1) — типы Catalog API.
// Контракт product-centric, подтверждён по коду бэкенда (не только по доке):
// товар (Product) — главная сущность, offers[] — предложения продавцов внутри него.
// НЕ путать с platform-core/* — там другая, seller-centric модель (заготовка
// под будущие этапы), к Buyer MVP не относится и не переиспользуется.
//
// price / min_price / stock — строки (backend сериализует Decimal как JSON string,
// чтобы не терять точность). Парсить перед арифметикой, не полагаться на typeof.

export interface ProductGroup {
  id: number;
  parent_id: number | null;
  name: string;
  sort_order: number;
  product_count: number;
}

export interface ProductGroupsResponse {
  groups: ProductGroup[];
}

export interface ProductListItem {
  id: number;
  name: string;
  min_price: string;
  offer_count: number;
  photos: string[];
}

export interface ProductListResponse {
  products: ProductListItem[];
  page: number;
  limit: number;
  total: number;
}

export interface SellerOffer {
  seller_product_id: number;
  seller_id: number;
  seller_name: string;
  price: string;
  unit: string;
  stock: string;
  description: string | null;
  photos: string[];
  origin_country: string | null;
  supply_date: string | null; // "ГГГГ-ММ-ДД"
}

export interface ProductDetail {
  id: number;
  name: string;
  description: string | null;
  group_id: number;
  group_name: string;
  offers: SellerOffer[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
}

export type SortOrder = 'name' | 'price';

export interface CatalogQuery {
  groupId?: number;
  search?: string;
  sort?: SortOrder;
  page?: number;
  limit?: number;
}
