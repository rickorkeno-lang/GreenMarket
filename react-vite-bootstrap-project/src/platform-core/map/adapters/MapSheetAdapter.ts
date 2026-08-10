import type { ContentBlock, RowItem } from "@/platform-core/contracts/ContentBlock";
import type {
  MapViewModel,
  SellerMapRecord,
  SellerSearchState,
} from "@/platform-core/map/viewmodels/MapViewModel";
import { RatingFormatter } from "@/platform-core/formatting/RatingFormatter";
import { DistanceFormatter } from "@/platform-core/formatting/DistanceFormatter";

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
 *  существующего контракта. */

/** Иконка продавца в списках — как в ProductCardAdapter/PurchaseOptionsAdapter. */
const SELLER_ICON = "🏪";

/** Подпись статуса продавца — общая для карточки и списков. */
function sellerStatusSubtitle(seller: SellerMapRecord): string {
  if (!seller.isAvailable) return "Сейчас недоступен";
  return seller.isOpenNow ? "Открыт сейчас" : "Сейчас закрыт";
}

/** Строка списка: иконка + название + расстояние и статус. Действие —
 *  открыть карточку продавца (SELECT_SELLER), как при выборе маркера. */
function sellerRow(seller: SellerMapRecord): RowItem {
  return {
    id: `seller-${seller.sellerId}`,
    avatar: SELLER_ICON,
    title: seller.name,
    subtitle: `${DistanceFormatter.format({ meters: seller.distanceMeters })} · ${sellerStatusSubtitle(seller)}`,
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
          subtitle: sellerStatusSubtitle(seller),
          trailing: "",
          highlighted: true,
          action: { type: "OPEN_SELLER", payload: { sellerId: seller.sellerId } },
        },
      ],
    },
  ];
}

export const MapSheetAdapter = {
  toBlocks(vm: MapViewModel): ContentBlock[] {
    // Окна мастера «Поиск продавцов» обрабатываются раньше проверок состояния
    // карты: их содержимое не зависит от загрузки видимой области.
    if (vm.bottomSheet === "sellerSearchOrigin") {
      return searchOriginBlocks();
    }
    if (vm.bottomSheet === "sellerSearchResults") {
      return searchResultsBlocks(vm.sellerSearch);
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
