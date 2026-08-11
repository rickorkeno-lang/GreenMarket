import type { SellerId } from "@/platform-core/contracts/Action";
import type { CategoryId } from "@/platform-core/contracts/DomainTypes";
import type { ViewState } from "@/platform-core/contracts/ViewState";
import type { SellerHistoryEntry } from "@/platform-core/map/history/SellerHistory";
import type { SearchMode, ProductNameSuggestion, ProductSellerMatch } from "@/platform-core/map/product-search/ProductSearch";

/** Географическая точка WGS84 (EPSG:4326) — см. IMP-003.1 §2 "Координаты". */
export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Продавец на карте — доменная запись Map (IMP-003.1 §15 "Маркеры продавцов").
 *  Не путать с SellerCardViewModel#seller (там уже отформатированные строки
 *  distance и т.п.) — здесь сырые данные, форматирование делает MapSheetAdapter. */
export interface SellerMapRecord {
  sellerId: SellerId;
  name: string;
  location: GeoPoint;
  rating: number;
  distanceMeters: number;
  categories: CategoryId[];
  categoryNames: string[];
  photoUrl: string | null;
  isOpenNow: boolean;
  workingHoursLabel: string;
  isAvailable: boolean;
}

export interface CameraParams {
  center: GeoPoint;
  zoom: number;
}

/** Состояние автодополнения строки поиска (MAP-019). Домен: подсказки
 *  запрашиваются по мере ввода (с дебаунсом в MapRuntime) и показываются в
 *  дропдауне под строкой поиска. query — это запрос, для которого получено
 *  текущее состояние: дропдаун показывается только когда он совпадает с
 *  фактическим текстом в поле (иначе в момент набора видны устаревшие
 *  подсказки). loading=true — реальный запрос к Repository ещё в полёте
 *  (дропдаун показывает спиннер).
 *
 *  Фильтрация подсказок — та же единая сущность, что у карты, списка
 *  продавцов и мастера поиска (MAP-053): rawSuggestions хранит сырой ответ
 *  Repository, а suggestions пересчитывается из него текущим глобальным
 *  фильтром в reducer. Смена фильтра не перезапрашивает Repository, а
 *  пересчитывает подсказки локально. */
export interface SearchSuggestionsState {
  /** Запрос, для которого актуальны loading/suggestions; пустая строка —
   *  поле поиска пусто или подсказки сброшены (дропдаун скрыт). */
  query: string;
  /** Идёт ли запрос подсказок (спиннер в дропдауне). */
  loading: boolean;
  /** Сырые подсказки из Repository (по запросу, БЕЗ глобального фильтра) —
   *  нужны, чтобы при смене фильтра пересчитать suggestions без повторного
   *  запроса (имя подчёркивает, что фильтр в них не применён). */
  rawSuggestions: SellerMapRecord[];
  /** Видимые подсказки = rawSuggestions, пропущенные через глобальный фильтр.
   *  Именно их показывает дропдаун. */
  suggestions: SellerMapRecord[];
}

/** Состояние мастера «Поиск продавцов» (MAP-053/MAP-018). Пользователь
 *  выбирает точку поиска (своё местоположение или центр экрана), вводит
 *  радиус (дебаунс на ввод), и получает результат, отсортированный по
 *  расстоянию. К результатам применяется тот же глобальный фильтр, что на
 *  карте и в списке продавцов (единая сущность — MapRuntime.selectedFilters). */
export interface SellerSearchState {
  /** null — точка ещё не выбрана (экран выбора точки). */
  origin: GeoPoint | null;
  /** Подпись точки для заголовков/пустых состояний («Моё местоположение» /
   *  «Положение на карте»). */
  originLabel: string | null;
  /** Текущий радиус в метрах (пользователь вводит его в км). */
  radiusMeters: number;
  /** Сырые результаты из Repository (в радиусе, отсортированы по запросу) —
   *  БЕЗ глобального фильтра. null = поиск ещё не выполнялся (скелетон), имя
   *  подчёркивает, что перезапрос не трогает UI-фильтр. */
  rawResults: SellerMapRecord[] | null;
  /** Видимые результаты = rawResults, пропущенные через глобальный фильтр. */
  results: SellerMapRecord[];
  /** true — последний запрос результатов упал (SELLER_SEARCH_FAILED): вместо
   *  вечного скелетона мастер показывает errorRetry («Повторить»). Сбрасывается
   *  при новом запросе/смене точки. */
  failed: boolean;
}

export type BottomSheetState =
  | "hidden"
  | "sellerSummary"
  | "sellerSearchOrigin"
  | "sellerSearchResults"
  | "sellerHistory";

/** Маршрут до продавца (MAP-020) — декодированная геометрия маршрута (ломаная
 *  в WGS84, порядок точек — от точки пользователя к продавцу) и его метрики.
 *  Это всё, что знают потребители маршрута: карта (LeafletAdapter рисует
 *  полилинию) и Bottom Sheet (расстояние/время). Отрисовка/форматирование —
 *  дело адаптеров, сама модель движко-независима. */
export interface RouteModel {
  geometry: GeoPoint[];
  distanceMeters: number;
  durationSeconds: number;
}

/** Причина, почему маршрут не построен (route.status = "error"):
 *  "no-route" — провайдер маршрутов не нашёл путь (между точками нет дорог);
 *  "network" — провайдер/сеть недоступны (запрос упал, таймаут, нет соединения).
 *  Bottom Sheet показывает разный текст и разную кнопку повторной попытки. */
export type RouteFailureKind = "no-route" | "network";

/** Состояние маршрута до выбранного продавца (MAP-020). idle — маршрут не
 *  запрашивался (или пользователь его убрал); loading — строится; success —
 *  построен (модель); error — не построен с причиной (см. RouteFailureKind). */
export type RouteState =
  | { status: "idle" }
  | { status: "loading"; sellerId: SellerId }
  | { status: "success"; sellerId: SellerId; route: RouteModel }
  | { status: "error"; sellerId: SellerId; kind: RouteFailureKind };

/** Состояние поиска по товарам (режим строки поиска). Пользователь может
 *  переключать строку поиска между «по названию продавца» и «по товару»
 *  (кнопка-переключатель под полем при пустом тексте).
 *
 *  В режиме product фаза "names" — подсказки дописывают название товара
 *  (автодополнение); фаза "sellers" — после выбора названия (или срабатывания
 *  «Возможно вы имели в виду») подсказки становятся продавцами с ценой на
 *  товар. suggestedProduct — товар, предложенный системой «Возможно вы имели
 *  в виду» (схожесть >85%), когда прямых совпадений по запросу не было. */
export interface ProductSearchState {
  /** Активный режим строки поиска. */
  mode: SearchMode;
  /** Запрос, для которого актуальны loading/nameSuggestions/sellers. */
  query: string;
  /** Идёт ли запрос подсказок/продавцов (спиннер в дропдауне). */
  loading: boolean;
  /** "names" — подсказки названий товаров; "sellers" — продавцы с ценой. */
  phase: "names" | "sellers";
  nameSuggestions: ProductNameSuggestion[];
  sellers: ProductSellerMatch[];
  suggestedProduct: string | null;
  /** true — последний запрос подсказок/продавцов упал (PRODUCT_SEARCH_FAILED):
   *  дропдаун показывает ошибку отдельно от «ничего не найдено». Сбрасывается
   *  при новом запросе, очистке или смене режима. */
  failed: boolean;
}

/** Доменный контракт экрана Map (IMP-003.1 §10 "ViewModel"). Ничего не знает
 *  про Leaflet/react-leaflet — та часть инкапсулирована в map/gis/. */
export interface MapViewModel {
  state: ViewState;
  sellers: SellerMapRecord[];
  /** Результат поиска продавца по имени (MAP-053) и — при восстановлении
   *  сеанса — снапшот карточки открытого продавца. Источник данных карточки,
   *  когда продавец вне видимой области (см. MapSheetAdapter). null — поиска
   *  не было. */
  searchResult: SellerMapRecord[] | null;
  selectedSellerId: SellerId | null;
  userLocation: GeoPoint | null;
  camera: CameraParams;
  bottomSheet: BottomSheetState;
  /** Мастер «Поиск продавцов» (MAP-053/MAP-018). Всегда актуален; активен,
   *  когда bottomSheet = sellerSearchOrigin/sellerSearchResults. */
  sellerSearch: SellerSearchState;
  /** Автодополнение строки поиска (MAP-019). Всегда актуально; дропдаун
   *  показывает подсказки по мере ввода в режиме «по названию». */
  searchSuggestions: SearchSuggestionsState;
  /** Поиск по товарам: режим строки поиска + подсказки названий/продавцов
   *  (активно в режиме product, см. ProductSearchState выше). */
  productSearch: ProductSearchState;
  /** История просмотра продавцов (снапшоты + время просмотра), свежие сверху.
   *  Показывается в панели bottomSheet = "sellerHistory"; пустой список —
   *  кнопка истории на карте скрыта (см. MapScreenView). */
  sellerHistory: SellerHistoryEntry[];
  /** Маршрут до выбранного продавца (MAP-020). Актуален при bottomSheet =
   *  "sellerSummary"; LeafletAdapter рисует полилинию, карточка показывает
   *  расстояние/время и кнопки «Маршрут»/«Убрать маршрут». */
  route: RouteState;
  currentAreaLabel: string | null;
}
