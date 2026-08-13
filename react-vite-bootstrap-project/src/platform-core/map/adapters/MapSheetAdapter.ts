import type { ContentBlock, RowItem } from "@/platform-core/contracts/ContentBlock";
import type {
  MapViewModel,
  MarketSellerRecord,
  SellerMapRecord,
  SellerSearchState,
} from "@/platform-core/map/viewmodels/MapViewModel";
import type { SellerHistoryEntry } from "@/platform-core/map/history/SellerHistory";
import { RatingFormatter } from "@/platform-core/formatting/RatingFormatter";
import { DistanceFormatter } from "@/platform-core/formatting/DistanceFormatter";
import { sellerStatus } from "@/platform-core/formatting/SellerStatus";

/** MapViewModel → MapSheetAdapter → ContentBlock[]. По образцу CatalogAdapter/
 *  SellerCardAdapter: только преобразование модели + форматирование через
 *  общие Formatter'ы, никакой логики.
 *
 *  Важно: этот Adapter отвечает только за содержимое Bottom Sheet (краткая
 *  карточка выбранного продавца и окна мастера «Поиск продавцов»,
 *  IMP-003.1 §8). Сама область карты — не ContentBlock, а отдельный канвас,
 *  который рендерит map/gis/MapAdapter — ни один другой экран в этом
 *  репозитории не имел карты как часть контента Bottom Sheet, поэтому
 *  распространять ContentBlock на неё было бы искусственным усложнением
 *  существующего контракта.
 *
 *  Маршрут (MAP-020) здесь НЕ строится и не убирается: карточка продавца в
 *  Bottom Sheet не имеет кнопок маршрута — маршрут строится на странице
 *  продавца («Маршрут») и убирается кнопкой в левом нижнем углу карты. */

/** Иконка продавца в списках — как в ProductCardAdapter/PurchaseOptionsAdapter. */
const SELLER_ICON = "🏪";

/** Строка списка: иконка + название + расстояние и статус. Действие —
 *  открыть карточку продавца (SELECT_SELLER), как при выборе маркера. */
function sellerRow(seller: SellerMapRecord): RowItem {
  return {
    id: `seller-${seller.sellerId}`,
    avatar: SELLER_ICON,
    title: seller.name,
    subtitle: `${DistanceFormatter.format({ meters: seller.distanceMeters })} · ${sellerStatus(seller).text}`,
    action: { type: "SELECT_SELLER", payload: { sellerId: seller.sellerId } },
  };
}

/** Радиус в км без лишних нулей: 5000 → «5», 2500 → «2.5». */
function formatRadiusKm(radiusMeters: number): string {
  const km = radiusMeters / 1000;
  return km % 1 === 0 ? String(km) : km.toFixed(1);
}

/** Шаг 1 мастера «Поиск продавцов» (MAP-053/MAP-018): выбор точки поиска.
 *  Действия строк обрабатывает MapScreenView.handleBlockAction. */
function searchOriginBlocks(): ContentBlock[] {
  return [
    { type: "sectionLabel", text: "Поиск продавцов" },
    {
      type: "list",
      items: [
        {
          id: "search-origin-my-location",
          avatar: "📍",
          title: "Моё местоположение",
          subtitle: "Поиск вокруг вас",
          action: { type: "SEARCH_ORIGIN_MY_LOCATION" },
        },
        {
          id: "search-origin-map-center",
          avatar: "🧭",
          title: "Положение на карте",
          subtitle: "Поиск вокруг центра экрана",
          action: { type: "SEARCH_ORIGIN_MAP_CENTER" },
        },
      ],
    },
  ];
}

/** Шаг 2 мастера «Поиск продавцов»: результаты вокруг точки. rawResults ===
 *  null — поиск ещё выполняется (скелетон). Пустые состояния различаются:
 *  в радиусе продавцов нет совсем (rawResults пуст) либо есть, но все
 *  отсечены глобальным фильтром (results пуст) — это подсказывает, что
 *  делать дальше (сменить фильтр). */
function searchResultsBlocks(search: SellerSearchState): ContentBlock[] {
  if (search.failed) {
    return [
      {
        type: "errorRetry",
        text: "Не удалось загрузить результаты поиска.",
        retryAction: { type: "RETRY_SEARCH" },
      },
    ];
  }
  if (search.rawResults === null) {
    return [{ type: "skeleton" }];
  }
  const radiusLabel = formatRadiusKm(search.radiusMeters);
  const originLabel = search.originLabel ?? "точки поиска";
  const blocks: ContentBlock[] = [
    { type: "sectionLabel", text: "Результаты поиска" },
    { type: "text", text: `В радиусе ${radiusLabel} км от ${originLabel} · по расстоянию` },
  ];
  if (search.rawResults.length === 0) {
    blocks.push({ type: "empty", text: `Продавцы в радиусе ${radiusLabel} км не найдены` });
    return blocks;
  }
  if (search.results.length === 0) {
    blocks.push({ type: "empty", text: "Нет продавцов, подходящих под фильтр" });
    return blocks;
  }
  blocks.push({ type: "list", items: search.results.map(sellerRow) });
  return blocks;
}

function sellerSummaryBlocks(seller: SellerMapRecord): ContentBlock[] {
  return [
    { type: "hero" },
    { type: "sectionLabel", text: seller.name },
    {
      type: "metaLine",
      text: `${RatingFormatter.format({ value: seller.rating })} · ${DistanceFormatter.format({ meters: seller.distanceMeters })}`,
    },
    { type: "text", text: seller.categoryNames.join(" · ") },
    // Недоступный продавец: вместо графика работы — «Недоступен» с красным
    // кружком (как в списке продавцов); расписание не показываем вовсе.
    ...(seller.isAvailable
      ? ([
          { type: "text", text: seller.isOpenNow ? "🟢 Открыт" : "🔴 Закрыт" },
          { type: "text", text: seller.workingHoursLabel },
        ] as const)
      : ([{ type: "text", text: "🔴 Недоступен" }] as const)),
    {
      type: "cardList",
      items: [
        {
          id: `open-${seller.sellerId}`,
          emoji: "🏪",
          title: "Открыть продавца",
          subtitle: sellerStatus(seller).text,
          trailing: "",
          highlighted: true,
          action: { type: "OPEN_SELLER", payload: { sellerId: seller.sellerId } },
        },
      ],
    },
  ];
}

/** Строка истории просмотра: название + статус и категории из снапшота.
 *  Действие — открыть страницу продавца (OPEN_SELLER): расстояние из снапшота
 *  для истории нерелевантно (оно было на момент просмотра), а страница
 *  показывает актуальные данные. */
function historyRow(entry: SellerHistoryEntry): RowItem {
  const seller = entry.seller;
  const categories = seller.categoryNames.length > 0 ? ` · ${seller.categoryNames.join(", ")}` : "";
  return {
    id: `history-${seller.sellerId}`,
    avatar: SELLER_ICON,
    title: seller.name,
    subtitle: `${sellerStatus(seller).text}${categories}`,
    action: { type: "OPEN_SELLER", payload: { sellerId: seller.sellerId } },
  };
}

/** Панель истории просмотра (bottomSheet = "sellerHistory"): список последних
 *  просмотренных продавцов, свежие сверху (порядок задаёт SellerHistoryStore). */
function sellerHistoryBlocks(history: SellerHistoryEntry[]): ContentBlock[] {
  if (history.length === 0) {
    return [
      { type: "sectionLabel", text: "История просмотра" },
      { type: "empty", text: "Вы ещё не просматривали продавцов" },
    ];
  }
  return [
    { type: "sectionLabel", text: "История просмотра" },
    { type: "list", items: history.map(historyRow) },
  ];
}

/** Строка списка продавцов точки (задача «Маркеты»): иконка + название,
 *  подзаголовок — «ряд · место · часы работы» (для лавки SHOP, где ряда/места
 *  нет, остаются только часы). Действие — открыть страницу продавца
 *  (OPEN_SELLER): список точки — это краткие записи, полный профиль догружает
 *  страница продавца. */
function marketSellerRow(seller: MarketSellerRecord): RowItem {
  const where = seller.row || seller.place ? [seller.row, seller.place].filter(Boolean).join(" · ") : null;
  const subtitle = [where, seller.workingHours].filter(Boolean).join(" · ");
  return {
    id: `market-seller-${seller.sellerId}`,
    avatar: SELLER_ICON,
    title: seller.name,
    subtitle: subtitle || undefined,
    action: { type: "OPEN_SELLER", payload: { sellerId: seller.sellerId } },
  };
}

/** Попап точки торговли (bottomSheet = "marketSellers", задача «Маркеты»):
 *  список продавцов точки. Только список/скелетон/ошибка/пусто — шапка попапа
 *  (название, адрес, кнопка «Построить маршрут») рендерится экраном Map и не
 *  скроллится (тот же паттерн, что у результатов поиска). Пустые состояния
 *  различаются: загрузка ещё идёт (скелетон), список упал («Повторить»),
 *  в точке продавцов нет совсем. */
function marketSellersBlocks(vm: MapViewModel): ContentBlock[] {
  // В состоянии bottomSheet = "marketSellers" точка гарантированно выбрана
  // (SELECT_MARKET и UNSELECT_MARKET — единственные, кто управляют шитом).
  const marketId = vm.selectedMarketId as NonNullable<MapViewModel["selectedMarketId"]>;
  if (vm.marketSellersFailed) {
    return [
      {
        type: "errorRetry",
        text: "Не удалось загрузить продавцов точки.",
        retryAction: { type: "RETRY_MARKET_SELLERS", payload: { marketId } },
      },
    ];
  }
  if (vm.marketSellers === null || vm.marketSellersLoading) {
    return [{ type: "skeleton" }];
  }
  if (vm.marketSellers.length === 0) {
    return [
      { type: "sectionLabel", text: "Продавцы точки" },
      { type: "empty", text: "Здесь пока нет продавцов" },
    ];
  }
  return [
    { type: "sectionLabel", text: "Продавцы точки" },
    { type: "list", items: vm.marketSellers.map(marketSellerRow) },
  ];
}

export const MapSheetAdapter = {
  toBlocks(vm: MapViewModel): ContentBlock[] {
    // Окна мастера «Поиск продавцов» и история просмотра обрабатываются раньше
    // проверок состояния карты: их содержимое не зависит от загрузки видимой
    // области.
    if (vm.bottomSheet === "sellerSearchOrigin") {
      return searchOriginBlocks();
    }
    if (vm.bottomSheet === "sellerSearchResults") {
      return searchResultsBlocks(vm.sellerSearch);
    }
    if (vm.bottomSheet === "sellerHistory") {
      return sellerHistoryBlocks(vm.sellerHistory);
    }
    if (vm.bottomSheet === "marketSellers") {
      return marketSellersBlocks(vm);
    }
    // Карточка выбранного продавца — тоже до проверки пустой области: продавца
    // из результатов поиска (или восстановленного сеанса, searchResult) может
    // не быть в видимой области (точка поиска далеко), но карточка обязана
    // открыться. Источники данных — те же, что у withVisibleSellers в runtime
    // (findSellerData): видимая область, результаты мастера, поиск по имени.
    if (vm.bottomSheet === "sellerSummary" && vm.selectedSellerId) {
      const seller =
        vm.sellers.find((s) => s.sellerId === vm.selectedSellerId) ??
        vm.sellerSearch.results.find((s) => s.sellerId === vm.selectedSellerId) ??
        vm.searchResult?.find((s) => s.sellerId === vm.selectedSellerId) ??
        null;
      if (seller) return sellerSummaryBlocks(seller);
    }
    if (vm.state === "loading" || vm.state === "idle") {
      return [{ type: "skeleton" }];
    }
    if (vm.state === "error") {
      return [{ type: "errorRetry", text: "Не удалось загрузить данные карты.", retryAction: { type: "MAP_LOADED" } }];
    }
    if (vm.state === "empty" || vm.sellers.length === 0) {
      return [{ type: "empty", text: "Продавцы в этой области не найдены" }];
    }
    return [];
  },
};
