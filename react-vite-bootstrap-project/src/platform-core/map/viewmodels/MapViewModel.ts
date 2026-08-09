import type { SellerId } from "@/platform-core/contracts/Action";
import type { CategoryId } from "@/platform-core/contracts/DomainTypes";
import type { ViewState } from "@/platform-core/contracts/ViewState";

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
}

export type BottomSheetState = "hidden" | "sellerSummary" | "sellerSearchOrigin" | "sellerSearchResults";

/** Доменный контракт экрана Map (IMP-003.1 §10 "ViewModel"). Ничего не знает
 *  про Leaflet/react-leaflet — та часть инкапсулирована в map/gis/. */
export interface MapViewModel {
  state: ViewState;
  sellers: SellerMapRecord[];
  selectedSellerId: SellerId | null;
  userLocation: GeoPoint | null;
  camera: CameraParams;
  bottomSheet: BottomSheetState;
  /** Мастер «Поиск продавцов» (MAP-053/MAP-018). Всегда актуален; активен,
   *  когда bottomSheet = sellerSearchOrigin/sellerSearchResults. */
  sellerSearch: SellerSearchState;
  /** Автодополнение строки поиска (MAP-019). Всегда актуально; дропдаун
   *  показывает подсказки по мере ввода. */
  searchSuggestions: SearchSuggestionsState;
  currentAreaLabel: string | null;
}
