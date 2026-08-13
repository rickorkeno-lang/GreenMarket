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
  SellerSearchRequest,
} from '@/platform-core/map/repository/SellerRepository';
import type { SellerCardViewModel } from '@/platform-core/viewmodels/SellerCardViewModel';
import type { RecommendedSeller } from '@/platform-core/map/recommendations/SellerRecommendations';
import type { ProductNameSuggestion, ProductSearchResult } from '@/platform-core/map/product-search/ProductSearch';
import { GeoService } from '@/platform-core/map/gis/GeoService';
import { defaultMapConfig } from '@/platform-core/map/gis/MapConfig';
import { DistanceFormatter } from '@/platform-core/formatting/DistanceFormatter';
import { MockSellerRepository } from '@/platform-core/map/repository/MockSellerRepository';

// import.meta.env — Vite-специфика. Под tsx (юнит-тесты MapRuntime, где
// модуль загружается вне Vite) env отсутствует — тогда фолбэк на дефолтный
// путь, как если бы VITE_API_BASE не задан вовсе. В приложении путь
// конфигурируется через .env (см. README).
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

function parseSellerNumericId(id: SellerId | string): number | null {
  const str = String(id).replace(/^(seller-)+/, '');
  const num = Number(str);
  return Number.isNaN(num) ? null : num;
}

/** Поисковая нормализация — как в MockSellerRepository: регистр в нижний и
 *  «ё» → «е», чтобы запрос «мёд» находил «Медовый край», а «мед» — «Мёд и
 *  сладости» (и наоборот). Единое поведение поиска у обеих реализаций. */
function normalizeForSearch(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

function isWithinBounds(point: GeoPoint, bounds: MapBounds): boolean {
  return (
    point.lat <= bounds.north &&
    point.lat >= bounds.south &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  );
}

/** Точки торговли в границах карты (API `/markets`). Доменные записи
 *  MapViewModel (marketId — brand «market-N»): источник пинов карты
 *  (MapRuntime.requestVisibleMarkets). При сбое/пустом ответе — пустой
 *  список (карта просто не рисует пины). */
async function fetchVisibleMarkets(bounds: MapBounds): Promise<MarketMapRecord[]> {
  try {
    const res = await fetch(`${API_BASE}/markets`);
    if (!res.ok) return [];
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
  } catch {
    return [];
  }
}

/** Продавцы конкретной точки (API `/markets/{id}/sellers`): краткие записи
 *  списка точки. При сбое — пустой список. */
async function fetchMarketSellers(marketId: MarketId): Promise<MarketSellerRecord[]> {
  try {
    const cleanId = marketId.replace(/^market-/, '');
    const res = await fetch(`${API_BASE}/markets/${cleanId}/sellers`);
    if (!res.ok) return [];
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
  } catch {
    return [];
  }
}

export const ApiSellerRepository: SellerRepository = {
  async getSeller(id: SellerId): Promise<SellerMapRecord | null> {
    const numericId = parseSellerNumericId(id);
    if (!numericId) return MockSellerRepository.getSeller(id);

    try {
      const res = await fetch(`${API_BASE}/sellers/${numericId}`);
      if (!res.ok) return MockSellerRepository.getSeller(id);
      const seller = (await res.json()) as BackendSellerDetail;

      const lat = seller.market?.latitude ? Number(seller.market.latitude) : defaultMapConfig.defaultCenter.lat;
      const lng = seller.market?.longitude ? Number(seller.market.longitude) : defaultMapConfig.defaultCenter.lng;
      const location = { lat, lng };

      return {
        sellerId: asSellerId(`seller-${seller.seller_id}`),
        name: seller.name,
        location,
        rating: 4.8,
        distanceMeters: Math.round(GeoService.distanceMeters(defaultMapConfig.defaultCenter, location)),
        categories: [],
        categoryNames: [],
        photoUrl: null,
        isOpenNow: true,
        workingHoursLabel: seller.working_hours ?? 'Открыто',
        isAvailable: true,
      };
    } catch {
      return MockSellerRepository.getSeller(id);
    }
  },

  /** Каталог продавцов — тестовые «шопы» из мока (немецкая территория).
   *  Точки торговли-маркеты приходят с бэкенда (getVisibleMarkets), а лавки
   *  каталога остаются в моке: иначе демо теряет обычные шопы, и пин маркета
   *  в Казани накрывается точкой его продавца (см. задачу «Маркеты»: пин —
   *  одно место, продавцы — в попапе). */
  getAllSellers(): Promise<SellerMapRecord[]> {
    return MockSellerRepository.getAllSellers();
  },

  async getVisibleSellers(bounds: MapBounds): Promise<SellerMapRecord[]> {
    const all = await this.getAllSellers();
    return all.filter((s) => isWithinBounds(s.location, bounds));
  },

  getVisibleMarkets(bounds: MapBounds): Promise<MarketMapRecord[]> {
    return fetchVisibleMarkets(bounds);
  },

  getMarketSellers(marketId: MarketId): Promise<MarketSellerRecord[]> {
    return fetchMarketSellers(marketId);
  },

  async searchSellersNear(request: SellerSearchRequest): Promise<SellerMapRecord[]> {
    const all = await this.getAllSellers();
    return all
      .filter((s) => GeoService.distanceMeters(request.origin, s.location) <= request.radiusMeters)
      .map((s) => ({ ...s, distanceMeters: Math.round(GeoService.distanceMeters(request.origin, s.location)) }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  },

  async searchSellers(query: string): Promise<SellerMapRecord[]> {
    const q = normalizeForSearch(query);
    if (!q) return [];
    const all = await this.getAllSellers();
    return all.filter((s) => normalizeForSearch(s.name).includes(q));
  },

  async findSeller(query: string): Promise<SellerMapRecord | null> {
    const matches = await this.searchSellers(query);
    return matches[0] ?? null;
  },

  getCategories(): Promise<CategoryOption[]> {
    return MockSellerRepository.getCategories();
  },

  async getSellerCard(id: SellerId): Promise<SellerCardViewModel> {
    const numericId = parseSellerNumericId(id);
    if (!numericId) return MockSellerRepository.getSellerCard(id);

    try {
      const res = await fetch(`${API_BASE}/sellers/${numericId}`);
      if (!res.ok) return MockSellerRepository.getSellerCard(id);
      const seller = (await res.json()) as BackendSellerDetail;

      const products = await this.getSellerProducts(id);

      return {
        loadState: 'ready',
        seller: {
          id: asSellerId(`seller-${seller.seller_id}`),
          name: seller.name,
          rating: 4.8,
          distance: seller.market ? DistanceFormatter.format({ meters: 1500 }) : '—',
        },
        coverage: {
          have: products.length,
          total: products.length,
          fullyCovered: true,
        },
        importantAlerts: [],
        basketProducts: products.slice(0, 4),
        otherProducts: products.slice(4),
        trustInfo: 'Продавец проверен площадкой',
        trustLevel: 'high',
        lastConfirmedAt: 'сегодня',
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
    } catch {
      return MockSellerRepository.getSellerCard(id);
    }
  },

  async getSellerProducts(id: SellerId): Promise<SellerProductRecord[]> {
    return MockSellerRepository.getSellerProducts(id);
  },

  async getRecommendedSellers(id: SellerId): Promise<RecommendedSeller[]> {
    return MockSellerRepository.getRecommendedSellers(id);
  },

  async searchProductNames(query: string): Promise<ProductNameSuggestion[]> {
    return MockSellerRepository.searchProductNames(query);
  },

  async searchSellersByProduct(query: string): Promise<ProductSearchResult> {
    return MockSellerRepository.searchSellersByProduct(query);
  },
};
