import { asCategoryId, PRODUCT_AVAILABILITY_ORDER } from '@/platform-core/contracts/DomainTypes';
import { asMarketId, asProductId, asSellerId, type MarketId, type SellerId } from '@/platform-core/contracts/Action';
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

/** Строка каталога продавца (GET /sellers/{id}/products, контракт 12.08.2026).
 *  name — собственное наименование продавца, catalog_name — эталонное из
 *  справочника; API отдаёт оба намеренно (каталог продавца показывает его
 *  товар его словами, по эталонному идёт переход на общую карточку товара). */
interface BackendSellerProduct {
  seller_product_id: number;
  product_id: number;
  name: string;
  catalog_name: string;
  group_id: number;
  group_name: string;
  price: string;
  unit: string;
  stock: string;
  description: string | null;
  origin_country: string | null;
  supply_date: string | null;
  photos: string[];
}

interface BackendSellerProductsResponse {
  products: BackendSellerProduct[];
  page: number;
  limit: number;
  total: number;
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

/* ====== Каталог товаров продавца (GET /sellers/{id}/products) ======
 * Бэкенд отдаёт только промодерированные и опубликованные предложения —
 * total может быть меньше числа строк в книге продавца (штатно). Строка
 * каталога не содержит доменных полей страницы продавца (availability,
 * emoji, categoryId, tags) — они выводятся здесь из того, что API даёт:
 * доступность из остатка, категория из group_id, эмодзи из названия группы,
 * теги из обоих имён товара. */

const SELLER_PRODUCTS_PAGE_LIMIT = 100;
const SELLER_PRODUCTS_MAX_TOTAL = 500;

/** Эмодзи товара по названию группы (справочник бэкенда): группе с реальным
 *  именем («Фрукты», «Мясо»…) соответствует пиктограмма, как у категорий
 *  мока (см. SellerCardScreenView#CATEGORY_EMOJI). Неизвестная группа — 🛒. */
const GROUP_EMOJI_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/фрукт|ягод|абрикос|виноград|гранат|банан|яблок|груш|слив|персик|хурм|цитрус|арбуз|дын/, '🍎'],
  [/овощ|помидор|огур|морков|капуст|свекл|картоф|лук|перец|баклажан|кабачк|тыкв|чеснок|редис|зеленый горошек/, '🥕'],
  [/мяс|говяд|свинин|баранин|куриц|птиц|фарш|колбас|копчен|шашлык|пельмен|субпродукт/, '🥩'],
  [/молочн|молок|творог|сыр|сметан|кефир|йогурт|сливк|масло слив/, '🥛'],
  [/хлеб|выпечк|булоч|пекар|багет|пирог|батон|мука|лепешк|лаваш/, '🍞'],
  [/мёд|мед|сладост|варенье|джем|конфет|шоколад|халв|чак-чак/, '🍯'],
  [/рыб|морепродукт|креветк|кальмар|миди|икра|сельд|скумбр/, '🐟'],
  [/зелен|трав|укроп|петрушк|базилик|мята|салат|шпинат/, '🌿'],
  [/орех|сухофрукт|изюм|кураг|миндал|финик|кунжут/, '🥜'],
];

function emojiForGroup(groupName: string | null | undefined): string {
  const name = (groupName ?? '').toLowerCase();
  for (const [rule, emoji] of GROUP_EMOJI_RULES) {
    if (rule.test(name)) return emoji;
  }
  return '🛒';
}

/** Маппинг строки каталога продавца в доменную SellerProductRecord: цену и
 *  остаток парсим из строк (Decimal сериализуется как JSON string), id — из
 *  seller_product_id (строка каталога — сущность продавца, не справочника). */
function mapSellerProduct(product: BackendSellerProduct, numericSellerId: number): SellerProductRecord {
  const stock = Number(product.stock);
  const tags = Array.from(
    new Set(
      [product.catalog_name, product.name].filter((tag): tag is string => typeof tag === 'string' && tag.length > 0),
    ),
  );
  return {
    id: asProductId(`seller-${numericSellerId}-product-${product.seller_product_id}`),
    name: product.name,
    price: Number(product.price),
    unit: product.unit,
    categoryId: asCategoryId(`group-${product.group_id}`),
    emoji: emojiForGroup(product.group_name),
    description: product.description ?? '',
    availability: Number.isFinite(stock) && stock > 0 ? 'available' : 'missing',
    tags,
  };
}

/** Полная выгрузка каталога продавца постранично (page/limit — те же параметры,
 *  что у общего списка товаров). Страницы считываются, пока не собран total или
 *  не достигнут предохранительный лимит SELLER_PRODUCTS_MAX_TOTAL (каталог
 *  продавца на странице — выгрузка целиком, без пагинации в UI). */
async function fetchSellerProducts(numericSellerId: number): Promise<BackendSellerProduct[]> {
  const all: BackendSellerProduct[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (all.length < total && all.length < SELLER_PRODUCTS_MAX_TOTAL) {
    const res = await fetch(
      `${API_BASE}/sellers/${numericSellerId}/products?page=${page}&limit=${SELLER_PRODUCTS_PAGE_LIMIT}`,
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = (await res.json()) as BackendSellerProductsResponse;
    all.push(...(data.products ?? []));
    if (data.products?.length === 0) break;
    total = data.total ?? all.length;
    page += 1;
  }
  return all;
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

    // Скелет карточки: профиль из API, товары инжектирует точка композиции
    // (repository.ts) — оттуда же, из реального каталога продавца, а не из мока.
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

  /** Каталог товаров продавца (GET /sellers/{id}/products, контракт 12.08.2026):
   *  полная выгрузка, отсортированная как требует страница продавца —
   *  доступные → замены → отсутствующие (замен у API нет, порядок доступные →
   *  отсутствующие по остатку). Несуществующий/деактивированный продавец — 404
   *  (HTTP Error), покупателю он просто не существует. */
  async getSellerProducts(id: SellerId): Promise<SellerProductRecord[]> {
    const numericId = parseSellerNumericId(id);
    const products = (await fetchSellerProducts(numericId)).map((product) => mapSellerProduct(product, numericId));
    return products.sort(
      (a, b) =>
        PRODUCT_AVAILABILITY_ORDER[a.availability ?? 'available'] -
        PRODUCT_AVAILABILITY_ORDER[b.availability ?? 'available'],
    );
  },

  async getRecommendedSellers(): Promise<RecommendedSeller[]> { throw new Error('Not implemented in API'); },
  async searchProductNames(): Promise<ProductNameSuggestion[]> { throw new Error('Not implemented in API'); },
  async searchSellersByProduct(): Promise<ProductSearchResult> { throw new Error('Not implemented in API'); },
};
