import type { MarketId, SellerId } from "@/platform-core/contracts/Action";
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
 *  distance и т.п.) — здесь сырые данные, форматирование делает MapSheetAdapter.
 *
 *  Замечание №2: запись НЕ выдумывает backend-факты. У продавца с бэкенда, чей
 *  профиль не отдаёт координаты/рейтинг/часы работы, соответствующие поля
 *  отсутствуют (location = null, остальное — undefined). Потребители обязаны
 *  явно обрабатывать «данных нет» — компилятор заставляет это делать. */
export interface SellerMapRecord {
  sellerId: SellerId;
  name: string;
  location: GeoPoint | null;
  /** Оценка продавца; undefined — бэкенд не отдал. */
  rating?: number;
  /** Расстояние до точки интереса (карты/поиска); undefined — неизвестно. */
  distanceMeters?: number;
  categories: CategoryId[];
  /** Имена категорий для подписей/фильтра (отображаемый текст, не бренд). */
  categoryNames: string[];
  /**
   * Будущее (архитектурная заготовка «категория → маркер», см. MarkerStyle):
   * если за категорией шопа закреплено несколько иконок, продавец выбирает
   * иконку при настройке аккаунта — поле вроде `markerIconId?: string`.
   * Сейчас поля нет намеренно: единственный визуал — дефолтный кружок, и
   * категория попадает в маркер через resolveSellerMarkerVisual(categories)
   * (категория — часть маркера, а не только фильтра). Когда появится выбор
   * иконки, resolver получит приоритет над дефолтом категории.
   */
  photoUrl: string | null;
  /** Открыт ли сейчас; undefined — бэкенд не отдал. */
  isOpenNow?: boolean;
  /** Подпись часов работы; undefined — нет данных. */
  workingHoursLabel?: string;
  /** Доступен ли продавец (принимает ли заказы); undefined — неизвестно. */
  isAvailable?: boolean;
}

/** Тип точки торговли (задача «Маркеты»): MARKET — рынок (много продавцов в
 *  одном месте, у каждого ряд/место), SHOP — отдельно стоящая лавка (пин — это
 *  фактически сам продавец, ряда/места нет). */
export type MarketType = "MARKET" | "SHOP";

/** Точка торговли на карте (задача «Маркеты»): доменная запись для пинa.
 *  Координата принадлежит МЕСТУ, а не продавцу — на рынке сотни продавцов по
 *  одному адресу, дублировать адрес в каждом профиле нельзя (таск-док §«Главное
 *  отличие от текущей модели»). Поля rating/categories/photoUrl/isOpenNow на
 *  бэкенде отсутствуют и сюда сознательно не введены: карта маркетов строится
 *  на том, что есть (пины, список продавцов, карточка продавца). */
export interface MarketMapRecord {
  marketId: MarketId;
  name: string;
  type: MarketType;
  address: string;
  location: GeoPoint;
  /** Число продавцов, привязанных к точке (счётчик из API). */
  sellerCount: number;
}

/** Продавец внутри точки торговли (задача «Маркеты»): краткая запись списка
 *  точки (GET /markets/{id}/sellers). Только идентификация + витринные поля;
 *  полный профиль/товары догружаются по sellerId (sellerRepository.getSeller/
 *  getSellerCard — существующая модель, её не дублируем). row/place — ряд и
 *  место на рынке, по которым покупатель находит продавца внутри; у лавки
 *  (SHOP) пусты. */
export interface MarketSellerRecord {
  sellerId: SellerId;
  name: string;
  row: string | null;
  place: string | null;
  workingHours: string | null;
  shortDescription: string | null;
  productCount: number;
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
  | "sellerHistory"
  | "marketSellers";

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
 *  "no-permission" — точка старта (геолокация пользователя) недоступна: браузер
 *    явно запретил доступ; "unavailable" — геолокация недоступна/ошибка.
 *  В двух последних случаях маршрут НЕ строится (молчаливый фолбэк на центр
 *  карты недопустим — defaultCenter это конфигурация, а не позиция
 *  пользователя): экран показывает ту же ошибку геолокации, что у кнопок
 *  «Моё местоположение» и «Поиск продавцов». */
export type RouteFailureKind = "no-route" | "network" | "no-permission" | "unavailable";

/** Цель маршрута (MAP-020 + задача «Маркеты»). Маршрут строится не только до
 *  продавца (со страницы продавца), но и до точки торговли — по кнопке
 *  «Построить маршрут» в попапе маркера (для лавки это фактически сам продавец,
 *  для рынка — точка, откуда начинается поиск продавца). Discriminated union
 *  заставляет reducer/адаптеры обрабатывать обе цели исчерпывающе. */
export type RouteTarget =
  | { kind: "seller"; sellerId: SellerId }
  | { kind: "market"; marketId: MarketId };

/** Состояние маршрута до выбранной цели (MAP-020). idle — маршрут не
 *  запрашивался (или пользователь его убрал); loading — строится; success —
 *  построен (модель); error — не построен с причиной (см. RouteFailureKind). */
export type RouteState =
  | { status: "idle" }
  | { status: "loading"; target: RouteTarget }
  | { status: "success"; target: RouteTarget; route: RouteModel }
  | { status: "error"; target: RouteTarget; kind: RouteFailureKind };

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
  /** Точки торговли в видимой области (задача «Маркеты»): пины рынков/лавок.
   *  Грузятся параллельно с продавцами из onVisibleBoundsChange; рисуются
   *  отдельным слоем (не кластеризуются). */
  markets: MarketMapRecord[];
  /** Идёт ли загрузка точек торговли (спиннер/состояние карты). */
  marketsLoading: boolean;
  /** Упал ли запрос точек торговли (последний MARKETS_LOAD_FAILED). */
  marketsError: boolean;
  /** Выбранная точка торговли (открыт её попап на карте). */
  selectedMarketId: MarketId | null;
  /** Продавцы открытой точки (нижний шит «Продавцы рынка»); null — список ещё
   *  не запрашивался/закрыт. */
  marketSellers: MarketSellerRecord[] | null;
  /** Точка, чьи продавцы сейчас в шите (для повторного запроса/заголовка). */
  marketSellersMarketId: MarketId | null;
  /** Идёт ли загрузка продавцов точки. */
  marketSellersLoading: boolean;
  /** Упал ли запрос продавцов точки (ошибка → errorRetry в шите). */
  marketSellersFailed: boolean;
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

  /** MAP-027: Флаг скрытия встроенных POI карты. Если true, на карте не 
   *  отображаются стандартные метки ресторанов/магазинов тайлового провайдера. */
  hideMapPois: boolean;
}
