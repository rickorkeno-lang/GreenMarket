import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Content, Header, Row, Stack } from '@/layout';
import {
  Text,
  IconButton,
  Icon,
  Avatar,
  ListItem,
  Loader,
  EmptyState,
  ErrorState,
  Button,
} from '@/design-system/components';
import { useGreenMarketRuntime } from '@/platform-core/navigation-runtime-layer/hooks/useGreenMarketRuntime';
import '@/screens/map/map.css';
import { isAtRoot } from '@/platform-core/navigation-runtime-layer/navigation/NavigationStack';
import type { SellerMapRecord } from '@/platform-core/map/viewmodels/MapViewModel';
import { sellerRepository } from '@/platform-core/map/repository/repository';
import { MapRuntime } from '@/platform-core/map/runtime/MapRuntime';
import { applySellerFilters, buildSellerFilters } from '@/platform-core/map/filters/SellerFilters';
import type { ProductNameSuggestion, ProductSearchResult, ProductSellerMatch, SearchMode } from '@/platform-core/map/product-search/ProductSearch';
import { Diagnostics } from '@/platform-core/diagnostics/Diagnostics';
import { InitialsFormatter } from '@/platform-core/formatting/InitialsFormatter';
import { RatingFormatter } from '@/platform-core/formatting/RatingFormatter';
import { DistanceFormatter } from '@/platform-core/formatting/DistanceFormatter';
import { SellerFilter } from '@/screens/filter/SellerFilter';
import { useIsMobile } from '@/app/useIsMobile';

/**
 * Экран «Все продавцы» (переход Map → Seller List, AR-003). ТЗ-024 §10:
 * список — контент Bottom Sheet ПОВЕРХ карты (рендерится MapSurface как
 * оверлей над MapScreenView), а не отдельная страница: у него нет URL,
 * карта за ним не размонтируется. Та же схема, что у MapScreenView: данные
 * приходят из Repository (весь каталог, без геофильтра — список показывает
 * всех продавцов), навигационные действия идут через общий
 * GreenMarketRuntime, а доменное состояние карты — через MapRuntime
 * (singleton, см. platform-core/map/runtime/MapRuntime.ts).
 *
 *  Фильтры продавцов (категория + состояние) — ОБЩИЕ с картой: состояние
 *  живёт в MapRuntime (selectedFilters), здесь тот же SellerFilter, и смена
 *  фильтра в любом из двух экранов применяется в обоих. К списку применяется
 *  тот же applySellerFilters, что и к видимым на карте продавцам.
 *
 * Поиск — два режима, переключаемых надписью под полем при пустом тексте
 * (переключатель исчезает, как только в поле есть символ):
 *   - «по названию» — локальный поиск по каталогу через Repository с
 *     дебаунсом («ё» и «е» считаются одинаковыми);
 *   - «по товару» — подсказки названий товаров под полем (дописать название);
 *     выбор названия подставляет его в поле, и список заменяется продавцами
 *     с ценой на этот товар. Если прямых совпадений нет, но есть товар со
 *     схожестью >85%, система «Возможно вы имели в виду» сразу показывает
 *     его продавцов. Доменные функции — platform-core/map/product-search.
 *
 * Кнопка «назад» — хронология действий пользователя: она отматывает стек
 * панели (BACK) и возвращает к «Главному экрану» Main (за которым карта).
 *
 * Клик по продавцу — возврат на карту + центрирование + подсветка: карта
 * уже смонтирована за панелью, MOVE_MAP/SELECT_SELLER уходят в MapRuntime
 * до BACK, и она появляется с выбранным продавцом.
 */
type SellerListLoadState = 'loading' | 'error' | 'ready';

const ZOOM_ON_SELLER = 15;
const SEARCH_DEBOUNCE_MS = 350;

/** Порядок показа продавцов в списке: сначала открытые, затем пока ещё не
 *  открытые (но доступные), затем недоступные. Сортировка стабильная —
 *  внутри группы сохраняется порядок из каталога. */
function sellerStatusRank(seller: SellerMapRecord): number {
  if (!seller.isAvailable) return 3;
  return seller.isOpenNow ? 1 : 2;
}

export function SellerListScreenView() {
  const { state, dispatch } = useGreenMarketRuntime();
  const mapState = useSyncExternalStore(MapRuntime.subscribe, MapRuntime.getState);
  // Шапка списка на мобильных и десктопе структурно разная (поиск/фильтр в
  // разных местах), поэтому рендерим ту или иную разметку по брейкпоинту —
  // десктоп остаётся как был, фиксы наложений работают только на узких экранах.
  const isMobile = useIsMobile();
  const [loadState, setLoadState] = useState<SellerListLoadState>('loading');
  const [sellers, setSellers] = useState<SellerMapRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('name');
  const [searchResults, setSearchResults] = useState<SellerMapRecord[] | null>(null);
  /** Товарный поиск: подсказки названий товаров (дропдаун под полем) и
   *  результат — продавцы с ценой. null = фаза не активна. */
  const [productNames, setProductNames] = useState<ProductNameSuggestion[] | null>(null);
  const [productResults, setProductResults] = useState<ProductSearchResult | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  /** Защита от гонки поиска (тот же приём, что у продавцов на карте): каждый
   *  реально отправленный запрос увеличивает счётчик; ответ применяется, только
   *  если запрос всё ещё последний — поздний ответ более раннего запроса
   *  (например, «мор» завершился после «морк») не перетирает свежий. */
  const searchSeqRef = useRef(0);
  /** Признак программной подстановки названия товара в поле (выбор из
   *  автодополнения): эффект поиска должен пропустить этот ре-ран и не
   *  перезапускать автодополнение — иначе после клика по «Молоко» подсказка
   *  снова покажет «Молоко», а продавцы не появятся до второго клика. */
  const suppressProductAutocompleteRef = useRef(false);

  const loadSellers = useCallback(async () => {
    setLoadState('loading');
    try {
      const all = await sellerRepository.getAllSellers();
      setSellers(all);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void loadSellers();
  }, [loadSellers]);

  // Категории для фильтра. Если карта их ещё не загрузила (прямой вход на
  // список по ссылке) — грузим здесь; состояние общее с картой (MapRuntime).
  useEffect(() => {
    if (mapState.categories.length > 0) return;
    void sellerRepository.getCategories().then((cats) => {
      MapRuntime.dispatch({ type: 'CATEGORIES_LOADED', categories: cats });
    });
  }, [mapState.categories.length]);

  // Поиск с дебаунсом: на каждый символ перезапускаем таймер, в Repository
  // уходит один запрос после паузы ввода. seq-защита — на случай, если новый
  // запрос стартовал, пока предыдущий ещё в полёте (см. searchSeqRef).
  // Режим «по названию»: поиск продавцов по каталогу. Режим «по товару»:
  // автодополнение названий товаров, а при отсутствии прямых совпадений —
  // «Возможно вы имели в виду» (>85%) сразу даёт продавцов.
  useEffect(() => {
    if (suppressProductAutocompleteRef.current) {
      // Выбор названия товара уже запустил поиск продавцов в
      // handleProductNameSelect: не перезапускаем автодополнение и не
      // инвалидируем его запрос (иначе понадобился бы второй клик).
      suppressProductAutocompleteRef.current = false;
      return;
    }
    const q = searchQuery.trim();
    searchSeqRef.current += 1;
    setProductNames(null);

    if (searchMode === 'product') {
      setSearchResults(null);
      if (!q) {
        setProductResults(null);
        setProductLoading(false);
        return;
      }
      setProductLoading(true);
      const timer = window.setTimeout(() => {
        const seq = ++searchSeqRef.current;
        void sellerRepository.searchProductNames(q)
          .then((names) => {
            if (seq !== searchSeqRef.current) return;
            setProductLoading(false);
            if (names.length > 0) {
              setProductNames(names);
              setProductResults(null);
              return;
            }
            void sellerRepository.searchSellersByProduct(q).then((result) => {
              if (seq !== searchSeqRef.current) return;
              setProductResults(result);
            });
          });
      }, SEARCH_DEBOUNCE_MS);
      return () => window.clearTimeout(timer);
    }

    // Режим «по названию».
    setProductResults(null);
    setProductLoading(false);
    if (!q) {
      // Инкремент инвалидирует в полёте незавершённый запрос: поздний ответ
      // не вернёт результаты при очищенном поле поиска.
      setSearchResults(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const seq = ++searchSeqRef.current;
      void sellerRepository.searchSellers(q).then((results) => {
        if (seq === searchSeqRef.current) setSearchResults(results);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery, searchMode]);

  /** Выбор названия товара из автодополнения: подстановка полного названия в
   *  поле и замена подсказок продавцами с ценой на этот товар. Эффект поиска
   *  пропускает этот ре-ран через suppressProductAutocompleteRef. */
  const handleProductNameSelect = useCallback((name: string) => {
    suppressProductAutocompleteRef.current = true;
    setSearchQuery(name);
    const seq = ++searchSeqRef.current;
    setProductNames(null);
    setProductLoading(true);
    void sellerRepository.searchSellersByProduct(name).then((result) => {
      if (seq === searchSeqRef.current) {
        setProductResults(result);
        setProductLoading(false);
      }
    });
  }, []);

  /** Переключатель режима строки поиска («по названию» ↔ «по товару»). */
  const handleModeChange = useCallback((mode: SearchMode) => {
    setSearchMode(mode);
  }, []);

  // Базовый список по названию: каталог, либо результаты поиска. Тернарник
  // внутри useMemo — иначе в режиме «по товару» новый массив [] менял бы
  // зависимости каждый рендер.
  const visibleSellers = useMemo(
    () =>
      applySellerFilters(
        searchMode === 'product' ? [] : (searchResults ?? sellers),
        buildSellerFilters(mapState.categories),
        mapState.selectedFilters,
      ).sort((a, b) => sellerStatusRank(a) - sellerStatusRank(b)),
    [searchMode, searchResults, sellers, mapState.categories, mapState.selectedFilters],
  );

  // Товарный результат: те же общий фильтр и порядок по статусу, что у
  // названий, — «сортировать продавцов как обычно».
  const visibleProductMatches = useMemo(
    () => {
      if (!productResults) return [];
      const filtered = applySellerFilters(
        productResults.sellers.map((m) => m.seller),
        buildSellerFilters(mapState.categories),
        mapState.selectedFilters,
      );
      const ids = new Set(filtered.map((s) => s.sellerId));
      return productResults.sellers.filter((m) => ids.has(m.seller.sellerId)).sort(
        (a, b) => sellerStatusRank(a.seller) - sellerStatusRank(b.seller),
      );
    },
    [productResults, mapState.categories, mapState.selectedFilters],
  );

  const atRoot = isAtRoot(state.navigation);

  const handleBack = useCallback(() => {
    dispatch({ type: 'BACK' });
  }, [dispatch]);

  const handleFilterChange = useCallback(
    (groupId: string, optionIds: string[]) => MapRuntime.dispatch({ type: 'SET_FILTER_OPTIONS', groupId, optionIds }),
    [],
  );

  /** Показать продавца на карте. ТЗ-024 §10: карта — корневая поверхность,
   *  она уже смонтирована ЗА панелью (список открыт из «Главного экрана»
   *  Main), поэтому выбор продавца просто закрывает панель (BACK) — страница
   *  карты не открывается, MOVE_MAP/SELECT_SELLER уходят в MapRuntime до
   *  перехода, и карта появляется уже с выбранным продавцом. */
  const handleSelectSeller = useCallback(
    (seller: SellerMapRecord) => {
      if (!seller.location) return;
      MapRuntime.dispatch({ type: 'MOVE_MAP', center: seller.location, zoom: ZOOM_ON_SELLER });
      MapRuntime.dispatch({ type: 'SELECT_SELLER', sellerId: seller.sellerId });
      Diagnostics.track('seller_list.show_on_map', { sellerId: seller.sellerId });
      dispatch({ type: 'BACK' });
    },
    [dispatch],
  );

  const isSearchActive = searchQuery.trim().length > 0;
  const isProductMode = searchMode === 'product';
  // Переключатель режима — «надпись-кнопка» под полем: виден только пока поле
  // в фокусе и пустое; при вводе символа и при уходе из инпута исчезает.
  const showModeSwitch = searchFocused && !isSearchActive;
  const switchLabel = isProductMode ? 'Искать по названию' : 'Искать по товару';

  // Фильтр и форма поиска используются в обеих ветках шапки (мобильная и
  // десктопная), но в разных местах: вынесены в константы, чтобы разметка
  // не дублировалась.
  const filterControl = (
    <SellerFilter
      categories={mapState.categories}
      selectedFilters={mapState.selectedFilters}
      onChange={handleFilterChange}
    />
  );

  const searchForm = (
    <form onSubmit={(e) => e.preventDefault()} role="search">
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        placeholder={isProductMode ? 'Найти продавца по товару' : 'Найти продавца'}
        aria-label={isProductMode ? 'Найти продавца по товару' : 'Поиск продавца'}
        data-testid="seller-list-search"
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
      {showModeSwitch && (
        <button
          type="button"
          className="gm-map-search__mode-switch gm-focusable"
          data-testid="seller-list-search-mode-switch"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleModeChange(isProductMode ? 'name' : 'product')}
        >
          {switchLabel}
        </button>
      )}
      {isProductMode && productNames && productNames.length > 0 && (
        <div className="gm-map-search__dropdown" role="listbox" data-testid="seller-list-product-suggestions">
          {productNames.map((p) => (
            <button
              key={`product-${p.name}`}
              type="button"
              role="option"
              className="gm-map-search__suggestion gm-focusable"
              onClick={() => handleProductNameSelect(p.name)}
            >
              <span className="gm-map-search__suggestion-icon" aria-hidden="true">
                {p.emoji}
              </span>
              <span className="gm-map-search__suggestion-body">
                <span className="gm-map-search__suggestion-name">{p.name}</span>
                {p.sellerCount > 0 && (
                  <span className="gm-map-search__suggestion-meta">
                    у {p.sellerCount} продавцов · от {p.minPrice} ₽
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </form>
  );

  return (
    <div data-testid="seller-list-screen" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Десктопная шапка (как было до мобильной вёрстки): «назад» и заголовок
          слева, поиск по центру (absolute, max-width 360), фильтр и счётчик
          «N продавцов» — справа. Штатная высота панели (56px). */}
      {!isMobile && (
        <Header>
          <Row gap="md" align="center" justify="between" style={{ position: 'relative', width: '100%' }}>
            <Row gap="sm" align="center">
              {!atRoot && (
                <IconButton label="Назад" onClick={handleBack} data-testid="seller-list-back">
                  <Icon label="Назад">←</Icon>
                </IconButton>
              )}
              <Text variant="title" as="span">
                Все продавцы
              </Text>
            </Row>
            <div
              className="gm-seller-list-search"
              style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 360 }}
            >
              {searchForm}
            </div>
            <Row gap="sm" align="center">
              {filterControl}
              {loadState === 'ready' && (
                <Text variant="caption" tone="secondary" data-testid="seller-list-count">
                  {(isProductMode ? visibleProductMatches.length : visibleSellers.length)} продавцов
                </Text>
              )}
            </Row>
          </Row>
        </Header>
      )}

      {/* Мобильная шапка — вертикальная панель из трёх строк: строка 1 —
          заголовок слева и количество продавцов справа, строка 2 — фильтр по
          центру, строка 3 — поиск на всю ширину. Высота панели авто (не 56px),
          чтобы строки не накладывались друг на друга. */}
      {isMobile && (
        <Header className="gm-seller-list-header" style={{ height: 'auto' }}>
          <Stack gap="sm" style={{ width: '100%', padding: 'var(--space-md) 0' }}>
            <Row gap="sm" align="center" justify="between" style={{ width: '100%' }}>
              <Row gap="sm" align="center">
                {!atRoot && (
                  <IconButton label="Назад" onClick={handleBack} data-testid="seller-list-back">
                    <Icon label="Назад">←</Icon>
                  </IconButton>
                )}
                <Text variant="title" as="span">
                  Все продавцы
                </Text>
              </Row>
              {loadState === 'ready' && (
                <Text variant="caption" tone="secondary" data-testid="seller-list-count">
                  {(isProductMode ? visibleProductMatches.length : visibleSellers.length)} продавцов
                </Text>
              )}
            </Row>

            <Row justify="center" style={{ width: '100%' }}>
              {filterControl}
            </Row>

            <div className="gm-seller-list-search">
              {searchForm}
            </div>
          </Stack>
        </Header>
      )}

      <Content style={{ overflowY: 'auto' }}>
        {loadState === 'loading' && (
          <Stack gap="lg" align="center" style={{ padding: 'var(--space-xxl) 0' }} data-testid="seller-list-loading">
            <Loader />
            <Text tone="secondary">Загружаем продавцов…</Text>
          </Stack>
        )}

        {loadState === 'error' && (
          <Stack gap="lg" style={{ padding: 'var(--space-xxl) 0' }}>
            <ErrorState
              title="Не удалось загрузить список продавцов"
              description="Проверьте соединение и попробуйте ещё раз."
              action={
                <Button variant="secondary" onClick={() => void loadSellers()}>
                  Повторить
                </Button>
              }
            />
          </Stack>
        )}

        {loadState === 'ready' && isProductMode && (
          <Stack gap="lg" style={{ padding: 'var(--space-xxl) 0' }}>
            {productLoading && (
              <Stack gap="lg" align="center" style={{ padding: 'var(--space-xxl) 0' }} data-testid="seller-list-product-loading">
                <Loader />
                <Text tone="secondary">Ищем товар…</Text>
              </Stack>
            )}

            {!productLoading && !productNames && productResults && productResults.suggestedProduct && (
              <div className="gm-map-search__did-you-mean" data-testid="seller-list-did-you-mean">
                Возможно вы имели в виду: «{productResults.suggestedProduct}»
              </div>
            )}

            {!productLoading && !productNames && productResults && productResults.sellers.length > 0 && (
              <Stack gap="none">
                {visibleProductMatches.map((match) => (
                  <ProductMatchRow key={match.seller.sellerId} match={match} onSelect={handleSelectSeller} />
                ))}
              </Stack>
            )}

            {!productLoading && !productNames && !productResults && (
              <EmptyState
                title="Введите название товара"
                description="Например: молоко, томаты, мёд. Поиск покажет продавцов и цены."
                data-testid="seller-list-product-idle"
              />
            )}

            {!productLoading && !productNames && productResults && productResults.sellers.length === 0 && (
              <EmptyState
                title="Ничего не найдено"
                description={
                  productResults.suggestedProduct
                    ? `По запросу «${searchQuery.trim()}» ничего не нашлось.`
                    : `По запросу «${searchQuery.trim()}» продавцы с этим товаром не найдены.`
                }
                data-testid="seller-list-product-empty"
              />
            )}
          </Stack>
        )}

        {loadState === 'ready' && !isProductMode && visibleSellers.length === 0 && (
          <Stack gap="lg" style={{ padding: 'var(--space-xxl) 0' }}>
            {isSearchActive ? (
              <Stack gap="lg" style={{ padding: 'var(--space-xxl) 0' }} data-testid="seller-list-empty-search">
                <EmptyState
                  title="Ничего не найдено"
                  description={`По запросу «${searchQuery.trim()}» продавцы не найдены. Попробуйте изменить запрос.`}
                />
              </Stack>
            ) : (
              <EmptyState title="Продавцы не найдены" description="Пока в каталоге нет ни одного продавца." />
            )}
          </Stack>
        )}

        {loadState === 'ready' && !isProductMode && visibleSellers.length > 0 && (
          <Stack gap="none">
            {visibleSellers.map((seller) => (
              <ListItem
                key={seller.sellerId}
                leading={<Avatar initials={InitialsFormatter.format(seller.name)} alt={`${seller.name}: аватар`} />}
                onClick={() => handleSelectSeller(seller)}
                data-testid={`seller-list-row-${seller.sellerId}`}
                trailing={
                  <Stack gap="xs" align="end">
                    <Text variant="bodyStrong">
                      {seller.rating != null ? RatingFormatter.format({ value: seller.rating }) : '—'}
                    </Text>
                    <Text variant="caption" tone="secondary">
                      {seller.distanceMeters != null
                        ? DistanceFormatter.format({ meters: seller.distanceMeters })
                        : '—'}
                    </Text>
                  </Stack>
                }
              >
                <Stack gap="xs">
                  <Text variant="bodyStrong">{seller.name}</Text>
                  <Text variant="caption" tone="secondary">
                    {seller.categoryNames.join(' · ')}
                  </Text>
                  <Text variant="caption" tone="secondary">
                    {seller.isAvailable == null
                      ? 'Статус не указан'
                      : seller.isAvailable
                        ? (
                            <>
                              {seller.isOpenNow ? '🟢 ' : '🔴 '}
                              {seller.workingHoursLabel}
                            </>
                          )
                        : '🔴 Недоступен'}
                  </Text>
                </Stack>
              </ListItem>
            ))}
          </Stack>
        )}
      </Content>
    </div>
  );
}

/** Строка товарного результата: продавец + цена на искомый товар. Клик — как у
 *  остальных строк: показать продавца на карте. */
function ProductMatchRow({
  match,
  onSelect,
}: {
  match: ProductSellerMatch;
  onSelect: (seller: SellerMapRecord) => void;
}) {
  return (
    <ListItem
      data-testid={`seller-list-product-row-${match.seller.sellerId}`}
      leading={<Avatar initials={InitialsFormatter.format(match.seller.name)} alt={`${match.seller.name}: аватар`} />}
      onClick={() => onSelect(match.seller)}
      trailing={
        <Stack gap="xs" align="end">
          <Text variant="bodyStrong">{match.price} ₽</Text>
          <Text variant="caption" tone="secondary">
            {match.unit}
          </Text>
        </Stack>
      }
    >
      <Stack gap="xs">
        <Text variant="bodyStrong">{match.seller.name}</Text>
        <Text variant="caption" tone="secondary">
          {match.productName} · {match.seller.categoryNames.join(' · ')}
        </Text>
        <Text variant="caption" tone="secondary">
          {match.seller.isAvailable == null
            ? 'Статус не указан'
            : match.seller.isAvailable
              ? (
                  <>
                    {match.seller.isOpenNow ? '🟢 ' : '🔴 '}
                    {match.seller.workingHoursLabel}
                  </>
                )
              : '🔴 Недоступен'}
        </Text>
      </Stack>
    </ListItem>
  );
}
