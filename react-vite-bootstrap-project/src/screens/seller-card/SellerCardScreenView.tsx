import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Content, Header, Row, Stack } from '@/layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  ErrorState,
  Icon,
  IconButton,
  ListItem,
  Loader,
  Snackbar,
  Text,
} from '@/design-system/components';
import { SnackbarContainer } from '@/containers';
import { useGreenMarketRuntime } from '@/platform-core/navigation-runtime-layer/hooks/useGreenMarketRuntime';
import { isAtRoot } from '@/platform-core/navigation-runtime-layer/navigation/NavigationStack';
import { asSellerId } from '@/platform-core/contracts/Action';
import { PRODUCT_AVAILABILITY_ORDER, type CategoryId } from '@/platform-core/contracts/DomainTypes';
import { MockSellerRepository } from '@/platform-core/map/repository/MockSellerRepository';
import type { SellerProductRecord } from '@/platform-core/map/repository/mockSellerCatalog';
import type { RecommendedSeller } from '@/platform-core/map/recommendations/SellerRecommendations';
import type { SellerCardViewModel } from '@/platform-core/viewmodels/SellerCardViewModel';
import type { SellerMapRecord } from '@/platform-core/map/viewmodels/MapViewModel';
import { Diagnostics } from '@/platform-core/diagnostics/Diagnostics';
import { RatingFormatter } from '@/platform-core/formatting/RatingFormatter';
import { DistanceFormatter } from '@/platform-core/formatting/DistanceFormatter';
import '@/screens/seller-card/seller-card.css';

/**
 * Страница продавца (full-screen, /seller/:sellerId). Реализация заготовки
 * SellerCardScreen (ТЗ-025 §12): доменные данные — SellerCardViewModel + базовая
 * запись продавца + каталог товаров + рекомендации, всё из MockSellerRepository.
 *
 * Композиция (сверху вниз): баннер-заглушка → превью-плитки → карточка
 * «О продавце» (рейтинг/расстояние/категории/статус + действия) →
 * уведомления → товары → сообщения покупателей → похожие продавцы. Кнопка
 * «Поделиться» копирует текущий URL в буфер и показывает Snackbar в том же
 * стиле, что и ошибки геолокации на карте (MAP-005 §4).
 *
 * Навигация — через общий GreenMarketRuntime (dispatch), как остальные экраны;
 * sellerId приходит из URL (useParams), RuntimeRouteSync держит стек синхронным.
 */
type LoadState = 'loading' | 'error' | 'ready';
type ShareState = 'ok' | 'error' | null;

const SHARE_NOTICE_TIMEOUT_MS = 4000;

const CATEGORY_EMOJI: Record<string, string> = {
  vegetables: '🥕',
  dairy: '🥛',
  meat: '🥩',
  bakery: '🍞',
  honey: '🍯',
  fish: '🐟',
  herbs: '🌿',
  nuts: '🥜',
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function categoryEmoji(categoryId: CategoryId | undefined): string {
  return (categoryId && CATEGORY_EMOJI[categoryId]) ?? '🏪';
}

function sellerStatus(record: SellerMapRecord): { text: string; tone: 'success' | 'neutral' | 'danger' } {
  if (!record.isAvailable) return { text: 'Недоступен', tone: 'danger' };
  if (record.isOpenNow) return { text: 'Открыт сейчас', tone: 'success' };
  return { text: 'Сейчас закрыт', tone: 'neutral' };
}

function availabilityBadge(availability: SellerProductRecord['availability']) {
  if (availability === 'replacement') return <Badge tone="neutral">Замена</Badge>;
  if (availability === 'missing') return <Badge tone="danger">Нет в наличии</Badge>;
  return <Badge tone="success">В наличии</Badge>;
}

/** Копирование в буфер обмена с fallback'ом для несекурных контекстов
 *  (navigator.clipboard недоступен без https/localhost). */
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // переходим к legacy-пути ниже
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function SellerCardScreenView() {
  const { state, dispatch } = useGreenMarketRuntime();
  const { sellerId: sellerIdParam } = useParams<{ sellerId: string }>();
  const sellerId = sellerIdParam ? asSellerId(sellerIdParam) : null;

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [record, setRecord] = useState<SellerMapRecord | null>(null);
  const [card, setCard] = useState<SellerCardViewModel | null>(null);
  const [products, setProducts] = useState<SellerProductRecord[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedSeller[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [shareState, setShareState] = useState<ShareState>(null);
  const shareTimerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!sellerId) {
      setLoadState('ready');
      setRecord(null);
      setCard(null);
      setProducts([]);
      setRecommendations([]);
      return;
    }
    setLoadState('loading');
    try {
      const [recordRes, cardRes, productsRes, recommendationsRes] = await Promise.all([
        MockSellerRepository.getSeller(sellerId),
        MockSellerRepository.getSellerCard(sellerId),
        MockSellerRepository.getSellerProducts(sellerId),
        MockSellerRepository.getRecommendedSellers(sellerId),
      ]);
      setRecord(recordRes);
      setCard(cardRes);
      setIsFavorite(cardRes.isFavorite);
      setProducts(productsRes);
      setRecommendations(recommendationsRes);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [sellerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
    },
    [],
  );

  const showShareNotice = useCallback((next: Exclude<ShareState, null>) => {
    setShareState(next);
    if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
    shareTimerRef.current = window.setTimeout(() => setShareState(null), SHARE_NOTICE_TIMEOUT_MS);
  }, []);

  const handleShare = useCallback(async () => {
    if (!sellerId) return;
    Diagnostics.track('seller_card.share', { sellerId });
    const copied = await copyTextToClipboard(window.location.href);
    showShareNotice(copied ? 'ok' : 'error');
  }, [sellerId, showShareNotice]);

  const handleToggleFavorite = useCallback(() => {
    if (!sellerId) return;
    Diagnostics.track('seller_card.toggle_favorite', { sellerId });
    dispatch({ type: 'TOGGLE_FAVORITE_SELLER', payload: { sellerId } });
    setIsFavorite((value) => !value);
  }, [dispatch, sellerId]);

  const handleStartRoute = useCallback(() => {
    if (!sellerId) return;
    Diagnostics.track('seller_card.start_route', { sellerId });
    dispatch({ type: 'START_ROUTE' });
  }, [dispatch, sellerId]);

  const handleOpenRecommendation = useCallback(
    (recommendation: RecommendedSeller) => {
      Diagnostics.track('seller_card.open_recommendation', { sellerId: recommendation.seller.sellerId });
      dispatch({ type: 'OPEN_SELLER', payload: { sellerId: recommendation.seller.sellerId } });
    },
    [dispatch],
  );

  const atRoot = isAtRoot(state.navigation);
  const handleBack = useCallback(() => dispatch({ type: 'BACK' }), [dispatch]);

  const sortedProducts = useMemo(
    () =>
      [...products].sort(
        (a, b) =>
          PRODUCT_AVAILABILITY_ORDER[a.availability ?? 'available'] -
          PRODUCT_AVAILABILITY_ORDER[b.availability ?? 'available'],
      ),
    [products],
  );

  const ready = loadState === 'ready';
  const notFound = ready && !record;
  const pageReady = ready && record !== null && card !== null;

  return (
    <div data-testid="seller-card-screen" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header>
        <Row gap="md" align="center" justify="between" style={{ position: 'relative', width: '100%' }}>
          <Row gap="sm" align="center">
            {!atRoot && (
              <IconButton label="Назад" onClick={handleBack} data-testid="seller-card-back">
                <Icon label="Назад">←</Icon>
              </IconButton>
            )}
            <Text variant="title" as="span">
              Продавец
            </Text>
          </Row>
          <IconButton
            label="Поделиться ссылкой на продавца"
            onClick={() => void handleShare()}
            disabled={!pageReady}
            data-testid="seller-card-share"
          >
            <Icon label="Поделиться">↗</Icon>
          </IconButton>
        </Row>
      </Header>

      <Content style={{ overflowY: 'auto' }}>
        {loadState === 'loading' && (
          <Stack gap="lg" align="center" style={{ padding: 'var(--space-xxl) 0' }} data-testid="seller-card-loading">
            <Loader />
            <Text tone="secondary">Загружаем продавца…</Text>
          </Stack>
        )}

        {loadState === 'error' && (
          <Stack gap="lg" style={{ padding: 'var(--space-xxl) 0' }}>
            <ErrorState
              title="Не удалось загрузить страницу продавца"
              description="Проверьте соединение и попробуйте ещё раз."
              action={
                <Button variant="secondary" onClick={() => void load()}>
                  Повторить
                </Button>
              }
            />
          </Stack>
        )}

        {notFound && (
          <Stack gap="lg" style={{ padding: 'var(--space-xxl) 0' }}>
            <ErrorState
              title="Продавец не найден"
              description="Возможно, ссылка устарела или продавец больше не работает."
              action={!atRoot ? <Button variant="secondary" onClick={handleBack}>Назад</Button> : undefined}
            />
          </Stack>
        )}

        {pageReady && record && card && (
          <div className="gm-seller-card__content" data-testid="seller-card-content">
            <Stack gap="xl">
              {/* Баннер-заглушка лавки */}
              <div className="gm-seller-card__banner" aria-hidden="true">
                <span className="gm-seller-card__banner-emoji">{categoryEmoji(record.categories[0])}</span>
                <Stack gap="xs">
                  <Text variant="overline" tone="secondary">
                    ЛАВКА
                  </Text>
                  <Text variant="headline">{record.name}</Text>
                </Stack>
              </div>

              {/* Превью-заглушки (фото лавки ещё не пришли) */}
              {card.photos.length > 0 && (
                <div className="gm-seller-card__preview" aria-label="Фото лавки">
                  {card.photos.map((photo) => (
                    <div
                      key={photo.id}
                      className="gm-seller-card__preview-tile"
                      style={{ background: photo.placeholderColor }}
                      title="Фото лавки"
                    />
                  ))}
                </div>
              )}

              {/* О продавце */}
              <Card>
                <Stack gap="md">
                  <Row gap="lg" align="center" justify="between">
                    <Row gap="md" align="center">
                      <Avatar size="lg" initials={initialsOf(record.name)} alt={`${record.name}: аватар`} />
                      <Stack gap="xs">
                        <Text variant="bodyStrong">{record.name}</Text>
                        <Text variant="caption" tone="secondary">
                          {RatingFormatter.format({ value: record.rating })} ·{' '}
                          {DistanceFormatter.format({ meters: record.distanceMeters })}
                        </Text>
                      </Stack>
                    </Row>
                    <Badge tone={sellerStatus(record).tone} label="Статус продавца">
                      {sellerStatus(record).text}
                    </Badge>
                  </Row>

                  <Row gap="sm" wrap>
                    {record.categoryNames.map((name) => (
                      <Badge key={name} tone="neutral">
                        {name}
                      </Badge>
                    ))}
                  </Row>
                  {record.isAvailable && (
                    <Text variant="caption" tone="secondary">
                      {record.workingHoursLabel}
                    </Text>
                  )}

                  <Divider />

                  <Row gap="md">
                    <Button
                      variant="secondary"
                      leadingIcon={<Icon label="Избранное">{isFavorite ? '♥' : '♡'}</Icon>}
                      onClick={handleToggleFavorite}
                      data-testid="seller-card-favorite"
                    >
                      {isFavorite ? 'В избранном' : 'В избранное'}
                    </Button>
                    <Button
                      variant="secondary"
                      leadingIcon={<Icon label="Маршрут">🧭</Icon>}
                      onClick={handleStartRoute}
                      data-testid="seller-card-route"
                    >
                      Маршрут
                    </Button>
                    <Button
                      variant="secondary"
                      leadingIcon={<Icon label="Поделиться">↗</Icon>}
                      onClick={() => void handleShare()}
                      data-testid="seller-card-share-button"
                    >
                      Поделиться
                    </Button>
                  </Row>
                </Stack>
              </Card>

              {card.dataMayBeStale && (
                <div className="gm-seller-card__stale" role="status">
                  ⚠️ Информация может быть неактуальной
                </div>
              )}

              {/* Важные уведомления */}
              {card.importantAlerts.length > 0 && (
                <Stack gap="sm">
                  <Text variant="overline" tone="secondary">
                    ВАЖНО
                  </Text>
                  {card.importantAlerts.map((alert) => (
                    <div key={alert} className="gm-seller-card__alert" role="status">
                      ⚠️ {alert}
                    </div>
                  ))}
                </Stack>
              )}

              {/* Товары продавца */}
              <Stack gap="md">
                <Text variant="title" as="h2" data-testid="seller-card-products-title">
                  Товары продавца
                </Text>
                {sortedProducts.length === 0 ? (
                  <Text variant="caption" tone="secondary">
                    У продавца пока нет товаров.
                  </Text>
                ) : (
                  <div className="gm-seller-card__products">
                    {sortedProducts.map((product) => (
                      <Card key={product.id} className="gm-seller-card__product">
                        <Stack gap="sm">
                          <Row justify="between" align="center">
                            <span className="gm-seller-card__product-emoji" aria-hidden="true">
                              {product.emoji}
                            </span>
                            {availabilityBadge(product.availability)}
                          </Row>
                          <Text variant="bodyStrong">{product.name}</Text>
                          <Text variant="caption" tone="secondary">
                            {product.unit}
                          </Text>
                          {product.description && (
                            <Text variant="caption" tone="tertiary">
                              {product.description}
                            </Text>
                          )}
                          <Divider />
                          <Text variant="bodyStrong">{product.price} ₽</Text>
                        </Stack>
                      </Card>
                    ))}
                  </div>
                )}
              </Stack>

              {/* Сообщения покупателей */}
              {card.reports.length > 0 && (
                <Stack gap="md">
                  <Text variant="title" as="h2">
                    Сообщения покупателей
                  </Text>
                  <Card>
                    <Stack gap="none">
                      {card.reports.map((report) => (
                        <ListItem key={report.id} static leading={<Text as="span">💬</Text>}>
                          <Stack gap="xs">
                            <Text variant="bodyStrong">{report.title}</Text>
                            <Text variant="caption" tone="secondary">
                              {[report.author, report.date].filter(Boolean).join(' · ')}
                            </Text>
                          </Stack>
                        </ListItem>
                      ))}
                    </Stack>
                  </Card>
                </Stack>
              )}

              {/* Похожие продавцы */}
              {recommendations.length > 0 && (
                <Stack gap="md" data-testid="seller-card-recommendations">
                  <Stack gap="xs">
                    <Text variant="title" as="h2">
                      Похожие продавцы
                    </Text>
                    <Text variant="caption" tone="secondary">
                      В тех же категориях, что и {record.name}
                    </Text>
                  </Stack>
                  <Card>
                    <Stack gap="xs">
                      {recommendations.map((recommendation) => (
                        <ListItem
                          key={recommendation.seller.sellerId}
                          onClick={() => handleOpenRecommendation(recommendation)}
                          leading={
                            <Avatar
                              initials={initialsOf(recommendation.seller.name)}
                              alt={`${recommendation.seller.name}: аватар`}
                            />
                          }
                          data-testid={`recommendation-${recommendation.seller.sellerId}`}
                          trailing={
                            <Stack gap="xs" align="end">
                              <Text variant="caption" tone="secondary">
                                {RatingFormatter.format({ value: recommendation.seller.rating })}
                              </Text>
                            </Stack>
                          }
                        >
                          <Stack gap="xs">
                            <Text variant="bodyStrong">{recommendation.seller.name}</Text>
                            <Text variant="caption" tone="secondary">
                              {recommendation.sharedCategoryNames.join(' · ')}
                            </Text>
                            <Text variant="caption" tone="tertiary">
                              {DistanceFormatter.format({ meters: recommendation.seller.distanceMeters })}
                              {!recommendation.seller.isAvailable
                                ? ' · недоступен'
                                : recommendation.seller.isOpenNow
                                  ? ' · открыт'
                                  : ' · закрыт'}
                            </Text>
                          </Stack>
                        </ListItem>
                      ))}
                    </Stack>
                  </Card>
                </Stack>
              )}
            </Stack>
          </div>
        )}
      </Content>

      {shareState && (
        <SnackbarContainer>
          <Snackbar tone={shareState === 'error' ? 'error' : 'default'} data-testid="seller-card-share-snackbar">
            {shareState === 'error'
              ? 'Не удалось скопировать ссылку'
              : 'Ссылка на продавца скопирована в буфер обмена'}
          </Snackbar>
        </SnackbarContainer>
      )}
    </div>
  );
}
