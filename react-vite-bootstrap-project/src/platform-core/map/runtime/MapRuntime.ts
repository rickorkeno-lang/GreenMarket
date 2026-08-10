import type { SellerId } from "@/platform-core/contracts/Action";
import type {
  BottomSheetState,
  GeoPoint,
  MapBounds,
  ProductSearchState,
  SearchSuggestionsState,
  SellerMapRecord,
  SellerSearchState,
} from "@/platform-core/map/viewmodels/MapViewModel";
import type { CategoryOption } from "@/platform-core/map/repository/SellerRepository";
import type { SearchMode, ProductNameSuggestion, ProductSellerMatch, ProductSearchResult } from "@/platform-core/map/product-search/ProductSearch";
import { defaultMapConfig } from "@/platform-core/map/gis/MapConfig";
import { GeoService } from "@/platform-core/map/gis/GeoService";
import { sellerRepository } from "@/platform-core/map/repository/repository";
import { MapSessionStore } from "@/platform-core/map/persistence/MapSessionStore";
import type { MapSessionSnapshot } from "@/platform-core/map/persistence/MapSessionStore";
import { SellerHistoryStore } from "@/platform-core/map/persistence/SellerHistoryStore";
import type { SellerHistoryEntry } from "@/platform-core/map/history/SellerHistory";
import { Diagnostics } from "@/platform-core/diagnostics/Diagnostics";
import {
  applySellerFilters,
  buildSellerFilters,
  type SellerFilterGroup,
  type SellerFiltersState,
} from "@/platform-core/map/filters/SellerFilters";

/* ============================================================================
 * MapRuntime — IMP-003.1.2 §8: "Runtime становится единственным источником
 * состояния" (выбранный продавец, положение карты, масштаб, состояние
 * Bottom Sheet, результаты поиска, фильтр). React-компоненты только
 * отображают это состояние и вызывают dispatch() — сами его не меняют.
 * Асинхронные потоки с debounce (загрузка продавцов, геокодирование,
 * поиск/радиус мастера) тоже запускаются методами runtime (request*),
 * а не компонентами, — см. низ этого файла.
 *
 * Общий GreenMarketRuntime (navigation-runtime-layer) хранит ТОЛЬКО стек
 * навигации (RuntimeState = { navigation }) — это общий контракт для всех
 * 7+1 экранов, расширять его доменным состоянием одного экрана означало бы
 * менять фундамент, от которого зависят остальные модули. MapRuntime — тот
 * же паттерн (getState/dispatch/subscribe), но масштаба одного экрана;
 * навигационные Action (OPEN_SELLER, OPEN_SELLER_LIST, OPEN_CATALOG, BACK)
 * по-прежнему идут через общий Runtime (см. MapScreenView) — MapRuntime не
 * подменяет Action Catalog/ScreenRegistry, а дополняет их доменным слоем,
 * которого не было ни у одного из существующих модулей.
 *
 * Фильтр продавцов — конфигурируемый (см. platform-core/map/filters/
 * SellerFilters.ts): состояние выбора хранится здесь как groupId → optionId[]
 * и ОБЩЕЕ для карты, списка продавцов (см. SellerListScreenView) и мастера
 * «Поиск продавцов». Мастер читает тот же selectedFilters и применяет его к
 * своим результатам — смена фильтра в любом из трёх мест сразу видна в
 * остальных (единая сущность). Новые методы/чекбоксы добавляются в
 * buildSellerFilters без изменения reducer'а и UI.
 *
 *  Singleton на уровне модуля — переживает unmount/remount MapScreenView
 *  (уход на Catalog/SellerCard и возврат), что и даёт "восстановление
 *  состояния карты после возврата на экран" (§10/§12): в пределах вкладки
 *  runtime — единственный источник состояния. Между СЕАНСАМИ (перезагрузка
 *  или закрытие страницы) состояние сохраняет MapSessionStore (localStorage):
 *  при создании runtime применяет снапшот через withRestoredSession (см. ниже),
 *  при закрытии — экран вызывает toSessionSnapshot.
 *  ========================================================================== */

/** Радиус поиска продавцов по умолчанию (метры) — стартовое значение мастера
 *  «Поиск продавцов» (MAP-053/MAP-018); пользователь может его изменить. */
export const DEFAULT_SELLER_SEARCH_RADIUS_METERS = 5000;

/* Дебаунс асинхронных запросов runtime (методы request* ниже): запрос к
 * Repository/геокодированию запускается после паузы в событиях (moveend/zoomend,
 * ввод радиуса), а не на каждый кадр/символ (MAP-011, MAP-053/MAP-018).
 * SEARCH_SUGGESTIONS_DEBOUNCE_MS — ввод строки поиска (MAP-019): не дёргаем
 * Repository на каждый символ, подсказки запрашиваются после паузы в наборе. */
const VISIBLE_SELLERS_DEBOUNCE_MS = 500;
const AREA_LABEL_DEBOUNCE_MS = 500;
const SELLER_SEARCH_DEBOUNCE_MS = 500;
const SEARCH_SUGGESTIONS_DEBOUNCE_MS = 350;

function boundsNearlyEqual(a: MapBounds, b: MapBounds): boolean {
  return (
    Math.abs(a.north - b.north) < 0.0001 &&
    Math.abs(a.south - b.south) < 0.0001 &&
    Math.abs(a.east - b.east) < 0.0001 &&
    Math.abs(a.west - b.west) < 0.0001
  );
}

export interface MapRuntimeState {
  /** Продавцы, прошедшие фильтр (то, что реально рисуется на карте). Ниже в
   *  reducer считается из loadedSellers + selectedFilters. */
  visibleSellers: SellerMapRecord[];
  /** Сырой результат Repository (видимая область, БЕЗ фильтра) — нужен,
   *  чтобы при смене фильтра не перезапрашивать Repository, а пересчитать
   *  видимый список локально. */
  loadedSellers: SellerMapRecord[];
  /** Все категории каталога (источник для опций группы «Категория»). */
  categories: CategoryOption[];
  /** Выбранные опции фильтра: groupId → optionId[]. Группа с пустым набором
   *  не фильтрует (в категориях это «Все»). */
  selectedFilters: SellerFiltersState;
  selectedSellerId: SellerId | null;
  bottomSheet: BottomSheetState;
  /** Мастер «Поиск продавцов» (MAP-053/MAP-018): точка поиска, радиус и
   *  результаты. Активен, когда bottomSheet = sellerSearchOrigin /
   *  sellerSearchResults. rawResults хранит сырой ответ Repository, а results
   *  пересчитывается из него тем же глобальным фильтром, что и visibleSellers
   *  (единая сущность — смена фильтра в любом месте видна во всех). */
  sellerSearch: SellerSearchState;
  /** Автодополнение строки поиска (MAP-019): подсказки по мере ввода.
   *  Актуально всегда; дропдаун в шапке показывает его содержимое. */
  searchSuggestions: SearchSuggestionsState;
  /** Поиск по товарам (см. ProductSearchState в MapViewModel): режим строки
   *  поиска + подсказки названий товаров / продавцов с ценой. */
  productSearch: ProductSearchState;
  /** История просмотра продавцов (снапшоты + время просмотра), свежие сверху.
   *  Копия SellerHistoryStore: хранится здесь, чтобы карта знала о наличии
   *  истории (кнопка-иконка) и рендерила панель без синхронного чтения
   *  localStorage на каждый рендер. */
  sellerHistory: SellerHistoryEntry[];
  mapCenter: GeoPoint;
  zoom: number;
  userLocation: GeoPoint | null;
  searchResult: SellerMapRecord[] | null;
  loading: boolean;
  error: boolean;
  /** Название района/населённого пункта текущего просмотра (GM-UX-001
   *  "Область текущего района"); null — район не определён. */
  currentAreaLabel: string | null;
}

export type MapRuntimeAction =
  | { type: "MAP_LOADED" }
  | { type: "SELLERS_LOADING" }
  | { type: "SELLERS_LOADED"; sellers: SellerMapRecord[] }
  | { type: "SELLERS_LOAD_FAILED" }
  | { type: "MOVE_MAP"; center: GeoPoint; zoom: number }
  | { type: "ZOOM_MAP"; zoom: number }
  | { type: "CENTER_ON_USER_SUCCESS"; location: GeoPoint }
  /* §4: "повторное нажатие по выбранному продавцу" и "выбор другого
   * продавца" — оба обрабатываются одним и тем же SELECT_SELLER: reducer
   * ниже гарантирует, что в любой момент выбран не более чем один продавец,
   * без отдельной ветки под "уже выбран этот же". */
  | { type: "SELECT_SELLER"; sellerId: SellerId }
  | { type: "UNSELECT_SELLER" }
  | { type: "SEARCH_RESULT"; sellers: SellerMapRecord[] }
  | { type: "SEARCH_CLEARED" }
  /* ======== Action'ы мастера «Поиск продавцов» (MAP-053/MAP-018) ========
   *  SELLER_SEARCH_OPEN — открыть мастер (экран выбора точки).
   *  SELLER_SEARCH_ORIGIN_PICKED { origin, label } — выбрана точка поиска;
   *    мастер переходит на экран результатов (поиск запускает компонент).
   *  SELLER_SEARCH_RADIUS_CHANGED { radiusMeters } — пользователь ввёл новый
   *    радиус (перезапрос делает компонент после дебаунса).
   *  SELLER_SEARCH_RESULT { sellers } — Repository вернул сырые результаты
   *    (фильтр применяется в reducer к results).
   *  SELLER_SEARCH_BACK — вернуться с экрана результатов к выбору точки.
   *  ------------------------------------------------------------------- */
  | { type: "SELLER_SEARCH_OPEN" }
  | { type: "SELLER_SEARCH_ORIGIN_PICKED"; origin: GeoPoint; label: string }
  | { type: "SELLER_SEARCH_RADIUS_CHANGED"; radiusMeters: number }
  | { type: "SELLER_SEARCH_RESULT"; sellers: SellerMapRecord[] }
  | { type: "SELLER_SEARCH_FAILED" }
  | { type: "SELLER_SEARCH_BACK" }
  /* ======== История просмотра продавцов ========
   *  SELLER_HISTORY_OPENED { history } — открыта панель истории: список
   *    перечитан из SellerHistoryStore (панель может открыться после того,
   *    как история пополнилась на странице продавца).
   *  SELLER_HISTORY_UPDATED { history } — история обновлена (копия store в
   *    state актуализирована при монтировании карты или после записи).
   *  --------------------------------------------------------------- */
  | { type: "SELLER_HISTORY_OPENED"; history: SellerHistoryEntry[] }
  | { type: "SELLER_HISTORY_UPDATED"; history: SellerHistoryEntry[] }
  /* ======== Автодополнение строки поиска (MAP-019) ========
   *  SEARCH_SUGGESTIONS_START { query } — ввод изменился, запрос подсказок
   *    для нового query начат (оптимистично: спиннер в дропдауне виден с
   *    первого символа, реальный вызов Repository — после дебаунса).
   *  SEARCH_SUGGESTIONS_LOADED { query, suggestions } — Repository вернул
   *    подсказки для запроса.
   *  SEARCH_SUGGESTIONS_FAILED — запрос подсказок упал: дропдаун показывает
   *    «ничего не найдено», поиск по сабмиту продолжает работать.
   *  SEARCH_SUGGESTIONS_CLEARED — поле поиска очищено / продавец выбран из
   *    дропдауна: подсказки сбрасываются, дропдаун закрывается.
   *  ------------------------------------------------------------------- */
  | { type: "SEARCH_SUGGESTIONS_START"; query: string }
  | { type: "SEARCH_SUGGESTIONS_LOADED"; query: string; suggestions: SellerMapRecord[] }
  | { type: "SEARCH_SUGGESTIONS_FAILED" }
  | { type: "SEARCH_SUGGESTIONS_CLEARED" }
  /* ======== Поиск по товарам (режим строки поиска) ========
   *  SET_SEARCH_MODE { mode } — переключатель «по названию» / «по товару»:
   *    сбрасывает обе группы подсказок.
   *  PRODUCT_SEARCH_NAMES_START { query } — начат запрос автодополнения
   *    названий товаров (оптимистичный спиннер; реальный запрос — после
   *    дебаунса).
   *  PRODUCT_SEARCH_NAMES_LOADED { query, suggestions } — прямые совпадения
   *    названий; фаза "names" (подсказки дописывают название).
   *  PRODUCT_SEARCH_SELLERS_LOADED { query, sellers, suggestedProduct } —
   *    продавцы с ценой: после выбора названия, сабмита или «Возможно вы
   *    имели в виду» (>85%) — фаза "sellers".
   *  PRODUCT_SEARCH_CLEARED — поле очищено / режим сброшен.
   *  ------------------------------------------------------------------- */
  | { type: "SET_SEARCH_MODE"; mode: SearchMode }
  | { type: "PRODUCT_SEARCH_NAMES_START"; query: string }
  | { type: "PRODUCT_SEARCH_NAMES_LOADED"; query: string; suggestions: ProductNameSuggestion[] }
  | { type: "PRODUCT_SEARCH_SELLERS_LOADED"; query: string; sellers: ProductSellerMatch[]; suggestedProduct: string | null }
  | { type: "PRODUCT_SEARCH_CLEARED" }
  | { type: "AREA_LABEL_UPDATED"; label: string | null }
  | { type: "CATEGORIES_LOADED"; categories: CategoryOption[] }
  /* Универсальная смена фильтра: выбранные опции одной группы (например
   * "category" → [categoryId], "state" → ["open", "available"]). visibleSellers
   * пересчитывается локально из loadedSellers — Repository не дёргается. */
  | { type: "SET_FILTER_OPTIONS"; groupId: string; optionIds: string[] };

/** Тексты полей ввода, которыми MapScreenView дополняет доменный снапшот при
 *  сохранении сеанса (MapRuntime#toSessionSnapshot). По конвенции экрана
 *  («локальное состояние — только поля ввода пользователя») эти строки живут
 *  в React-состоянии, а не в runtime, поэтому runtime не может их знать сам. */
export interface MapSessionInput {
  searchQuery: string;
  searchRadiusKm: string;
}

/** Восстановление сохранённого между сеансами состояния карты (MapSessionStore):
 *  позиция, фильтр, мастер «Поиск продавцов» (точка, подпись, радиус) и
 *  открытая панель Bottom Sheet. Для sellerSummary снапшот карточки кладётся
 *  в state.searchResult — продавца из результата поиска может не быть в
 *  видимой области, но карточка обязана открыться (данные карточки ищутся
 *  там же — см. findSellerData / MapSheetAdapter).
 *
 *  initialState НЕ трогается: reducer-сбросы (UNSELECT_SELLER, SELLER_SEARCH_OPEN,
 *  SEARCH_SUGGESTIONS_CLEARED) ссылаются на него. Снапшот применяется к копии
 *  initialState в момент создания runtime. В окружениях без localStorage
 *  (Node/тесты) load() возвращает null — состояние остаётся базовым. */
function withRestoredSession(base: MapRuntimeState): MapRuntimeState {
  // История просмотра — отдельная сущность от сеанса карты (другой ключ в
  // localStorage), поэтому читается всегда, независимо от наличия сеанса.
  const restored: MapRuntimeState = { ...base, sellerHistory: SellerHistoryStore.load() };
  const session = MapSessionStore.load();
  if (!session) return restored;
  const sheet = session.bottomSheet;
  let selectedSellerId: SellerId | null = null;
  let searchResult: SellerMapRecord[] | null = null;
  if (sheet?.type === "sellerSummary") {
    selectedSellerId = sheet.sellerId;
    searchResult = sheet.seller ? [sheet.seller] : null;
  }
  return {
    ...restored,
    mapCenter: session.viewport.center,
    zoom: session.viewport.zoom,
    selectedFilters: session.selectedFilters,
    bottomSheet: sheet ? sheet.type : base.bottomSheet,
    selectedSellerId,
    searchResult,
    sellerSearch: {
      ...base.sellerSearch,
      origin: session.sellerSearch.origin,
      originLabel: session.sellerSearch.originLabel,
      radiusMeters: session.sellerSearch.radiusMeters,
    },
  };
}

const initialState: MapRuntimeState = {
  visibleSellers: [],
  loadedSellers: [],
  categories: [],
  selectedFilters: {},
  selectedSellerId: null,
  bottomSheet: "hidden",
  mapCenter: defaultMapConfig.defaultCenter,
  zoom: defaultMapConfig.defaultZoom,
  userLocation: null,
  searchResult: null,
  sellerSearch: {
    origin: null,
    originLabel: null,
    radiusMeters: DEFAULT_SELLER_SEARCH_RADIUS_METERS,
    rawResults: null,
    results: [],
    failed: false,
  },
  searchSuggestions: {
    query: "",
    loading: false,
    rawSuggestions: [],
    suggestions: [],
  },
  productSearch: {
    mode: "name",
    query: "",
    loading: false,
    phase: "names",
    nameSuggestions: [],
    sellers: [],
    suggestedProduct: null,
  },
  sellerHistory: [],
  loading: false,
  error: false,
  currentAreaLabel: null,
};

/** Поиск данных продавца по всем источникам карточки Bottom Sheet: видимая
 *  область, результаты мастера «Поиск продавцов» и результат поиска по имени
 *  (searchResult, куда ложится и снапшот карточки из сохранённого сеанса).
 *  Один источник правды для «продавец доступен для карточки» — используется и
 *  в withVisibleSellers (решение «не снимать выбор»), и в MapSheetAdapter. */
function findSellerData(state: MapRuntimeState, sellerId: SellerId): SellerMapRecord | null {
  return (
    state.visibleSellers.find((s) => s.sellerId === sellerId) ??
    state.sellerSearch.results.find((s) => s.sellerId === sellerId) ??
    state.searchResult?.find((s) => s.sellerId === sellerId) ??
    null
  );
}

/** Выбранный продавец, чьи данные больше нигде не находятся (отфильтрован из
 *  видимого списка, выпал из результатов поиска и не лежит в searchResult),
 *  снимается — и закрывается Bottom Sheet, чтобы не висела пустая карточка.
 *  Данные карточки из searchResult (в т.ч. восстановленной из сеанса) выбор
 *  сохраняют: карточка обязана открыться даже вне видимой области. */
function withVisibleSellers(state: MapRuntimeState, visibleSellers: SellerMapRecord[]): MapRuntimeState {
  const next = { ...state, visibleSellers };
  const selectedStillVisible = state.selectedSellerId !== null && findSellerData(next, state.selectedSellerId) !== null;
  return {
    ...next,
    selectedSellerId: selectedStillVisible ? state.selectedSellerId : null,
    bottomSheet: selectedStillVisible ? state.bottomSheet : "hidden",
  };
}

/** Пересчитывает видимые результаты «Поиска продавцов» из rawResults по
 *  текущему глобальному фильтру. Вызывается и при SELLER_SEARCH_RESULT, и при
 *  SET_FILTER_OPTIONS/CATEGORIES_LOADED — фильтр единая сущность для карты,
 *  списка продавцов и результатов поиска. */
function withSearchResults(state: MapRuntimeState): MapRuntimeState {
  return {
    ...state,
    sellerSearch: {
      ...state.sellerSearch,
      results: applySellerFilters(
        state.sellerSearch.rawResults ?? [],
        buildSellerFilters(state.categories),
        state.selectedFilters,
      ),
    },
  };
}

/** Пересчитывает подсказки автодополнения из rawSuggestions по текущему
 *  глобальному фильтру. Вызывается и при SEARCH_SUGGESTIONS_LOADED, и при
 *  SET_FILTER_OPTIONS/CATEGORIES_LOADED — фильтр единая сущность для карты,
 *  списка продавцов, результатов поиска и подсказок (MAP-019): смена фильтра
 *  не дёргает Repository, а пересчитывает подсказки локально, как остальные
 *  списки. */
function withSearchSuggestions(state: MapRuntimeState): MapRuntimeState {
  return {
    ...state,
    searchSuggestions: {
      ...state.searchSuggestions,
      suggestions: applySellerFilters(
        state.searchSuggestions.rawSuggestions,
        buildSellerFilters(state.categories),
        state.selectedFilters,
      ),
    },
  };
}

/** Убирает из selectedFilters опции, которых больше нет в конфиге фильтра
 *  (например, выбранная категория исчезла из каталога после CATEGORIES_LOADED).
 *  Возвращает исходный объект, если менять нечего — чтобы не плодить новые
 *  ссылки и лишние перерисовки. */
function pruneSelectedFilters(
  selectedFilters: SellerFiltersState,
  groups: SellerFilterGroup[],
): SellerFiltersState {
  let changed = false;
  const pruned: SellerFiltersState = {};
  for (const group of groups) {
    const optionIds = group.options.map((o) => o.id);
    const kept = (selectedFilters[group.id] ?? []).filter((id) => optionIds.includes(id));
    if (kept.length !== (selectedFilters[group.id] ?? []).length) changed = true;
    if (kept.length > 0) pruned[group.id] = kept;
  }
  return changed ? pruned : selectedFilters;
}

function reducer(state: MapRuntimeState, action: MapRuntimeAction): MapRuntimeState {
  switch (action.type) {
    case "MAP_LOADED":
      return state;
    case "SELLERS_LOADING":
      return { ...state, loading: true, error: false };
    case "SELLERS_LOADED":
      return withVisibleSellers(
        { ...state, loading: false, error: false, loadedSellers: action.sellers },
        applySellerFilters(action.sellers, buildSellerFilters(state.categories), state.selectedFilters),
      );
    case "SELLERS_LOAD_FAILED":
      return { ...state, loading: false, error: false };
    case "CATEGORIES_LOADED": {
      // Категории — источник опций группы «Категория». Если какая-то
      // выбранная категория исчезла из нового каталога, её id в selectedFilters
      // становится «мёртвым»: фильтрация его уже игнорирует, но сводка на
      // кнопке и чекбокс «Все» показывали бы рассинхрон. Поэтому чистим выбор
      // по свежему конфигу, затем пересчитываем видимый список и результаты
      // поиска (фильтр единая сущность).
      const groups = buildSellerFilters(action.categories);
      const selectedFilters = pruneSelectedFilters(state.selectedFilters, groups);
      const next = { ...state, categories: action.categories, selectedFilters };
      return withSearchSuggestions(
        withSearchResults(
          withVisibleSellers(next, applySellerFilters(next.loadedSellers, groups, selectedFilters)),
        ),
      );
    }
    case "SET_FILTER_OPTIONS": {
      const selectedFilters = { ...state.selectedFilters, [action.groupId]: action.optionIds };
      const next = { ...state, selectedFilters };
      return withSearchSuggestions(
        withSearchResults(
          withVisibleSellers(next, applySellerFilters(state.loadedSellers, buildSellerFilters(state.categories), selectedFilters)),
        ),
      );
    }
    case "MOVE_MAP":
      return { ...state, mapCenter: action.center, zoom: action.zoom };
    case "ZOOM_MAP":
      return { ...state, zoom: action.zoom };
    case "CENTER_ON_USER_SUCCESS":
      return { ...state, userLocation: action.location, mapCenter: action.location };
    case "SELECT_SELLER":
      // sellerSearch сохраняется: карточка продавца из результатов поиска
      // может подтягивать данные, даже если продавец вне видимой области.
      return { ...state, selectedSellerId: action.sellerId, bottomSheet: "sellerSummary" };
    case "UNSELECT_SELLER":
      // Закрытие карточки/листа сбрасывает и мастер поиска — при повторном
      // открытии он начинается заново с выбора точки.
      return { ...state, selectedSellerId: null, bottomSheet: "hidden", sellerSearch: initialState.sellerSearch };
    case "SEARCH_RESULT":
      return { ...state, searchResult: action.sellers };
    case "SEARCH_CLEARED":
      return { ...state, searchResult: null };
    case "SELLER_SEARCH_OPEN":
      // Открытие мастера: сбрасываем старый мастер и выбор продавца, показываем
      // шаг выбора точки (список «Моё местоположение» / «Положение на карте»).
      // Радиус сохраняется (его вводил пользователь, в т.ч. в прошлом сеансе),
      // точка и результаты сбрасываются.
      return {
        ...state,
        selectedSellerId: null,
        bottomSheet: "sellerSearchOrigin",
        sellerSearch: { ...initialState.sellerSearch, radiusMeters: state.sellerSearch.radiusMeters },
      };
    case "SELLER_SEARCH_ORIGIN_PICKED":
      // Точка выбрана: мастер переходит к шагу результатов. Радиус/введённые
      // значения сохраняются, старые результаты (для другой точки) очищаются —
      // перезапрос запускает компонент (rawResults = null → скелетон).
      return {
        ...state,
        selectedSellerId: null,
        bottomSheet: "sellerSearchResults",
        sellerSearch: {
          ...state.sellerSearch,
          origin: action.origin,
          originLabel: action.label,
          rawResults: null,
          results: [],
          failed: false,
        },
      };
    case "SELLER_SEARCH_RADIUS_CHANGED":
      // Новый радиус: меняем радиус мгновенно; результаты перезапросит
      // компонент после дебаунса (SELLER_SEARCH_RESULT).
      return { ...state, sellerSearch: { ...state.sellerSearch, radiusMeters: action.radiusMeters } };
    case "SELLER_SEARCH_RESULT":
      // Сырые результаты от Repository; фильтр применяется к results ниже.
      return withSearchResults({
        ...state,
        sellerSearch: { ...state.sellerSearch, rawResults: action.sellers, failed: false },
      });
    case "SELLER_SEARCH_FAILED":
      // Запрос результатов упал: мастер показывает errorRetry («Повторить»)
      // вместо вечного скелетона (замечание №6 — явный error state мастера).
      return {
        ...state,
        sellerSearch: { ...state.sellerSearch, failed: true, rawResults: [], results: [] },
      };
    case "SELLER_SEARCH_BACK":
      // Возврат с экрана результатов к выбору точки: мастер остаётся открытым.
      return { ...state, selectedSellerId: null, bottomSheet: "sellerSearchOrigin" };
    case "SELLER_HISTORY_OPENED":
      // Открытие панели истории: список всегда перечитан из store (запись могла
      // появиться на странице продавца), выбор продавца сбрасывается.
      return { ...state, selectedSellerId: null, bottomSheet: "sellerHistory", sellerHistory: action.history };
    case "SELLER_HISTORY_UPDATED":
      return { ...state, sellerHistory: action.history };
    case "SEARCH_SUGGESTIONS_START":
      // Оптимистичный старт: запрос и подсказки обновляются сразу (спиннер в
      // дропдауне), реальный ответ придёт в SEARCH_SUGGESTIONS_LOADED.
      return { ...state, searchSuggestions: { query: action.query, loading: true, rawSuggestions: [], suggestions: [] } };
    case "SEARCH_SUGGESTIONS_LOADED":
      // Сырые подсказки от Repository; глобальный фильтр применяется через
      // withSearchSuggestions — та же единая сущность, что у карты и результатов
      // поиска (смена фильтра позже пересчитает подсказки без запроса).
      return withSearchSuggestions({
        ...state,
        searchSuggestions: { query: action.query, loading: false, rawSuggestions: action.suggestions, suggestions: [] },
      });
    case "SEARCH_SUGGESTIONS_FAILED":
      // Ошибка запроса подсказок: показываем пустой дропдаун, поиск по
      // сабмиту (searchSellerByName) продолжает работать отдельно.
      return {
        ...state,
        searchSuggestions: {
          query: state.searchSuggestions.query,
          loading: false,
          rawSuggestions: [],
          suggestions: [],
        },
      };
    case "SEARCH_SUGGESTIONS_CLEARED":
      return { ...state, searchSuggestions: initialState.searchSuggestions };
    case "SET_SEARCH_MODE": {
      // Переключатель режима: сбрасываются обе группы подсказок (подсказки
      // одного режима не должны мелькать в другом). Тот же режим — без изменений.
      if (action.mode === state.productSearch.mode) return state;
      return {
        ...state,
        searchSuggestions: initialState.searchSuggestions,
        productSearch: { ...initialState.productSearch, mode: action.mode },
      };
    }
    case "PRODUCT_SEARCH_NAMES_START":
      // Оптимистичный старт: спиннер виден с первого символа, реальный вызов
      // Repository — после дебаунса. Фаза "names" — подсказки названий товаров.
      return {
        ...state,
        productSearch: {
          ...state.productSearch,
          query: action.query,
          loading: true,
          phase: "names",
          nameSuggestions: [],
          sellers: [],
          suggestedProduct: null,
        },
      };
    case "PRODUCT_SEARCH_NAMES_LOADED":
      return {
        ...state,
        productSearch: {
          ...state.productSearch,
          query: action.query,
          loading: false,
          phase: "names",
          nameSuggestions: action.suggestions,
        },
      };
    case "PRODUCT_SEARCH_SELLERS_LOADED": {
      // Продавцы с ценой: после выбора названия товара, сабмита или
      // «Возможно вы имели в виду» (>85%) — фаза "sellers". Применяется тот же
      // глобальный фильтр, что к карте/списку/мастеру (единая сущность): в
      // подсказках видны только продавцы, проходящие текущий фильтр.
      const filtered = applySellerFilters(
        action.sellers.map((m) => m.seller),
        buildSellerFilters(state.categories),
        state.selectedFilters,
      );
      const filteredIds = new Set(filtered.map((s) => s.sellerId));
      const sellers = action.sellers.filter((m) => filteredIds.has(m.seller.sellerId));
      return {
        ...state,
        productSearch: {
          ...state.productSearch,
          query: action.query,
          loading: false,
          phase: "sellers",
          sellers,
          suggestedProduct: action.suggestedProduct,
        },
      };
    }
    case "PRODUCT_SEARCH_CLEARED":
      return { ...state, productSearch: { ...state.productSearch, query: "", loading: false, phase: "names", nameSuggestions: [], sellers: [], suggestedProduct: null } };
    case "AREA_LABEL_UPDATED":
      return { ...state, currentAreaLabel: action.label };
    default:
      return state;
  }
}

/* §14: диагностические события — карта загружена / масштаб / положение /
 * выбор продавца / открытие и закрытие Bottom Sheet / поиск / фильтр.
 * Переход в карточку продавца логируется в MapScreenView (это уже действие
 * Action Catalog, не внутреннее состояние MapRuntime). nextState нужен там,
 * где метрика относится к производному состоянию (подсказки после фильтра). */
function diagnosticsFor(action: MapRuntimeAction, nextState: MapRuntimeState): void {
  switch (action.type) {
    case "MAP_LOADED":
      Diagnostics.track("map.loaded");
      return;
    case "ZOOM_MAP":
      Diagnostics.track("map.zoom_changed", { zoom: action.zoom });
      return;
    case "MOVE_MAP":
      Diagnostics.track("map.moved", { center: action.center, zoom: action.zoom });
      return;
    case "SELECT_SELLER":
      Diagnostics.track("map.seller_selected", { sellerId: action.sellerId });
      Diagnostics.track("map.bottom_sheet_opened", { sellerId: action.sellerId });
      return;
    case "UNSELECT_SELLER":
      Diagnostics.track("map.bottom_sheet_closed");
      return;
    case "SEARCH_RESULT":
      Diagnostics.track("map.search_performed", { resultCount: action.sellers.length });
      return;
    case "SELLER_SEARCH_OPEN":
      Diagnostics.track("map.seller_search_opened");
      return;
    case "SELLER_SEARCH_ORIGIN_PICKED":
      Diagnostics.track("map.seller_search_origin_picked", { label: action.label });
      return;
    case "SELLER_SEARCH_RADIUS_CHANGED":
      Diagnostics.track("map.seller_search_radius_picked", { radiusMeters: action.radiusMeters });
      return;
    case "SELLER_SEARCH_RESULT":
      Diagnostics.track("map.seller_search_results_shown", { resultCount: action.sellers.length });
      return;
    case "SELLER_SEARCH_FAILED":
      Diagnostics.track("map.seller_search_failed");
      return;
    case "SELLER_SEARCH_BACK":
      Diagnostics.track("map.seller_search_back");
      return;
    case "SELLER_HISTORY_OPENED":
      Diagnostics.track("map.seller_history_opened", { count: action.history.length });
      return;
    case "SEARCH_SUGGESTIONS_LOADED":
      Diagnostics.track("map.search_suggestions_shown", {
        query: action.query,
        count: nextState.searchSuggestions.suggestions.length,
      });
      return;
    case "SEARCH_SUGGESTIONS_CLEARED":
      Diagnostics.track("map.search_suggestions_cleared");
      return;
    case "SET_SEARCH_MODE":
      Diagnostics.track("map.search_mode_changed", { mode: action.mode });
      return;
    case "PRODUCT_SEARCH_SELLERS_LOADED":
      Diagnostics.track("map.product_search_sellers_shown", {
        query: action.query,
        count: action.sellers.length,
        suggested: Boolean(action.suggestedProduct),
      });
      return;
    case "CATEGORIES_LOADED":
      Diagnostics.track("map.categories_loaded", { categoryCount: action.categories.length });
      return;
    case "SET_FILTER_OPTIONS":
      Diagnostics.track("map.filter_changed", { groupId: action.groupId, selectedCount: action.optionIds.length });
      return;
    default:
      return;
  }
}

function createMapRuntime() {
  // Применение сохранённого между сеансами состояния (MapSessionStore): карта
  // открывается там, где её оставили (позиция/масштаб), с прежними фильтром,
  // мастером поиска и открытой панелью — без перелёта камеры при старте.
  let state = withRestoredSession(initialState);
  const listeners = new Set<() => void>();

  function dispatch(action: MapRuntimeAction): void {
    state = reducer(state, action);
    diagnosticsFor(action, state);
    listeners.forEach((listener) => listener());
  }

  /* Асинхронные потоки экрана живут в runtime, а не в React-компонентах
   * (IMP-003.1.2 §8): компоненты только диспатчат и отображают состояние.
   * Таймеры и seq-счётчики принадлежат runtime (singleton переживает
   * unmount/remount экрана) — защита от гонок состояний: ответ устаревшего
   * запроса, перекрытого новым, не применяется. setTimeout вместо window —
   * чтобы те же методы работали и под npx tsx (Node, без DOM). */
  let visibleSellersTimer: ReturnType<typeof setTimeout> | null = null;
  let visibleSellersSeq = 0;
  let lastRequestedBounds: MapBounds | null = null;
  let areaLabelTimer: ReturnType<typeof setTimeout> | null = null;
  let areaLabelSeq = 0;
  let sellerSearchTimer: ReturnType<typeof setTimeout> | null = null;
  let sellerSearchSeq = 0;
  let searchSuggestionsTimer: ReturnType<typeof setTimeout> | null = null;
  let searchSuggestionsSeq = 0;
  let productSearchTimer: ReturnType<typeof setTimeout> | null = null;
  let productSearchSeq = 0;

  /** Фактическая загрузка продавцов (MAP-011): запрос Repository и применение
   *  ответа только если загрузка всё ещё последняя. */
  function loadVisibleSellersNow(bounds: MapBounds): void {
    const seq = ++visibleSellersSeq;
    dispatch({ type: "SELLERS_LOADING" });
    void sellerRepository.getVisibleSellers(bounds)
      .then((visible) => {
        if (seq === visibleSellersSeq) dispatch({ type: "SELLERS_LOADED", sellers: visible });
      })
      .catch(() => {
        if (seq === visibleSellersSeq) dispatch({ type: "SELLERS_LOAD_FAILED" });
      });
  }

  /** Загрузка видимых продавцов с дебаунсом: серия moveend/zoomend схлопывается
   *  в один запрос, почти не изменившиеся границы не перезапрашиваются. */
  function requestVisibleSellers(bounds: MapBounds): void {
    if (lastRequestedBounds && boundsNearlyEqual(lastRequestedBounds, bounds)) return;
    lastRequestedBounds = bounds;
    if (visibleSellersTimer !== null) clearTimeout(visibleSellersTimer);
    visibleSellersTimer = setTimeout(() => loadVisibleSellersNow(bounds), VISIBLE_SELLERS_DEBOUNCE_MS);
  }

  /** Повторная загрузка видимой области (кнопка «Повторить» в Bottom Sheet):
   *  обходит дебаунс и дедупликацию — принудительный перезапрос. */
  function retryVisibleSellers(): void {
    if (lastRequestedBounds) loadVisibleSellersNow(lastRequestedBounds);
  }

  /** Обратное геокодирование центра текущего просмотра (GM-UX-001 «Область
   *  текущего района») с дебаунсом — не дёргает Nominatim на каждый
   *  moveend/zoomend (например, при flyTo оба события приходят сразу). */
  function requestAreaLabel(center: GeoPoint): void {
    if (areaLabelTimer !== null) clearTimeout(areaLabelTimer);
    const seq = ++areaLabelSeq;
    areaLabelTimer = setTimeout(() => {
      void GeoService.reverseGeocode(center).then((label) => {
        if (seq === areaLabelSeq) dispatch({ type: "AREA_LABEL_UPDATED", label });
      });
    }, AREA_LABEL_DEBOUNCE_MS);
  }

  /** Поиск продавцов из мастера (MAP-053/MAP-018): запрос Repository по текущей
   *  точке и радиусу из состояния; перекрытый запрос не перетирает свежий. */
  function requestSellerSearch(): void {
    const search = state.sellerSearch;
    if (!search.origin) return;
    const seq = ++sellerSearchSeq;
    void sellerRepository.searchSellersNear({
      origin: search.origin,
      radiusMeters: search.radiusMeters,
      sort: { key: "distance" },
    })
      .then((sellers) => {
        if (seq === sellerSearchSeq) dispatch({ type: "SELLER_SEARCH_RESULT", sellers });
      })
      .catch(() => {
        if (seq === sellerSearchSeq) dispatch({ type: "SELLER_SEARCH_FAILED" });
      });
  }

  /** Смена радиуса мастера: применяется сразу, перезапрос — после дебаунса
   *  на ввод (на каждый символ сеть не дёргаем). */
  function scheduleSellerSearch(radiusMeters: number): void {
    dispatch({ type: "SELLER_SEARCH_RADIUS_CHANGED", radiusMeters });
    if (sellerSearchTimer !== null) clearTimeout(sellerSearchTimer);
    sellerSearchTimer = setTimeout(() => requestSellerSearch(), SELLER_SEARCH_DEBOUNCE_MS);
  }

  /** Отмена отложенного перезапроса (возврат из результатов к выбору точки). */
  function cancelPendingSellerSearch(): void {
    if (sellerSearchTimer !== null) clearTimeout(sellerSearchTimer);
  }

  /** Автодополнение строки поиска (MAP-019): подсказки по мере ввода, с
   *  дебаунсом (не дёргаем Repository на каждый символ) и защитой от гонок
   *  (поздний ответ устаревшего запроса не перетирает свежий — seq).
   *
   *  START диспатчится оптимистично и синхронно на каждом изменении ввода:
   *  searchSuggestions.query всегда равен текущему тексту, а спиннер в
   *  дропдауне виден с первого символа, пока реальный вызов Repository ещё
   *  отложен дебаунсом или в полёте. Пустой запрос сбрасывает подсказки. */
  function requestSearchSuggestions(query: string): void {
    const q = query.trim();
    if (!q) {
      searchSuggestionsSeq += 1;
      if (searchSuggestionsTimer !== null) clearTimeout(searchSuggestionsTimer);
      dispatch({ type: "SEARCH_SUGGESTIONS_CLEARED" });
      return;
    }
    if (searchSuggestionsTimer !== null) clearTimeout(searchSuggestionsTimer);
    const seq = ++searchSuggestionsSeq;
    dispatch({ type: "SEARCH_SUGGESTIONS_START", query: q });
    searchSuggestionsTimer = setTimeout(() => {
      void sellerRepository.searchSellers(q)
        .then((suggestions) => {
          if (seq === searchSuggestionsSeq) dispatch({ type: "SEARCH_SUGGESTIONS_LOADED", query: q, suggestions });
        })
        .catch(() => {
          if (seq === searchSuggestionsSeq) dispatch({ type: "SEARCH_SUGGESTIONS_FAILED" });
        });
    }, SEARCH_SUGGESTIONS_DEBOUNCE_MS);
  }

  /** Сброс подсказок (выбор продавца из дропдауна): отменяет отложенный
   *  запрос и инвалидирует в полёте незавершённый — поздний ответ не вернёт
   *  подсказки при уже выбранном продавце. */
  function clearSearchSuggestions(): void {
    searchSuggestionsSeq += 1;
    if (searchSuggestionsTimer !== null) clearTimeout(searchSuggestionsTimer);
    dispatch({ type: "SEARCH_SUGGESTIONS_CLEARED" });
  }

  /** Переключение режима строки поиска («по названию» ↔ «по товару»).
   *  Инвалидирует все незавершённые запросы обеих групп подсказок — ответы
   *  прежнего режима не должны попасть в новый. */
  function setSearchMode(mode: SearchMode): void {
    searchSuggestionsSeq += 1;
    productSearchSeq += 1;
    if (searchSuggestionsTimer !== null) clearTimeout(searchSuggestionsTimer);
    if (productSearchTimer !== null) clearTimeout(productSearchTimer);
    dispatch({ type: "SET_SEARCH_MODE", mode });
  }

  /** Поиск продавцов по товару (после выбора названия товара, Enter или
   *  «Возможно вы имели в виду»): запрос Repository и перевод подсказок в
   *  фазу "sellers". Защита от гонок — seq, как у остальных запросов runtime. */
  function requestProductSellers(query: string): void {
    const q = query.trim();
    if (!q) return;
    productSearchSeq += 1;
    if (productSearchTimer !== null) clearTimeout(productSearchTimer);
    const seq = productSearchSeq;
    dispatch({ type: "PRODUCT_SEARCH_NAMES_START", query: q });
    void sellerRepository.searchSellersByProduct(q)
      .then((result) => {
        if (seq === productSearchSeq) {
          dispatch({
            type: "PRODUCT_SEARCH_SELLERS_LOADED",
            query: q,
            sellers: result.sellers,
            suggestedProduct: result.suggestedProduct,
          });
        }
      })
      .catch(() => {
        if (seq === productSearchSeq) {
          dispatch({ type: "PRODUCT_SEARCH_SELLERS_LOADED", query: q, sellers: [], suggestedProduct: null });
        }
      });
  }

  /** Автодополнение товаров (поиск по товару): подсказки по мере ввода, с
   *  дебаунсом и защитой от гонок — как requestSearchSuggestions (MAP-019).
   *  Прямые совпадения названий/тегов → фаза "names" (дописать название).
   *  Прямых нет, но есть товар со схожестью >85% → «Возможно вы имели в виду»:
   *  сразу продавцы (фаза "sellers"). Иначе — пустые названия. */
  function requestProductSuggestions(query: string): void {
    const q = query.trim();
    if (!q) {
      productSearchSeq += 1;
      if (productSearchTimer !== null) clearTimeout(productSearchTimer);
      dispatch({ type: "PRODUCT_SEARCH_CLEARED" });
      return;
    }
    if (productSearchTimer !== null) clearTimeout(productSearchTimer);
    const seq = ++productSearchSeq;
    dispatch({ type: "PRODUCT_SEARCH_NAMES_START", query: q });
    productSearchTimer = setTimeout(() => {
      void sellerRepository.searchProductNames(q)
        .then((names) => {
          if (seq !== productSearchSeq) return;
          if (names.length > 0) {
            dispatch({ type: "PRODUCT_SEARCH_NAMES_LOADED", query: q, suggestions: names });
            return;
          }
          // Прямых совпадений нет — пробуем «Возможно вы имели в виду» (>85%):
          // подсказки сразу становятся продавцами этого товара.
          void sellerRepository.searchSellersByProduct(q)
            .then((result: ProductSearchResult) => {
              if (seq !== productSearchSeq) return;
              dispatch({
                type: "PRODUCT_SEARCH_SELLERS_LOADED",
                query: q,
                sellers: result.sellers,
                suggestedProduct: result.suggestedProduct,
              });
            })
            .catch(() => {
              if (seq === productSearchSeq) dispatch({ type: "PRODUCT_SEARCH_NAMES_LOADED", query: q, suggestions: [] });
            });
        })
        .catch(() => {
          if (seq === productSearchSeq) dispatch({ type: "PRODUCT_SEARCH_NAMES_LOADED", query: q, suggestions: [] });
        });
    }, SEARCH_SUGGESTIONS_DEBOUNCE_MS);
  }

  /** Сброс товарного поиска (выбор продавца / очистка поля): отменяет
   *  отложенный запрос и инвалидирует в полёте незавершённый. */
  function clearProductSearch(): void {
    productSearchSeq += 1;
    if (productSearchTimer !== null) clearTimeout(productSearchTimer);
    dispatch({ type: "PRODUCT_SEARCH_CLEARED" });
  }

  /** Поиск продавца по имени из строки поиска (MAP-053). Кладёт результат в
   *  state.searchResult и возвращает найденного продавца (null — не найден). */
  async function searchSellerByName(query: string): Promise<SellerMapRecord | null> {
    const found = await sellerRepository.findSeller(query);
    dispatch({ type: "SEARCH_RESULT", sellers: found ? [found] : [] });
    return found;
  }

  /** Загрузка категорий для фильтра — источник опций группы «Категория». */
  function loadCategories(): void {
    void sellerRepository.getCategories().then((categories) => {
      dispatch({ type: "CATEGORIES_LOADED", categories });
    });
  }

  /** Свежие данные продавца для открытой карточки (замечание №4): при
   *  восстановлении сеанса карточка сначала показывает мгновенный снапшот из
   *  searchResult, но параллельно запрашивается актуальная запись у Repository —
   *  иначе устаревшие isOpenNow/rating/distance были бы показаны как текущие.
   *  getSeller возвращает null, если продавца больше нет, — карточка остаётся
   *  со снапшотом (или закрывается штатным findSellerData). */
  function requestSellerRefresh(sellerId: SellerId): void {
    void sellerRepository.getSeller(sellerId).then((seller) => {
      if (seller) dispatch({ type: "SEARCH_RESULT", sellers: [seller] });
    });
  }

  /** Открытие панели истории просмотра: список перечитывается из
   *  SellerHistoryStore (панель может открыться после того, как история
   *  пополнилась на странице продавца), затем диспатчится SELLER_HISTORY_OPENED. */
  function openSellerHistory(): void {
    dispatch({ type: "SELLER_HISTORY_OPENED", history: SellerHistoryStore.load() });
  }

  /** Актуализация копии истории в state (SELLER_HISTORY_UPDATED). Вызывается
   *  при монтировании карты: запись могла появиться на странице продавца,
   *  пока карта была размонтирована, — чтобы кнопка-иконка истории появилась
   *  сразу, а не только после открытия панели. */
  function refreshSellerHistory(): void {
    dispatch({ type: "SELLER_HISTORY_UPDATED", history: SellerHistoryStore.load() });
  }

  /** Экспорт текущего состояния в снапшот сеанса (MapSessionStore). Домен
   *  runtime (viewport, фильтр, мастер поиска, открытая панель + данные
   *  карточки) собирается здесь — единственный источник правды; тексты полей
   *  ввода экран передаёт из своих локальных state. Вызывается и при закрытии
   *  страницы/ухода с экрана, и троттлится в подписке на изменения. */
  function toSessionSnapshot(input: MapSessionInput): MapSessionSnapshot {
    const s = state;
    let bottomSheet: MapSessionSnapshot["bottomSheet"] = null;
    if (s.bottomSheet === "sellerSummary" && s.selectedSellerId !== null) {
      bottomSheet = {
        type: "sellerSummary",
        sellerId: s.selectedSellerId,
        seller: findSellerData(s, s.selectedSellerId),
      };
    } else if (s.bottomSheet === "sellerSearchOrigin") {
      bottomSheet = { type: "sellerSearchOrigin" };
    } else if (s.bottomSheet === "sellerSearchResults") {
      bottomSheet = { type: "sellerSearchResults" };
    }
    return {
      viewport: { center: s.mapCenter, zoom: s.zoom },
      selectedFilters: s.selectedFilters,
      searchQuery: input.searchQuery,
      searchRadiusKm: input.searchRadiusKm,
      sellerSearch: {
        origin: s.sellerSearch.origin,
        originLabel: s.sellerSearch.originLabel,
        radiusMeters: s.sellerSearch.radiusMeters,
      },
      bottomSheet,
    };
  }

  // При восстановлении открытой карточки продавца (sellerSummary) мгновенно
  // рендерим снапшот сеанса, но тут же запрашиваем актуальные данные —
  // замечание №4: isOpenNow/rating/distance не должны оставаться устаревшими.
  if (state.bottomSheet === "sellerSummary" && state.selectedSellerId !== null) {
    requestSellerRefresh(state.selectedSellerId);
  }

  return {
    getState: (): MapRuntimeState => state,
    dispatch,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    requestVisibleSellers,
    retryVisibleSellers,
    requestAreaLabel,
    requestSellerSearch,
    scheduleSellerSearch,
    cancelPendingSellerSearch,
    searchSellerByName,
    requestSearchSuggestions,
    clearSearchSuggestions,
    setSearchMode,
    requestProductSuggestions,
    requestProductSellers,
    clearProductSearch,
    loadCategories,
    requestSellerRefresh,
    openSellerHistory,
    refreshSellerHistory,
    toSessionSnapshot,
  };
}

/** Один экземпляр на вкладку — см. комментарий в шапке файла. */
export const MapRuntime = createMapRuntime();
