import { asMarketId, asSellerId, type MarketId, type SellerId } from '@/platform-core/contracts/Action';
import type {
  GeoPoint,
  MapBounds,
  MarketMapRecord,
  MarketSellerRecord,
  SellerMapRecord,
} from '@/platform-core/map/viewmodels/MapViewModel';
import type {
  CategoryOption,
  SellerProductRecord,
  SellerRepository,
} from '@/platform-core/map/repository/SellerRepository';
import type { SellerCardViewModel } from '@/platform-core/viewmodels/SellerCardViewModel';
import type { RecommendedSeller } from '@/platform-core/map/recommendations/SellerRecommendations';
import type { ProductNameSuggestion, ProductSearchResult } from '@/platform-core/map/product-search/ProductSearch';

const API_BASE = (import.meta.env?.VITE_API_BASE as string | undefined) ?? '/api/v1/catalog';

interface BackendMarket {
  id: number;
  name: string;
  type: 'SHOP' | 'MARKET';
  address: string;
  latitude: string | null;
  longitude: string | null;
  seller_count: number;
}

interface BackendMarketsResponse {
  markets: BackendMarket[];
}

interface BackendMarketSeller {
  seller_id: number;
  name: string;
  row: string | null;
  place: string | null;
  working_hours: string | null;
  short_description: string | null;
  product_count: number;
}

interface BackendMarketSellersResponse {
  sellers: BackendMarketSeller[];
}

interface BackendSellerDetail {
  seller_id: number;
  name: string;
  market: {
    id: number;
    name: string;
    type: 'SHOP' | 'MARKET';
    address: string;
    latitude: string | null;
    longitude: string | null;
  } | null;
  row: string | null;
  place: string | null;
  working_hours: string | null;
  short_description: string | null;
  phone: string | null;
  whatsapp: string | null;
}

function parseSellerNumericId(id: SellerId | string): number {
  const str = String(id).replace(/^(seller-)+/, '');
  const num = Number(str);
  if (Number.isNaN(num) || num < 0) throw new Error(`Invalid API numeric SellerId: ${id}`);
  return num;
}

function isWithinBounds(point: GeoPoint, bounds: MapBounds): boolean {
  return (
    point.lat <= bounds.north &&
    point.lat >= bounds.south &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  );
}

/**
 * ЧИСТЫЙ API-РЕПОЗИТОРИЙ.
 * Отвечает ТОЛЬКО за сетевые вызовы. Никаких скрытых fallback-моков внутри.
 * Ошибка сети = выброшенное исключение (которое честно долетит до UI как failed state).
 * Отсутствие данных = честный [].
 */
export const ApiSellerRepository: SellerRepository = {
  async getVisibleMarkets(bounds: MapBounds): Promise<MarketMapRecord[]> {
    const res = await fetch(`${API_BASE}/markets`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = (await res.json()) as BackendMarketsResponse;

    return (data.markets || [])
      .filter((m) => m.latitude != null && m.longitude != null && m.seller_count > 0)
      .map((m): MarketMapRecord => {
        const lat = Number(m.latitude);
        const lng = Number(m.longitude);
        return {
          marketId: asMarketId(`market-${m.id}`),
          name: m.name,
          type: m.type,
          address: m.address,
          location: { lat, lng },
          sellerCount: m.seller_count,
        };
      })
      .filter((m) => isWithinBounds(m.location, bounds));
  },

  async getMarketSellers(marketId: MarketId): Promise<MarketSellerRecord[]> {
    const cleanId = marketId.replace(/^market-/, '');
    const res = await fetch(`${API_BASE}/markets/${cleanId}/sellers`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = (await res.json()) as BackendMarketSellersResponse;

    return (data.sellers || []).map((s): MarketSellerRecord => ({
      sellerId: asSellerId(`seller-${s.seller_id}`),
      name: s.name,
      row: s.row,
      place: s.place,
      workingHours: s.working_hours,
      shortDescription: s.short_description,
      productCount: s.product_count,
    }));
  },

  async getSeller(id: SellerId): Promise<SellerMapRecord | null> {
    const numericId = parseSellerNumericId(id);
    const res = await fetch(`${API_BASE}/sellers/${numericId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const seller = (await res.json()) as BackendSellerDetail;

    const location = seller.market?.latitude != null && seller.market?.longitude != null
      ? { lat: Number(seller.market.latitude), lng: Number(seller.market.longitude) }
      : null;

    // Замечание №2: запись честно отражает профиль бэкенда — поля, которых там
    // нет (рейтинг, часы открытия, доступность, координаты), отсутствуют и в
    // записи: location = null, остальное — undefined (без выдуманных значений).
    return {
      sellerId: asSellerId(`seller-${seller.seller_id}`),
      name: seller.name,
      location,
      categories: [],
      categoryNames: [],
      photoUrl: null,
      workingHoursLabel: seller.working_hours ?? undefined,
    };
  },

  async getSellerCard(id: SellerId): Promise<SellerCardViewModel> {
    const numericId = parseSellerNumericId(id);
    const res = await fetch(`${API_BASE}/sellers/${numericId}`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const seller = (await res.json()) as BackendSellerDetail;

    // Скелет карточки. Так как API товаров ещё не реализовано,
    // товары сюда инжектирует точка композиции (repository.ts).
    // Рейтинг/расстояние/доверие бэкенд не отдаёт — поля честно отсутствуют
    // (замечание №2), а не заполняются вымышленными значениями.
    return {
      loadState: 'ready',
      seller: {
        id: asSellerId(`seller-${seller.seller_id}`),
        name: seller.name,
      },
      coverage: { have: 0, total: 0, fullyCovered: true },
      importantAlerts: [],
      basketProducts: [],
      otherProducts: [],
      dataMayBeStale: false,
      photos: [],
      availableActions: [
        {
          id: 'start-route',
          action: { type: 'START_ROUTE', payload: { sellerId: id } },
          label: 'Начать маршрут',
          icon: 'navigation',
          variant: 'primary',
        },
        {
          id: 'favorite',
          action: { type: 'TOGGLE_FAVORITE_SELLER', payload: { sellerId: id } },
          label: 'В избранное',
          icon: 'heart',
          variant: 'secondary',
        },
      ],
      reports: [],
      isFavorite: false,
      otherProductsExpanded: false,
    };
  },

  // Нижележащие методы НЕ поддерживаются бэкендом на текущем этапе. 
  // ApiSellerRepository больше не подсовывает моки втихаря, а честно кидает ошибку.
  async getAllSellers(): Promise<SellerMapRecord[]> { throw new Error('Not implemented in API'); },
  async getVisibleSellers(): Promise<SellerMapRecord[]> { throw new Error('Not implemented in API'); },
  async searchSellersNear(): Promise<SellerMapRecord[]> { throw new Error('Not implemented in API'); },
  async searchSellers(): Promise<SellerMapRecord[]> { throw new Error('Not implemented in API'); },
  async findSeller(): Promise<SellerMapRecord | null> { throw new Error('Not implemented in API'); },
  async getCategories(): Promise<CategoryOption[]> { throw new Error('Not implemented in API'); },
  async getSellerProducts(): Promise<SellerProductRecord[]> { throw new Error('Not implemented in API'); },
  async getRecommendedSellers(): Promise<RecommendedSeller[]> { throw new Error('Not implemented in API'); },
  async searchProductNames(): Promise<ProductNameSuggestion[]> { throw new Error('Not implemented in API'); },
  async searchSellersByProduct(): Promise<ProductSearchResult> { throw new Error('Not implemented in API'); },
};
