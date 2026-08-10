import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Content, Header, Row, Stack } from '@/layout';
import { Text, IconButton, Icon, BottomSheetSurface, Snackbar } from '@/design-system/components';
import { BottomSheetContainer, SnackbarContainer } from '@/containers';
import { useGreenMarketRuntime } from '@/platform-core/navigation-runtime-layer/hooks/useGreenMarketRuntime';
import type { Action, SellerId } from '@/platform-core/contracts/Action';
import { GeoService } from '@/platform-core/map/gis/GeoService';
import { MapAdapter } from '@/platform-core/map/gis/MapAdapter';
import type { CameraChangeReason } from '@/platform-core/map/gis/MapAdapterTypes';
import { MapBuilder } from '@/platform-core/map/builders/MapBuilder';
import { DEFAULT_SELLER_SEARCH_RADIUS_METERS, MapRuntime } from '@/platform-core/map/runtime/MapRuntime';
import {
  SELLER_SEARCH_RADIUS_MAX_METERS,
  SELLER_SEARCH_RADIUS_MIN_METERS,
} from '@/platform-core/map/repository/SellerRepository';
import { MapSessionStore } from '@/platform-core/map/persistence/MapSessionStore';
import { Diagnostics } from '@/platform-core/diagnostics/Diagnostics';
import type { CameraParams, GeoPoint, MapBounds, MapViewModel, SellerMapRecord } from '@/platform-core/map/viewmodels/MapViewModel';
import type { ProductSellerMatch } from '@/platform-core/map/product-search/ProductSearch';
import { MapBottomSheetContent } from '@/screens/map/MapBottomSheetContent';
import { MapFabButton } from '@/screens/map/MapFabButton';
import { MapSearchAutocomplete } from '@/screens/map/MapSearchAutocomplete';
import { SellerFilter } from '@/screens/filter/SellerFilter';

/** Зум при центрировании на конкретного продавца (поиск / выбор из списка). */
const ZOOM_ON_SELLER = 15;

/** «Км → метры» для поля радиуса: запятая считается десятичной точкой;
 *  пустое/нечисловое/неположительное значение возвращает null (поиск не
 *  запускается, предыдущие результаты остаются). Результат зажимается в
 *  SELLER_SEARCH_RADIUS_MIN_METERS..MAX_METERS: диапазон настолько широкий
 *  (100 м … 20 000 км), что пользователь не может упереться в лимит — верхняя
 *  граница покрывает любую точку планеты. */
function parseRadiusKmToMeters(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const km = Number(normalized);
  if (!Number.isFinite(km) || km <= 0) return null;
  const meters = km * 1000;
  return Math.round(
    Math.min(SELLER_SEARCH_RADIUS_MAX_METERS, Math.max(SELLER_SEARCH_RADIUS_MIN_METERS, meters)),
  );
}

/**
 * Экран Map (IMP-003.1 → IMP-003.1.1 → IMP-003.1.2). Архитектура:
 *   Mock Repository → Runtime → MapViewModel → Builder → Layout → Design System.
 *
 * §8 IMP-003.1.2: единственный источник состояния экрана — MapRuntime (см.
 *  platform-core/map/runtime/MapRuntime.ts). Этот компонент подписан на него
 *  через useSyncExternalStore и является чистым отображением — сам не хранит
 *  ни выбранного продавца, ни камеру, ни Bottom Sheet, ни результаты поиска.
 *  Асинхронные потоки (загрузка продавцов, геокодирование, поиск/радиус
 *  мастера, автодополнение строки поиска) с debounce и защитой от гонок живут
 *  в MapRuntime (методы requestVisibleSellers / scheduleSellerSearch /
 *  requestSearchSuggestions и т.д.); геолокация — в
 *  GeoService#resolveUserLocation.
 *  Локальное состояние — только поля ввода пользователя (поиск и радиус
 *  мастера «Поиск продавцов»), токен центрирования карты и snackbar об
 *  ошибке геолокации, но не производное доменное состояние из §9 ViewModel.
 *
 * Навигационные действия (OPEN_SELLER, OPEN_SELLER_LIST, OPEN_CATALOG,
 * MAP_LOADED и т.д.) по-прежнему проходят через общий GreenMarketRuntime —
 * MapRuntime дополняет его доменным слоем, а не заменяет Action Catalog.
 */
export function MapScreenView() {
  const { dispatch } = useGreenMarketRuntime();
  const mapState = useSyncExternalStore(MapRuntime.subscribe, MapRuntime.getState);

  const [centerRequestToken, setCenterRequestToken] = useState(0);
  // Тексты полей ввода инициализируются из сохранённого сеанса (MapSessionStore
  // всегда читает localStorage напрямую — getItem дешёв; и runtime при создании,
  // и экран здесь читают одну и ту же текущую запись), чтобы при возврате на
  // страницу строка поиска и радиус мастера выглядели как при уходе, без
  // мерцания «пусто → заполнено».
  const [searchQuery, setSearchQuery] = useState(() => MapSessionStore.load()?.searchQuery ?? '');
  const [locationNotice, setLocationNotice] = useState<'unavailable' | 'no-permission' | null>(null);
  const locationNoticeTimerRef = useRef<number | null>(null);
  const [searchRadiusKm, setSearchRadiusKm] = useState(() => {
    const session = MapSessionStore.load();
    if (session?.searchRadiusKm) return session.searchRadiusKm;
    return String((session?.sellerSearch.radiusMeters ?? DEFAULT_SELLER_SEARCH_RADIUS_METERS) / 1000);
  });
  // Зеркала полей ввода для persistSession (см. ниже): слушатели закрытия
  // страницы зарегистрированы один раз, а свежие значения читаются через refs,
  // а не через замыкание — иначе сохранялся бы текст первого рендера.
  const searchQueryRef = useRef(searchQuery);
  const searchRadiusKmRef = useRef(searchRadiusKm);
  // Защита от повторного нажатия геолокации (замечание №44): пока предыдущий
  // вызов navigator.geolocation в полёте, повторные нажатия «Моё местоположение»
  // игнорируются — иначе множественные разрешения и дублирующие события.
  const geolocationPendingRef = useRef(false);

  /** Показывает snackbar об ошибке геолокации (MAP-005 §4) и автоматически
   *  скрывает его через несколько секунд. Повторное нажатие кнопки
   *  перезапускает таймер скрытия. */
  const showLocationNotice = useCallback((kind: 'unavailable' | 'no-permission') => {
    setLocationNotice(kind);
    if (locationNoticeTimerRef.current !== null) window.clearTimeout(locationNoticeTimerRef.current);
    locationNoticeTimerRef.current = window.setTimeout(() => setLocationNotice(null), 4000);
  }, []);

  /** Геолокация с общей обработкой ошибок для кнопки «Моё местоположение» и
   *  выбора точки «Моё местоположение» в мастере «Поиск продавцов». Сам поток
   *  (проверка разрешения, вызов navigator.geolocation, обработка ошибок) — в
   *  GeoService#resolveUserLocation; здесь только сопоставление результата со
   *  snackbar. Возвращает координаты либо null (пользователь уже получил
   *  snackbar, положение карты не меняется). */
  const resolveLocationOrNotify = useCallback(async (): Promise<GeoPoint | null> => {
    if (geolocationPendingRef.current) return null;
    geolocationPendingRef.current = true;
    try {
      const resolution = await GeoService.resolveUserLocation();
      if (resolution.status !== 'ok') {
        showLocationNotice(resolution.status === 'no-permission' ? 'no-permission' : 'unavailable');
        return null;
      }
      return resolution.location;
    } finally {
      geolocationPendingRef.current = false;
    }
  }, [showLocationNotice]);

  useEffect(() => {
    dispatch({ type: 'MAP_LOADED' });
    // Начальная загрузка продавцов запускается из onVisibleBoundsChange —
    // он приходит от LeafletAdapter сразу при монтировании карты с реальными
    // границами (а не приближением через радиус, IMP-003.1.2 §3).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз при монтировании экрана
  }, []);

  // Актуализация копии истории просмотра в MapRuntime: запись могла появиться
  // на странице продавца, пока карта была размонтирована, — чтобы кнопка
  // «История» появилась сразу, а не только после открытия панели.
  useEffect(() => {
    MapRuntime.refreshSellerHistory();
  }, []);

  // Загрузка каталога категорий для выпадающего фильтра (MapRuntime хранит
  // их как источник для UI; singleton переживает уход/возврат на экран).
  useEffect(() => {
    MapRuntime.loadCategories();
  }, []);

  // Сброс таймера snackbar об ошибке геолокации при размонтировании экрана
  // (остальные таймеры/дебаунсы принадлежат MapRuntime).
  useEffect(
    () => () => {
      if (locationNoticeTimerRef.current !== null) window.clearTimeout(locationNoticeTimerRef.current);
    },
    [],
  );

  // ===== Сохранение/восстановление сеанса (MapSessionStore, localStorage) =====
  // Сохраняется ВСЁ состояние карты (NFR-002/NFR-003, ТЗ-005 §6): позиция и
  // масштаб, фильтр, тексты полей ввода, мастер «Поиск продавцов» и открытая
  // панель Bottom Sheet вместе с данными её карточки. Восстановление делает
  // MapRuntime при создании (withRestoredSession — позиция/фильтр/мастер/
  // панель) + инициализация полей ввода выше; здесь — только каналы записи и
  // перезапрос данных, которые намеренно не храним (см. ниже).

  // persistSession читает свежие значения через refs, поэтому его безопасно
  // вызывать из слушателей, зарегистрированных один раз.
  const persistSession = useCallback(() => {
    MapSessionStore.save(
      MapRuntime.toSessionSnapshot({
        searchQuery: searchQueryRef.current,
        searchRadiusKm: searchRadiusKmRef.current,
      }),
    );
  }, []);

  // ОСНОВНОЕ сохранение — в момент закрытия страницы/вкладки (pagehide
  // срабатывает даже при bfcache-навигации, beforeunload — страховка) и ухода
  // с экрана (SPA-переход, при котором pagehide не наступает, а вкладка потом
  // может быть закрыта). Загрузка сохранённой позиции происходит НЕ здесь: её
  // делает MapRuntime в начальном состоянии, чтобы карта сразу открывалась
  // там, где её оставили, без перелёта камеры.
  useEffect(() => {
    const persist = () => persistSession();
    window.addEventListener('pagehide', persist);
    window.addEventListener('beforeunload', persist);
    return () => {
      window.removeEventListener('pagehide', persist);
      window.removeEventListener('beforeunload', persist);
      persist();
    };
  }, [persistSession]);

  // Периодическое сохранение сеанса (best-effort): любое изменение состояния
  // runtime сохраняет снапшот не чаще раза в THROTTLE_SAVE_INTERVAL_MS — даже
  // если сохранение при закрытии страницы не успеет выполниться.
  useEffect(
    () =>
      MapRuntime.subscribe(() => {
        MapSessionStore.saveThrottled(
          MapRuntime.toSessionSnapshot({
            searchQuery: searchQueryRef.current,
            searchRadiusKm: searchRadiusKmRef.current,
          }),
        );
      }),
    [],
  );

  // Результаты мастера «Поиск продавцов» и видимую область намеренно не
  // храним (сырые данные устаревают): при восстановлении открытого шага
  // результатов перезапрашиваем их заново; видимая область грузится штатно из
  // onVisibleBoundsChange карты.
  useEffect(() => {
    const session = MapSessionStore.load();
    if (session?.bottomSheet?.type === 'sellerSearchResults' && session.sellerSearch.origin) {
      MapRuntime.requestSellerSearch();
    }
  }, []);

  const handleVisibleBoundsChange = useCallback((bounds: MapBounds) => {
    // §5/§13 (дедупликация почти не изменившихся границ) и MAP-011 (debounce)
    // живут в MapRuntime#requestVisibleSellers — здесь только проброс события.
    MapRuntime.requestVisibleSellers(bounds);
  }, []);

  const handleCameraChange = useCallback(
    (next: CameraParams, reason: CameraChangeReason) => {
      if (reason === 'zoom') {
        MapRuntime.dispatch({ type: 'ZOOM_MAP', zoom: next.zoom });
        dispatch({ type: 'ZOOM_MAP', payload: { zoom: next.zoom } });
      } else {
        MapRuntime.dispatch({ type: 'MOVE_MAP', center: next.center, zoom: next.zoom });
        dispatch({ type: 'MOVE_MAP', payload: next });
      }
      MapRuntime.requestAreaLabel(next.center);
    },
    [dispatch],
  );

  const handleSellerSelect = useCallback(
    (sellerId: SellerId) => {
      dispatch({ type: 'SELECT_SELLER', payload: { sellerId } });
      MapRuntime.dispatch({ type: 'SELECT_SELLER', sellerId });
    },
    [dispatch],
  );

  const handleUnselect = useCallback(() => {
    dispatch({ type: 'UNSELECT_SELLER' });
    MapRuntime.dispatch({ type: 'UNSELECT_SELLER' });
  }, [dispatch]);

  const handleCenterOnUser = useCallback(async () => {
    dispatch({ type: 'CENTER_ON_USER' });
    const location = await resolveLocationOrNotify();
    if (!location) return;
    MapRuntime.dispatch({ type: 'CENTER_ON_USER_SUCCESS', location });
    setCenterRequestToken((t) => t + 1);
    MapRuntime.requestAreaLabel(location);
  }, [dispatch, resolveLocationOrNotify]);

  const handleOpenSellerList = useCallback(() => dispatch({ type: 'OPEN_SELLER_LIST' }), [dispatch]);
  const handleOpenCatalog = useCallback(() => dispatch({ type: 'OPEN_CATALOG' }), [dispatch]);

  /** «История просмотра»: открывает панель с последними просмотренными
   *  продавцами (окно по образцу мастера «Поиск продавцов»). Список всегда
   *  перечитывается из SellerHistoryStore — запись могла появиться на странице
   *  продавца. */
  const handleOpenSellerHistory = useCallback(() => {
    MapRuntime.openSellerHistory();
  }, []);

  /** «Поиск продавцов» (MAP-053/MAP-018). Открывает мастер: выбор точки —
   *  «Моё местоположение» (геолокация с той же обработкой ошибок, что у
   *  кнопки «Моё местоположение») или «Положение на карте» (центр текущего
   *  просмотра), затем ввод радиуса и результаты, отсортированные по
   *  расстоянию. Состояние шага/точки/радиуса/результатов живёт в MapRuntime
   *  (reducer-кейсы SELLER_SEARCH_*), поиск запускается MapRuntime#requestSellerSearch. */
  const handleOpenSellerSearch = useCallback(() => {
    // Поле радиуса показывает последний использованный радиус (в т.ч.
    // восстановленный из сеанса), а не сбрасывается к дефолту: reducer
    // SELLER_SEARCH_OPEN радиус сохраняет.
    const radiusKm = String(MapRuntime.getState().sellerSearch.radiusMeters / 1000);
    setSearchRadiusKm(radiusKm);
    searchRadiusKmRef.current = radiusKm;
    MapRuntime.dispatch({ type: 'SELLER_SEARCH_OPEN' });
  }, []);

  /** Шаг «Выбрать точку» → «Моё местоположение»: запрос геолокации с общей
   *  обработкой ошибок; при успехе свежая позиция становится «Моё
   *  местоположение» (📍 центрируется на неё) и сразу запускается поиск. */
  const handleSearchOriginMyLocation = useCallback(async () => {
    const location = await resolveLocationOrNotify();
    if (!location) return;
    MapRuntime.dispatch({ type: 'CENTER_ON_USER_SUCCESS', location });
    setCenterRequestToken((t) => t + 1);
    MapRuntime.requestAreaLabel(location);
    MapRuntime.dispatch({ type: 'SELLER_SEARCH_ORIGIN_PICKED', origin: location, label: 'Моё местоположение' });
    MapRuntime.requestSellerSearch();
  }, [resolveLocationOrNotify]);

  /** Шаг «Выбрать точку» → «Положение на карте»: точка = центр текущего
   *  просмотра (карта при этом не двигается). */
  const handleSearchOriginMapCenter = useCallback(() => {
    MapRuntime.dispatch({
      type: 'SELLER_SEARCH_ORIGIN_PICKED',
      origin: MapRuntime.getState().mapCenter,
      label: 'Положение на карте',
    });
    MapRuntime.requestSellerSearch();
  }, []);

  /** Ввод радиуса в окне результатов: значение сразу применяется к текущим
   *  результатам (SELLER_SEARCH_RADIUS_CHANGED), а перезапрос к Repository
   *  дебаунсится в MapRuntime#scheduleSellerSearch — на каждый символ сеть
   *  не дёргаем. */
  const handleSearchRadiusInput = useCallback((value: string) => {
    setSearchRadiusKm(value);
    searchRadiusKmRef.current = value;
    const radiusMeters = parseRadiusKmToMeters(value);
    if (!radiusMeters) return;
    MapRuntime.scheduleSellerSearch(radiusMeters);
  }, []);

  /** «Назад» из окна результатов: возврат к выбору точки (введённый радиус
   *  сохраняется) и отмена отложенного перезапроса. */
  const handleSearchBack = useCallback(() => {
    MapRuntime.cancelPendingSellerSearch();
    MapRuntime.dispatch({ type: 'SELLER_SEARCH_BACK' });
  }, []);

  /** Выбор строки в окне Bottom Sheet (и «Ваша область», и результаты
   *  поиска продавцов): центрирование на продавца + открытие его карточки
   *  (как при выборе маркера на карте). Продавец ищется и в результатах
   *  поиска, и в видимой области — строки могут прийти из любой секции. */
  const handleSelectListSeller = useCallback(
    (sellerId: SellerId) => {
      const target =
        mapState.sellerSearch.results.find((s) => s.sellerId === sellerId) ??
        mapState.visibleSellers.find((s) => s.sellerId === sellerId) ??
        null;
      if (!target) return;
      MapRuntime.dispatch({ type: 'MOVE_MAP', center: target.location, zoom: ZOOM_ON_SELLER });
      MapRuntime.dispatch({ type: 'SELECT_SELLER', sellerId });
      dispatch({ type: 'SELECT_SELLER', payload: { sellerId } });
      setCenterRequestToken((t) => t + 1);
    },
    [mapState.sellerSearch, mapState.visibleSellers, dispatch],
  );

  const handleFilterChange = useCallback(
    (groupId: string, optionIds: string[]) => MapRuntime.dispatch({ type: 'SET_FILTER_OPTIONS', groupId, optionIds }),
    [],
  );

  /** Открытие страницы продавца (навигация через общий GreenMarketRuntime).
   *  sellerId из action payload строки (например, истории просмотра) приоритетнее
   *  выбранного на карте продавца — строка истории может вести на продавца,
   *  которого нет в видимой области. */
  const handleOpenSellerCard = useCallback(
    (sellerId?: SellerId) => {
      const target = sellerId ?? mapState.selectedSellerId;
      if (!target) return;
      Diagnostics.track('map.open_seller_card', { sellerId: target });
      dispatch({ type: 'OPEN_SELLER', payload: { sellerId: target } });
    },
    [dispatch, mapState.selectedSellerId],
  );

  /** Действия из блоков Bottom Sheet (карточка продавца / окно с секциями
   *  «Ваша область» и «Ближайшие» / мастер «Поиск продавцов»): "Открыть
   *  продавца" из карточки, "выбрать продавца" из любой секции списка и
   *  выбор точки поиска (геолокация или центр экрана). */
  const handleBlockAction = useCallback(
    (action: Action) => {
      switch (action.type) {
        case 'OPEN_SELLER':
          handleOpenSellerCard(action.payload.sellerId);
          break;
        case 'SELECT_SELLER':
          handleSelectListSeller(action.payload.sellerId);
          break;
        case 'SEARCH_ORIGIN_MY_LOCATION':
          void handleSearchOriginMyLocation();
          break;
        case 'SEARCH_ORIGIN_MAP_CENTER':
          handleSearchOriginMapCenter();
          break;
      }
    },
    [handleOpenSellerCard, handleSelectListSeller, handleSearchOriginMyLocation, handleSearchOriginMapCenter],
  );

  /** Изменение текста строки поиска: локальное состояние поля + запрос
   *  подсказок в MapRuntime (с дебаунсом и защитой от гонок, MAP-019). В
   *  режиме «по товару» запрашиваются подсказки названий товаров (или сразу
   *  продавцы при «Возможно вы имели в виду»). */
  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    searchQueryRef.current = value;
    if (MapRuntime.getState().productSearch.mode === 'product') {
      MapRuntime.requestProductSuggestions(value);
    } else {
      MapRuntime.requestSearchSuggestions(value);
    }
  }, []);

  /** Переключатель режима строки поиска («по названию» ↔ «по товару»).
   *  Сбрасывает обе группы подсказок — ответы прежнего режима не показываются. */
  const handleSearchModeChange = useCallback((mode: 'name' | 'product') => {
    MapRuntime.setSearchMode(mode);
  }, []);

  /** Выбор названия товара из автодополнения (поиск по товару): подстановка
   *  полного названия в поле, подсказки заменяются продавцами с ценой. */
  const handleProductNameSelect = useCallback((name: string) => {
    setSearchQuery(name);
    searchQueryRef.current = name;
    MapRuntime.requestProductSellers(name);
  }, []);

  /** Выбор продавца из товарных подсказок: центрирование карты и открытие
   *  карточки (как выбор из обычного дропдауна). Текст в поле не заменяется —
   *  там остаётся название товара. */
  const handleProductSellerSelect = useCallback(
    (match: ProductSellerMatch) => {
      MapRuntime.clearProductSearch();
      MapRuntime.dispatch({ type: 'MOVE_MAP', center: match.seller.location, zoom: ZOOM_ON_SELLER });
      MapRuntime.dispatch({ type: 'SELECT_SELLER', sellerId: match.seller.sellerId });
      dispatch({ type: 'SELECT_SELLER', payload: { sellerId: match.seller.sellerId } });
      setCenterRequestToken((t) => t + 1);
    },
    [dispatch],
  );

  /** Выбор продавца из дропдауна автодополнения «по названию» (MAP-019):
   *  центрирование карты, открытие Bottom Sheet и подстановка полного названия
   *  в поле поиска (подсказки сбрасываются, дропдаун закрывается). */
  const handleSearchSuggestionSelect = useCallback(
    (seller: SellerMapRecord) => {
      setSearchQuery(seller.name);
      searchQueryRef.current = seller.name;
      MapRuntime.clearSearchSuggestions();
      MapRuntime.dispatch({ type: 'MOVE_MAP', center: seller.location, zoom: ZOOM_ON_SELLER });
      MapRuntime.dispatch({ type: 'SELECT_SELLER', sellerId: seller.sellerId });
      dispatch({ type: 'SELECT_SELLER', payload: { sellerId: seller.sellerId } });
      setCenterRequestToken((t) => t + 1);
    },
    [dispatch],
  );

  /** Сабмит строки поиска (Enter без подсвеченной подсказки, MAP-053). По
   *  режиму: по названию — первое совпадение центрирует карту и открывает
   *  Bottom Sheet; по товару — подсказки заменяются продавцами с ценой
   *  (прямые совпадения или «Возможно вы имели в виду»). */
  const handleSearchSubmit = useCallback(
    async (rawQuery: string) => {
      const query = rawQuery.trim();
      if (!query) return;
      if (MapRuntime.getState().productSearch.mode === 'product') {
        MapRuntime.requestProductSellers(query);
        return;
      }
      const found = await MapRuntime.searchSellerByName(query);
      if (found) {
        // §6: центрирование карты + автоматическое открытие Bottom Sheet.
        MapRuntime.dispatch({ type: 'MOVE_MAP', center: found.location, zoom: ZOOM_ON_SELLER });
        MapRuntime.dispatch({ type: 'SELECT_SELLER', sellerId: found.sellerId });
        dispatch({ type: 'SELECT_SELLER', payload: { sellerId: found.sellerId } });
        setCenterRequestToken((t) => t + 1);
      }
    },
    [dispatch],
  );

  const camera: CameraParams = useMemo(
    () => ({ center: mapState.mapCenter, zoom: mapState.zoom }),
    [mapState.mapCenter, mapState.zoom],
  );

  const viewModel: MapViewModel = useMemo(
    () => ({
      state: mapState.error ? 'error' : mapState.loading ? 'loading' : mapState.visibleSellers.length === 0 ? 'empty' : 'success',
      sellers: mapState.visibleSellers,
      searchResult: mapState.searchResult,
      selectedSellerId: mapState.selectedSellerId,
      userLocation: mapState.userLocation,
      camera,
      bottomSheet: mapState.bottomSheet,
      sellerSearch: mapState.sellerSearch,
      searchSuggestions: mapState.searchSuggestions,
      productSearch: mapState.productSearch,
      sellerHistory: mapState.sellerHistory,
      currentAreaLabel: mapState.currentAreaLabel,
    }),
    [mapState, camera],
  );

  const bottomSheetBlocks = useMemo(() => MapBuilder.build(viewModel), [viewModel]);

  return (
    <div data-testid="map-screen" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header>
        <Row gap="md" align="center" justify="between" style={{ position: 'relative', width: '100%' }}>
          <Text variant="title" as="span">
            🌿 GreenMarket
          </Text>
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 360 }}>
            <MapSearchAutocomplete
              query={searchQuery}
              searchMode={mapState.productSearch.mode}
              suggestionsState={mapState.searchSuggestions}
              productSearch={mapState.productSearch}
              onQueryChange={handleSearchQueryChange}
              onModeChange={handleSearchModeChange}
              onSelect={handleSearchSuggestionSelect}
              onProductNameSelect={handleProductNameSelect}
              onProductSellerSelect={handleProductSellerSelect}
              onSubmit={(query) => void handleSearchSubmit(query)}
            />
          </div>
          <Row gap="sm">
            <SellerFilter
              categories={mapState.categories}
              selectedFilters={mapState.selectedFilters}
              onChange={handleFilterChange}
            />
            <IconButton label="Список продавцов" onClick={handleOpenSellerList}>
              <Icon label="Список">📋</Icon>
            </IconButton>
          </Row>
        </Row>
      </Header>

      {mapState.currentAreaLabel && (
        <div data-testid="current-area-label" style={{ padding: 'var(--space-xs) var(--space-lg)' }}>
          <Text variant="caption" tone="secondary">
            📍 {mapState.currentAreaLabel}
          </Text>
        </div>
      )}

      <Content style={{ position: 'relative', flex: 1, padding: 0 }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <MapAdapter
            sellers={mapState.visibleSellers}
            selectedSellerId={mapState.selectedSellerId}
            userLocation={mapState.userLocation}
            camera={camera}
            onMapLoaded={() => dispatch({ type: 'MAP_LOADED' })}
            onCameraChange={handleCameraChange}
            onVisibleBoundsChange={handleVisibleBoundsChange}
            onSellerSelect={handleSellerSelect}
            onMapBackgroundClick={handleUnselect}
            centerRequestToken={centerRequestToken}
          />
        </div>

        {/* Плавающая панель действий: белая поверхность, чтобы иконки не
            сливались с картой; кнопки равноудалены (gap = --space-sm). */}
        <div className="gm-map-fab-panel">
          <MapFabButton label="Открыть каталог" icon="🛒" onClick={handleOpenCatalog} testId="open-catalog" />
          <MapFabButton label="Поиск продавцов" icon="🧭" onClick={handleOpenSellerSearch} testId="open-seller-search" />
          {mapState.sellerHistory.length > 0 && (
            <MapFabButton label="История" icon="🕘" onClick={handleOpenSellerHistory} testId="open-seller-history" />
          )}
          <MapFabButton label="Моё местоположение" icon="📍" onClick={() => void handleCenterOnUser()} />
        </div>
      </Content>

      {/* Bottom Sheet открыт и для карточки продавца, и для окон мастера
          «Поиск продавцов» — всё живёт в MapRuntime.bottomSheet. Шаги мастера
          рендерят собственный заголовок (и «назад» для результатов), ввод
          радиуса и единый фильтр продавцов; список строк строит MapBuilder. */}
      {mapState.bottomSheet !== 'hidden' && (
        <BottomSheetContainer
          onDismiss={handleUnselect}
          labelledBy="map-seller-sheet-title"
          data-testid="seller-bottom-sheet"
        >
          <BottomSheetSurface
            closeSlot={
              <IconButton label="Закрыть" onClick={handleUnselect} data-testid="close-bottom-sheet">
                <Icon label="Закрыть">✕</Icon>
              </IconButton>
            }
          >
            {mapState.bottomSheet === 'sellerSearchOrigin' ? (
              <Stack gap="sm">
                <Text variant="title" as="h2" id="map-seller-sheet-title">
                  Поиск продавцов
                </Text>
                <MapBottomSheetContent
                  blocks={bottomSheetBlocks}
                  onRetry={() => MapRuntime.retryVisibleSellers()}
                  onAction={handleBlockAction}
                />
              </Stack>
            ) : mapState.bottomSheet === 'sellerSearchResults' ? (
              <Stack gap="sm" className="gm-seller-search-results">
                {/* Управление (заголовок, радиус, фильтр) не скроллится и не
                    выталкивается длинным списком за экран — см. map.css. */}
                <div className="gm-seller-search-results__controls">
                  <Stack gap="sm">
                    <Row gap="sm" align="center" style={{ position: 'relative', width: '100%' }}>
                      <IconButton label="Назад" onClick={handleSearchBack} data-testid="seller-search-back">
                        <Icon label="Назад">←</Icon>
                      </IconButton>
                      <Text variant="title" as="h2" id="map-seller-sheet-title">
                        Поиск продавцов
                      </Text>
                    </Row>
                    <Stack gap="xs">
                      <label htmlFor="search-radius-input">
                        <Text variant="caption" tone="secondary">
                          Радиус поиска (км)
                        </Text>
                      </label>
                      <input
                        id="search-radius-input"
                        type="number"
                        inputMode="decimal"
                        min={0.5}
                        step={0.5}
                        value={searchRadiusKm}
                        onChange={(e) => handleSearchRadiusInput(e.target.value)}
                        data-testid="search-radius-input"
                        style={{
                          width: '100%',
                          height: 36,
                          borderRadius: 'var(--radius-full)',
                          border: '1px solid var(--color-border-default)',
                          padding: '0 var(--space-md)',
                          fontFamily: 'var(--font-family-body)',
                          fontSize: 'var(--font-size-sm)',
                          background: 'var(--color-surface-sunken)',
                          color: 'var(--color-text-primary)',
                        }}
                      />
                    </Stack>
                    <SellerFilter
                      categories={mapState.categories}
                      selectedFilters={mapState.selectedFilters}
                      onChange={handleFilterChange}
                    />
                  </Stack>
                </div>
                <div className="gm-seller-search-results__list">
                  <MapBottomSheetContent
                    blocks={bottomSheetBlocks}
                    onRetry={() => MapRuntime.requestSellerSearch()}
                    onAction={handleBlockAction}
                  />
                </div>
              </Stack>
            ) : mapState.bottomSheet === 'sellerHistory' ? (
              <Stack gap="sm" className="gm-seller-history">
                {/* Заголовок с «Назад» не скроллится и не выталкивается длинным
                    списком за экран — список скроллится в собственном блоке
                    (тот же паттерн, что у результатов поиска, MAP-053). */}
                <div className="gm-seller-history__header">
                  <Row gap="sm" align="center" style={{ position: 'relative', width: '100%' }}>
                    <IconButton label="Назад" onClick={handleUnselect} data-testid="seller-history-back">
                      <Icon label="Назад">←</Icon>
                    </IconButton>
                    <Text variant="title" as="h2" id="map-seller-sheet-title">
                      История просмотра
                    </Text>
                  </Row>
                </div>
                <div className="gm-seller-history__list">
                  <MapBottomSheetContent
                    blocks={bottomSheetBlocks}
                    onRetry={() => {}}
                    onAction={handleBlockAction}
                  />
                </div>
              </Stack>
            ) : (
              <MapBottomSheetContent
                blocks={bottomSheetBlocks}
                onRetry={() => MapRuntime.retryVisibleSellers()}
                onAction={handleBlockAction}
              />
            )}
          </BottomSheetSurface>
        </BottomSheetContainer>
      )}

      {locationNotice && (
        <SnackbarContainer>
          <Snackbar tone="error" data-testid="location-error-snackbar">
            {locationNotice === 'no-permission' ? 'Нет доступа к геолокации' : 'Не удалось определить местоположение'}
          </Snackbar>
        </SnackbarContainer>
      )}
    </div>
  );
}
