import { asMarketId, asSellerId, type MarketId, type SellerId } from "@/platform-core/contracts/Action";
import { asCategoryId, PRODUCT_AVAILABILITY_ORDER } from "@/platform-core/contracts/DomainTypes";
import type {
  GeoPoint,
  MapBounds,
  MarketMapRecord,
  MarketSellerRecord,
  SellerMapRecord,
} from "@/platform-core/map/viewmodels/MapViewModel";
import type {
  CategoryOption,
  SellerRepository,
  SellerSearchRequest,
  SellerSortKey,
} from "@/platform-core/map/repository/SellerRepository";
import { GeoService } from "@/platform-core/map/gis/GeoService";
import { defaultMapConfig } from "@/platform-core/map/gis/MapConfig";
import { compareDistanceMeters } from "@/platform-core/map/compare";
import { DistanceFormatter } from "@/platform-core/formatting/DistanceFormatter";
import type { SellerCardViewModel } from "@/platform-core/viewmodels/SellerCardViewModel";
import type { AvailableAction, PhotoItem } from "@/platform-core/contracts/ContentBlock";
import { buildSellerProducts } from "@/platform-core/map/repository/mockSellerCatalog";
import type { SellerProductRecord } from "@/platform-core/map/repository/SellerRepository";
import {
  findDirectProductMatches,
  findMostSimilarProduct,
  normalizeProductSearch,
  type ProductNameSuggestion,
  type ProductSearchCandidate,
  type ProductSellerMatch,
} from "@/platform-core/map/product-search/ProductSearch";
import {
  rankRecommendedSellers,
  type RecommendedSeller,
} from "@/platform-core/map/recommendations/SellerRecommendations";

/** IMP-003.1 §14: 20-50 продавцов, разные категории, координаты в пределах
 *  тестовой территории, рейтинги, фото (плейсхолдеры — как и в остальном
 *  репозитории, см. PhotoItem#placeholderColor), часы работы. Тестовая
 *  территория — центр Франкфурта-на-Майне (WGS84). Данные детерминированы
 *  (не Math.random()), чтобы dev/тесты были воспроизводимы. */

const CATEGORIES: CategoryOption[] = [
  { categoryId: asCategoryId("vegetables"), name: "Овощи и фрукты" },
  { categoryId: asCategoryId("dairy"), name: "Молочные продукты" },
  { categoryId: asCategoryId("meat"), name: "Мясо и птица" },
  { categoryId: asCategoryId("bakery"), name: "Хлеб и выпечка" },
  { categoryId: asCategoryId("honey"), name: "Мёд и сладости" },
  { categoryId: asCategoryId("fish"), name: "Рыба и морепродукты" },
  { categoryId: asCategoryId("herbs"), name: "Зелень и травы" },
  { categoryId: asCategoryId("nuts"), name: "Орехи и сухофрукты" },
];

const NAMES = [
  "Фермерский дворик", "Зелёная лавка", "Урожай", "Молочный ручей", "Хлебный дом",
  "Медовый край", "Морской улов", "Сад и грядка", "Бабушкин погреб", "Ферма Ивановых",
  "Тёплая грядка", "Пекарня №1", "Сырная лавка", "Дары леса", "Фрукты с юга",
  "Мясной ряд", "Овощная база", "Пряные травы", "Ягодный рай", "Молокозавод",
  "Копчёности", "Ореховый мешок", "Цветочный мёд", "Рыбный двор",
];

const CENTER: GeoPoint = defaultMapConfig.defaultCenter;

function offset(index: number): GeoPoint {
  // Детерминированное псевдослучайное распределение по спирали вокруг центра.
  const angle = index * 2.399963; // золотой угол, даёт равномерный разброс
  const radius = 0.004 + index * 0.0009;
  return {
    lat: CENTER.lat + radius * Math.cos(angle),
    lng: CENTER.lng + radius * Math.sin(angle) * 1.4,
  };
}

function buildSellers(): SellerMapRecord[] {
  return NAMES.map((name, i) => {
    const location = offset(i);
    const categoryIndices = [i % CATEGORIES.length, (i + 3) % CATEGORIES.length];
    const categories = Array.from(new Set(categoryIndices)).map((ci) => CATEGORIES[ci]);
    const isOpenNow = i % 5 !== 0;
    return {
      sellerId: asSellerId(`seller-${i + 1}`),
      name,
      location,
      rating: 3.5 + ((i * 37) % 15) / 10, // 3.5..4.9 детерминированно
      distanceMeters: Math.round(GeoService.distanceMeters(CENTER, location)),
      categories: categories.map((c) => c.categoryId),
      categoryNames: categories.map((c) => c.name),
      photoUrl: null,
      isOpenNow,
      workingHoursLabel: isOpenNow ? "Открыто до 20:00" : "Открывается в 09:00",
      isAvailable: i % 11 !== 0,
    };
  });
}

const ALL_SELLERS = buildSellers();

/** Есть ли продавец в демо-каталоге. Единственный источник правды для
 *  маршрутизации (см. repository.ts): принадлежность к Mock-каталогу
 *  определяется НАЛИЧИЕМ в нём продавца, а не формой ID — суффикс ID у
 *  продавцов каталога числовой (seller-1..seller-24), как и у продавцов
 *  рынка (seller-101..seller-145) и реальных продавцов бэкенда. */
export function isMockSeller(id: SellerId | string): boolean {
  return ALL_SELLERS.some((s) => s.sellerId === id);
}

/* ====== Точки торговли (задача «Маркеты») ======
 * Один рынок в Казани (как в БД бэкенда — GET /markets возвращает ту же
 * точку) с большим числом продавцов: каждый со своим рядом/местом, часами и
 * числом товаров. Данные детерминированы, как и остальной мок. Продавцы
 * рынка НЕ входят в ALL_SELLERS (пин рынка — одно место, список продавцов
 * открывается попапом); их sellerId начинаются со 101, чтобы не
 * конфликтовать с продавцами каталога (seller-1..seller-24).
 *
 * 45 продавцов — «большое количество, закреплённое за маркетом»: список
 *  скроллится в попапе и не выталкивает кнопку маршрута за экран. */

const KAZAN_MARKET_LOCATION: GeoPoint = { lat: 55.796, lng: 49.1064 };

const MARKET_KINDS = [
  "Овощи и зелень", "Фрукты и ягоды", "Мясо", "Молочные продукты", "Хлеб и выпечка",
  "Мёд и пасека", "Рыба", "Орехи и сухофрукты", "Сыры", "Колбасы и копчёности",
  "Птица", "Морепродукты", "Крупы и бобовые", "Чай и травы", "Сладости и чак-чак",
  "Варенье и джемы", "Грибы", "Растительное масло", "Пельмени", "Мороженое",
  "Квас и лимонады", "Пироги", "Творог и сметана", "Кумыс", "Беляши и эчпочмак",
  "Приправы и специи", "Квашеная капуста", "Соленья", "Сушёные травы", "Яйца",
  "Татарские сладости", "Мёд с пасеки", "Свежая выпечка", "Рыбные деликатесы",
  "Фермерское молоко", "Домашние сыры", "Копчёная птица", "Гречишный мёд",
  "Сезонные фрукты", "Маринованные огурцы", "Домашний хлеб", "Козий сыр",
  "Мясные полуфабрикаты", "Солёная рыба", "Ягодное варенье",
];

const MARKET_ROWS = ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И", "К", "Л", "М"];

function buildMarketSellers(): MarketSellerRecord[] {
  return MARKET_KINDS.map((kind, i) => ({
    sellerId: asSellerId(`seller-${101 + i}`),
    name: `Лавка «${kind}»`,
    row: `Ряд ${MARKET_ROWS[i % MARKET_ROWS.length]}`,
    place: `Место ${((i * 7) % 30) + 1}`,
    workingHours: i % 4 === 0 ? "08:00–19:00" : "08:00–20:00",
    shortDescription: null,
    productCount: 40 + ((i * 23) % 300),
  }));
}

const MOCK_MARKETS: MarketMapRecord[] = [
  {
    marketId: asMarketId("market-1"),
    name: "Центральный рынок",
    type: "MARKET",
    address: "Казань, ул. Московская, 1",
    location: KAZAN_MARKET_LOCATION,
    sellerCount: MARKET_KINDS.length,
  },
];

/** Продавцы рынка по marketId — единственная точка, поэтому таблица из одной
 *  записи. Возвращает null, если marketId неизвестен (в отличие от пустого
 *  списка: пустой список — «в точке нет продавцов», а не «точки нет»). */
function findMarketSellers(marketId: MarketId): MarketSellerRecord[] | null {
  if (marketId !== MOCK_MARKETS[0].marketId) return null;
  return buildMarketSellers();
}

/* ====== Поиск по товарам ======
 * Индекс товаров: нормализованное название → кандидат поиска (название +
 * теги) + продавцы с ценой на этот товар. Строится один раз из каталога —
 * товары, теги и цены здесь единственный источник (тот же, что у страницы
 * продавца: buildSellerProducts). Поиск по названию/тегам и «Возможно вы
 * имели в виду» — чистые функции ProductSearch; тут только сборка индекса
 * и сортировка продавцов по расстоянию (как в обычном поиске). */

interface ProductIndexEntry extends ProductSearchCandidate {
  emoji: string;
  matches: ProductSellerMatch[];
}

function buildProductIndex(): Map<string, ProductIndexEntry> {
  const index = new Map<string, ProductIndexEntry>();
  ALL_SELLERS.forEach((seller, sellerIndex) => {
    const products = buildSellerProducts(seller.sellerId, seller.categories, sellerIndex);
    products.forEach((product) => {
      const key = normalizeProductSearch(product.name);
      let entry = index.get(key);
      if (!entry) {
        entry = {
          name: product.name,
          normalizedName: key,
          tags: product.tags.map((tag) => normalizeProductSearch(tag)),
          emoji: product.emoji,
          matches: [],
        };
        index.set(key, entry);
      }
      entry.matches.push({
        seller,
        productName: product.name,
        price: product.price,
        unit: product.unit,
        emoji: product.emoji,
      });
    });
  });
  return index;
}

const PRODUCT_INDEX = buildProductIndex();

/** Продавцы, у которых есть товар из записи индекса, по расстоянию (как в
 *  обычном поиске: «Сортировать продавцов в них как обычно»). Упд-8: продавцы
 *  с неизвестным расстоянием (undefined) уходят в конец, а не встают первыми
 *  как «рядом» (бывшее `?? 0`). */
function matchesByDistance(entry: ProductIndexEntry): ProductSellerMatch[] {
  return entry.matches.slice().sort(
    (a, b) => compareDistanceMeters(a.seller.distanceMeters, b.seller.distanceMeters),
  );
}

/** Реестр компараторов сортировки результатов поиска: ключ → компаратор по
 *  полям записи. Новый способ сортировки = новая запись здесь + член в
 *  SellerSortKey (см. SellerRepository.ts) — searchSellersNear и весь мастер
 *  поиска не меняются (MAP-053: «архитектура под будущие сортировки»). */
const SELLER_SORTS: Record<SellerSortKey, (a: SellerMapRecord, b: SellerMapRecord) => number> = {
  // По расстоянию от точки поиска: distanceMeters уже пересчитан от origin.
  // Упд-8: известные расстояния по возрастанию, продавцы с undefined — в конец
  // (не «рядом», как было с `?? 0`).
  distance: (a, b) => compareDistanceMeters(a.distanceMeters, b.distanceMeters),
};

function isWithinBounds(point: GeoPoint, bounds: MapBounds): boolean {
  return (
    point.lat <= bounds.north &&
    point.lat >= bounds.south &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  );
}

const SIMULATED_DELAY_MS = 250;
function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_DELAY_MS));
}

/** Поисковая нормализация: регистр в нижний и «ё» → «е», чтобы запрос «мёд»
 *  находил «Медовый край», а «мед» — «Мёд и сладости» (и наоборот). */
function normalizeForSearch(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

/** Цвета-заглушки превью лавки (реальных фото нет, см. PhotoItem#placeholderColor). */
const PHOTO_PLACEHOLDERS = ["#e4f0e8", "#fbedd9", "#e1eef4"];

/** ТЗ-025 v1.1 §7: детерминированные уровни доверия по индексу продавца. */
const TRUST_LEVELS = ["high", "high", "medium", "low"] as const;

/** Кнопки действий карточки продавца — как в SellerCardScreen.availableActions
 *  (только те, что реально диспатчатся: маршрут, избранное, репорт). */
function sellerCardAvailableActions(sellerId: SellerId): AvailableAction[] {
  return [
    { id: "start-route", action: { type: "START_ROUTE", payload: { sellerId } }, label: "Начать маршрут", icon: "navigation", variant: "primary" },
    {
      id: "favorite",
      action: { type: "TOGGLE_FAVORITE_SELLER", payload: { sellerId } },
      label: "В избранное",
      icon: "heart",
      variant: "secondary",
    },
    {
      id: "report",
      action: { type: "REPORT_MISSING_PRODUCT", payload: { sellerId } },
      label: "Сообщить о товаре",
      icon: "plus",
      variant: "ghost",
    },
  ];
}

export const MockSellerRepository: SellerRepository = {
  getAllSellers() {
    return delay(ALL_SELLERS);
  },

  getVisibleSellers(bounds) {
    // location у продавцов каталога всегда есть; nullable-тип обрабатываем явно.
    return delay(ALL_SELLERS.filter((s) => s.location !== null && isWithinBounds(s.location, bounds)));
  },

  getVisibleMarkets(bounds) {
    return delay(MOCK_MARKETS.filter((m) => isWithinBounds(m.location, bounds)));
  },

  getMarketSellers(marketId) {
    const sellers = findMarketSellers(marketId);
    return delay(sellers ?? []);
  },

  getSeller(id: SellerId) {
    return delay(ALL_SELLERS.find((s) => s.sellerId === id) ?? null);
  },

  searchSellersNear({ origin, radiusMeters, sort }: SellerSearchRequest) {
    return delay(
      ALL_SELLERS.filter(
        (s): s is SellerMapRecord & { location: GeoPoint } =>
          s.location !== null && GeoService.distanceMeters(origin, s.location) <= radiusMeters,
      )
        // Записи хранят distanceMeters от центра тестовой территории — здесь
        // пересчитываем их от реальной точки поиска, чтобы результаты показывали
        // честное расстояние (и компаратор «по расстоянию» работал верно).
        .map((s) => ({ ...s, distanceMeters: Math.round(GeoService.distanceMeters(origin, s.location)) }))
        .sort(SELLER_SORTS[sort.key]),
    );
  },

  searchSellers(query) {
    const q = normalizeForSearch(query);
    if (!q) return delay([]);
    return delay(ALL_SELLERS.filter((s) => normalizeForSearch(s.name).includes(q)));
  },

  findSeller(query) {
    const q = normalizeForSearch(query);
    if (!q) return delay(null);
    return delay(ALL_SELLERS.find((s) => normalizeForSearch(s.name).includes(q)) ?? null);
  },

  /** Карточка продавца (ТЗ-025 §12): доменная SellerCardViewModel, которую
   *  Backend/Platform Core отдаёт экрану. Товары делятся на «из вашей покупки»
   *  (basketProducts — первые 4) и «остальные» (otherProducts); доступность и
   *  сортировка детерминированы. */
  getSellerCard(id: SellerId) {
    const record = ALL_SELLERS.find((s) => s.sellerId === id);
    if (!record) {
      return delay({
        loadState: "error",
        seller: { id, name: "Продавец не найден", rating: 0, distance: "" },
        coverage: { have: 0, total: 0, fullyCovered: false },
        importantAlerts: [],
        basketProducts: [],
        otherProducts: [],
        trustInfo: "",
        trustLevel: "low",
        lastConfirmedAt: "",
        dataMayBeStale: false,
        photos: [],
        availableActions: [],
        reports: [],
        isFavorite: false,
        otherProductsExpanded: false,
      } satisfies SellerCardViewModel);
    }

    const index = ALL_SELLERS.indexOf(record);
    const allProducts = buildSellerProducts(record.sellerId, record.categories, index);
    const basketProducts = allProducts.slice(0, 4);
    const otherProducts = allProducts.slice(4);
    const have = basketProducts.filter((p) => p.availability === "available").length;

    const vm: SellerCardViewModel = {
      loadState: "ready",
      seller: {
        id: record.sellerId,
        name: record.name,
        rating: record.rating,
        // У продавцов каталога distanceMeters всегда есть (buildSellers).
        distance: DistanceFormatter.format({ meters: record.distanceMeters! }),
      },
      coverage: {
        have,
        total: basketProducts.length,
        fullyCovered: have === basketProducts.length,
      },
      importantAlerts:
        index % 5 === 0 ? ["Цены в лавке могут отличаться от указанных в каталоге"] : [],
      basketProducts,
      otherProducts,
      trustInfo: "Продавец проверен площадкой · работает с 2023 года",
      trustLevel: TRUST_LEVELS[index % TRUST_LEVELS.length],
      lastConfirmedAt: "позавчера",
      dataMayBeStale: index % 3 === 0,
      photos: PHOTO_PLACEHOLDERS.map(
        (placeholderColor, photoIndex): PhotoItem => ({
          id: `${record.sellerId}:photo-${photoIndex + 1}`,
          placeholderColor,
        }),
      ),
      availableActions: sellerCardAvailableActions(record.sellerId),
      reports:
        index % 3 === 0
          ? [
              {
                id: `${record.sellerId}:report-1`,
                title: "Покупатели хвалят свежесть продуктов",
                date: "3 дня назад",
                author: "Покупатель",
                trustLevel: "high",
              },
            ]
          : [],
      isFavorite: index % 7 === 0,
      otherProductsExpanded: false,
    };
    return delay(vm);
  },

  /** Полный каталог товаров продавца с данными для страницы (эмодзи, описание,
   *  категория). Сортировка — как везде: доступные → замены → отсутствующие. */
  getSellerProducts(id: SellerId) {
    const record = ALL_SELLERS.find((s) => s.sellerId === id);
    if (!record) return delay([]);
    const index = ALL_SELLERS.indexOf(record);
    const allProducts = buildSellerProducts(record.sellerId, record.categories, index);
    const sorted: SellerProductRecord[] = [...allProducts].sort(
      (a, b) =>
        PRODUCT_AVAILABILITY_ORDER[a.availability ?? "available"] -
        PRODUCT_AVAILABILITY_ORDER[b.availability ?? "available"],
    );
    return delay(sorted);
  },

  /** Похожие продавцы (общие категории): сначала все общие, затем по убыванию
   *  числа общих категорий — см. rankRecommendedSellers. */
  getRecommendedSellers(id: SellerId) {
    const record = ALL_SELLERS.find((s) => s.sellerId === id);
    if (!record) return delay([]);
    const recommendations: RecommendedSeller[] = rankRecommendedSellers(record, ALL_SELLERS);
    return delay(recommendations);
  },

  /** Автодополнение названий товаров (поиск по товару): прямые совпадения по
   *  названию или тегам, отсортированные по релевантности. Подпись строки
   *  (сколько продавцов, от какой цены) собирается здесь же. */
  searchProductNames(query: string) {
    const q = normalizeProductSearch(query);
    if (!q) return delay([]);
    const candidates = Array.from(PRODUCT_INDEX.values());
    const suggestions: ProductNameSuggestion[] = findDirectProductMatches(q, candidates).map((candidate) => {
      const entry = PRODUCT_INDEX.get(candidate.normalizedName);
      const prices = entry ? entry.matches.map((m) => m.price) : [];
      return {
        name: candidate.name,
        emoji: entry?.emoji ?? "🛒",
        sellerCount: entry?.matches.length ?? 0,
        minPrice: prices.length > 0 ? Math.min(...prices) : 0,
      };
    });
    return delay(suggestions);
  },

  /** Поиск продавцов по товару: напрямую (по названию/тегу) — лучший товар и
   *  его продавцы; иначе — «Возможно вы имели в виду» (схожесть >85%, сразу
   *  продавцы); иначе пустой результат. Продавцы — по расстоянию, с ценой. */
  searchSellersByProduct(query: string) {
    const q = normalizeProductSearch(query);
    if (!q) return delay({ matchedProduct: null, suggestedProduct: null, sellers: [] });
    const candidates = Array.from(PRODUCT_INDEX.values());
    const direct = findDirectProductMatches(q, candidates);
    if (direct.length > 0) {
      const entry = PRODUCT_INDEX.get(direct[0].normalizedName);
      return delay({
        matchedProduct: direct[0].name,
        suggestedProduct: null,
        sellers: entry ? matchesByDistance(entry) : [],
      });
    }
    const best = findMostSimilarProduct(q, candidates);
    if (best) {
      const entry = PRODUCT_INDEX.get(best.normalizedName);
      return delay({
        matchedProduct: null,
        suggestedProduct: best.name,
        sellers: entry ? matchesByDistance(entry) : [],
      });
    }
    return delay({ matchedProduct: null, suggestedProduct: null, sellers: [] });
  },

  getCategories() {
    return delay(CATEGORIES);
  },
};
