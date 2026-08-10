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
import { isAtRoot } from '@/platform-core/navigation-runtime-layer/navigation/NavigationStack';
import type { SellerMapRecord } from '@/platform-core/map/viewmodels/MapViewModel';
import { MockSellerRepository } from '@/platform-core/map/repository/MockSellerRepository';
import { MapRuntime } from '@/platform-core/map/runtime/MapRuntime';
import { applySellerFilters, buildSellerFilters } from '@/platform-core/map/filters/SellerFilters';
import { Diagnostics } from '@/platform-core/diagnostics/Diagnostics';
import { InitialsFormatter } from '@/platform-core/formatting/InitialsFormatter';
import { RatingFormatter } from '@/platform-core/formatting/RatingFormatter';
import { DistanceFormatter } from '@/platform-core/formatting/DistanceFormatter';
import { SellerFilter } from '@/screens/filter/SellerFilter';

/**
 * Экран «Список продавцов» (переход Map → Seller List, AR-003). Та же схема,
 * что у MapScreenView: данные приходят из Repository (весь каталог, без
 * геофильтра — список показывает всех продавцов), навигационные действия
 * идут через общий GreenMarketRuntime, а доменное состояние карты — через
 * MapRuntime (singleton, см. platform-core/map/runtime/MapRuntime.ts).
 *
 *  Фильтры продавцов (категория + состояние) — ОБЩИЕ с картой: состояние
 *  живёт в MapRuntime (selectedFilters), здесь тот же SellerFilter, и смена
 *  фильтра в любом из двух экранов применяется в обоих. К списку применяется
 *  тот же applySellerFilters, что и к видимым на карте продавцам.
 *
 * Поиск по названию — локальный для списка (в отличие от карты, где поиск
 * центрирует карту): фильтрует каталог по названию через Repository с
 * дебаунсом, чтобы не дёргать его на каждый символ; «ё» и «е» считаются
 * одинаковыми (нормализация в Repository).
 *
 * Кнопка «назад» — хронология действий пользователя: она отматывает стек
 * навигации (BACK) и скрывается, когда история пуста (прямой вход по
 * ссылке — в этом случае стек сброшен ровно в один экран, isAtRoot).
 *
 * Клик по продавцу — вариант Б: возврат на карту + центрирование +
 * подсветка. Карта сама восстанавливает состояние из MapRuntime при
 * монтировании, поэтому MOVE_MAP/SELECT_SELLER отправляются до перехода.
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
  const [loadState, setLoadState] = useState<SellerListLoadState>('loading');
  const [sellers, setSellers] = useState<SellerMapRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SellerMapRecord[] | null>(null);
  /** Защита от гонки поиска (тот же приём, что у продавцов на карте): каждый
   *  реально отправленный запрос увеличивает счётчик; ответ применяется, только
   *  если запрос всё ещё последний — поздний ответ более раннего запроса
   *  (например, «мор» завершился после «морк») не перетирает свежий. */
  const searchSeqRef = useRef(0);

  const loadSellers = useCallback(async () => {
    setLoadState('loading');
    try {
      const all = await MockSellerRepository.getAllSellers();
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
    void MockSellerRepository.getCategories().then((cats) => {
      MapRuntime.dispatch({ type: 'CATEGORIES_LOADED', categories: cats });
    });
  }, [mapState.categories.length]);

  // Поиск по названию с дебаунсом: на каждый символ перезапускаем таймер,
  // в Repository уходит один запрос после паузы ввода. seq-защита — на случай,
  // если новый запрос стартовал, пока предыдущий ещё в полёте (см. searchSeqRef).
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      // Инкремент инвалидирует в полёте незавершённый запрос: поздний ответ
      // не вернёт результаты при очищенном поле поиска.
      searchSeqRef.current += 1;
      setSearchResults(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const seq = ++searchSeqRef.current;
      void MockSellerRepository.searchSellers(q).then((results) => {
        if (seq === searchSeqRef.current) setSearchResults(results);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Базовый список: каталог, либо результаты поиска по названию.
  const baseSellers = searchResults ?? sellers;

  // Общий с картой фильтр (категория + состояние) поверх базы + порядок по
  // статусу.
  const visibleSellers = useMemo(
    () =>
      applySellerFilters(baseSellers, buildSellerFilters(mapState.categories), mapState.selectedFilters).sort((a, b) =>
        sellerStatusRank(a) - sellerStatusRank(b),
      ),
    [baseSellers, mapState.categories, mapState.selectedFilters],
  );

  const atRoot = isAtRoot(state.navigation);

  const handleBack = useCallback(() => {
    dispatch({ type: 'BACK' });
  }, [dispatch]);

  const handleFilterChange = useCallback(
    (groupId: string, optionIds: string[]) => MapRuntime.dispatch({ type: 'SET_FILTER_OPTIONS', groupId, optionIds }),
    [],
  );

  /** Вариант Б: показать продавца на карте. Карта под списком (или свежая,
   *  если списка достигли по прямой ссылке) монтируется уже с центрированным
   *  положением и выбранным продавцом — MapRuntime помнит состояние. */
  const handleSelectSeller = useCallback(
    (seller: SellerMapRecord) => {
      MapRuntime.dispatch({ type: 'MOVE_MAP', center: seller.location, zoom: ZOOM_ON_SELLER });
      MapRuntime.dispatch({ type: 'SELECT_SELLER', sellerId: seller.sellerId });
      Diagnostics.track('seller_list.show_on_map', { sellerId: seller.sellerId });

      const hasMapInHistory = state.navigation.stack.some((entry) => entry.screen === 'Map');
      if (hasMapInHistory) {
        dispatch({ type: 'BACK' });
      } else {
        dispatch({ type: 'OPEN_MAP' });
      }
    },
    [state.navigation.stack, dispatch],
  );

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <div data-testid="seller-list-screen" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header>
        <Row gap="md" align="center" justify="between" style={{ position: 'relative', width: '100%' }}>
          <Row gap="sm" align="center">
            {!atRoot && (
              <IconButton label="Назад" onClick={handleBack} data-testid="seller-list-back">
                <Icon label="Назад">←</Icon>
              </IconButton>
            )}
            <Text variant="title" as="span">
              Список продавцов
            </Text>
          </Row>
          <form
            onSubmit={(e) => e.preventDefault()}
            style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 360 }}
          >
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Найти продавца"
              aria-label="Поиск продавца"
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
          </form>
          <Row gap="sm" align="center">
            <SellerFilter
              categories={mapState.categories}
              selectedFilters={mapState.selectedFilters}
              onChange={handleFilterChange}
            />
            {loadState === 'ready' && (
              <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                <Text variant="caption" tone="secondary" data-testid="seller-list-count">
                  {visibleSellers.length} продавцов
                </Text>
                <Text variant="caption" tone="secondary" as="div" data-testid="seller-list-hint">
                  все продавцы, не только видимые на карте
                </Text>
              </span>
            )}
          </Row>
        </Row>
      </Header>

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

        {loadState === 'ready' && visibleSellers.length === 0 && (
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

        {loadState === 'ready' && visibleSellers.length > 0 && (
          <Stack gap="none">
            {visibleSellers.map((seller) => (
              <ListItem
                key={seller.sellerId}
                leading={<Avatar initials={InitialsFormatter.format(seller.name)} alt={`${seller.name}: аватар`} />}
                onClick={() => handleSelectSeller(seller)}
                data-testid={`seller-list-row-${seller.sellerId}`}
                trailing={
                  <Stack gap="xs" align="end">
                    <Text variant="bodyStrong">{RatingFormatter.format({ value: seller.rating })}</Text>
                    <Text variant="caption" tone="secondary">
                      {DistanceFormatter.format({ meters: seller.distanceMeters })}
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
                    {seller.isAvailable ? (
                      <>
                        {seller.isOpenNow ? '🟢 ' : '🔴 '}
                        {seller.workingHoursLabel}
                      </>
                    ) : (
                      '🔴 Недоступен'
                    )}
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
