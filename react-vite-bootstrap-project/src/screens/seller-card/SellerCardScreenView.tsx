import { Content, Row, Stack } from '@/layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  ErrorState,
  Loader,
  Snackbar,
  Text,
} from '@/design-system/components';
import { SnackbarContainer } from '@/containers';
import { InitialsFormatter } from '@/platform-core/formatting/InitialsFormatter';
import { RatingFormatter } from '@/platform-core/formatting/RatingFormatter';
import { DistanceFormatter } from '@/platform-core/formatting/DistanceFormatter';
import type { CategoryId } from '@/platform-core/contracts/DomainTypes';
import { SellerCardHeader } from '@/screens/seller-card/SellerCardHeader';
import { SellerCardActions } from '@/screens/seller-card/SellerCardActions';
import { SellerCardProducts } from '@/screens/seller-card/SellerCardProducts';
import { SellerCardReports } from '@/screens/seller-card/SellerCardReports';
import { SellerCardRecommendations } from '@/screens/seller-card/SellerCardRecommendations';
import { useSellerCardController } from '@/screens/seller-card/useSellerCardController';
import '@/screens/seller-card/seller-card.css';

/**
 * Страница продавца (full-screen, /seller/:sellerId). Реализация заготовки
 * SellerCardScreen (ТЗ-025 §12).
 *
 * Экран чисто презентационный: все данные, URL, навигация, действия и
 * бизнес-правила агрегируются в контроллере (useSellerCardController →
 * SellerCardPageModel, см. ревью-замечания 5–7). Здесь только рендер
 * готовой модели: баннер-заглушка → превью-плитки → карточка «О продавце»
 * (+ SellerCardActions) → уведомления → SellerCardProducts → SellerCardReports
 * → SellerCardRecommendations. Кнопка «Поделиться» копирует текущий URL в
 * буфер и показывает Snackbar в том же стиле, что и ошибки геолокации на
 * карте (MAP-005 §4).
 */
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

function categoryEmoji(categoryId: CategoryId | undefined): string {
  return (categoryId && CATEGORY_EMOJI[categoryId]) ?? '🏪';
}

export function SellerCardScreenView() {
  const vm = useSellerCardController();

  return (
    <div data-testid="seller-card-screen" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <SellerCardHeader atRoot={vm.atRoot} pageReady={vm.pageReady} onBack={vm.onBack} onShare={vm.onShare} />

      <Content style={{ overflowY: 'auto' }}>
        {vm.loadState === 'loading' && (
          <Stack gap="lg" align="center" style={{ padding: 'var(--space-xxl) 0' }} data-testid="seller-card-loading">
            <Loader />
            <Text tone="secondary">Загружаем продавца…</Text>
          </Stack>
        )}

        {vm.loadState === 'error' && (
          <Stack gap="lg" style={{ padding: 'var(--space-xxl) 0' }}>
            <ErrorState
              title="Не удалось загрузить страницу продавца"
              description="Проверьте соединение и попробуйте ещё раз."
              action={
                <Button variant="secondary" onClick={vm.onRetry}>
                  Повторить
                </Button>
              }
            />
          </Stack>
        )}

        {vm.notFound && (
          <Stack gap="lg" style={{ padding: 'var(--space-xxl) 0' }}>
            <ErrorState
              title="Продавец не найден"
              description="Возможно, ссылка устарела или продавец больше не работает."
              action={!vm.atRoot ? <Button variant="secondary" onClick={vm.onBack}>Назад</Button> : undefined}
            />
          </Stack>
        )}

        {vm.pageReady && vm.record && vm.card && (
          <div className="gm-seller-card__content" data-testid="seller-card-content">
            <Stack gap="xl">
              {/* Баннер-заглушка лавки */}
              <div className="gm-seller-card__banner" aria-hidden="true">
                <span className="gm-seller-card__banner-emoji">{categoryEmoji(vm.record.categories[0])}</span>
                <Stack gap="xs">
                  <Text variant="overline" tone="secondary">
                    ЛАВКА
                  </Text>
                  <Text variant="headline">{vm.record.name}</Text>
                </Stack>
              </div>

              {/* Превью-заглушки (фото лавки ещё не пришли) */}
              {vm.card.photos.length > 0 && (
                <div className="gm-seller-card__preview" aria-label="Фото лавки">
                  {vm.card.photos.map((photo) => (
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
                      <Avatar
                        size="lg"
                        initials={InitialsFormatter.format(vm.record.name)}
                        alt={`${vm.record.name}: аватар`}
                      />
                      <Stack gap="xs">
                        <Text variant="bodyStrong">{vm.record.name}</Text>
                        <Text variant="caption" tone="secondary">
                          {RatingFormatter.format({ value: vm.record.rating })} ·{' '}
                          {DistanceFormatter.format({ meters: vm.record.distanceMeters })}
                        </Text>
                      </Stack>
                    </Row>
                    {vm.status && (
                      <Badge tone={vm.status.tone} label="Статус продавца">
                        {vm.status.text}
                      </Badge>
                    )}
                  </Row>

                  <Row gap="sm" wrap>
                    {vm.record.categoryNames.map((name) => (
                      <Badge key={name} tone="neutral">
                        {name}
                      </Badge>
                    ))}
                  </Row>
                  {vm.record.isAvailable && (
                    <Text variant="caption" tone="secondary">
                      {vm.record.workingHoursLabel}
                    </Text>
                  )}

                  <Divider />

                  <SellerCardActions
                    isFavorite={vm.isFavorite}
                    onToggleFavorite={vm.onToggleFavorite}
                    onStartRoute={vm.onStartRoute}
                    onShare={vm.onShare}
                  />
                </Stack>
              </Card>

              {vm.card.dataMayBeStale && (
                <div className="gm-seller-card__stale" role="status">
                  ⚠️ Информация может быть неактуальной
                </div>
              )}

              {/* Важные уведомления */}
              {vm.card.importantAlerts.length > 0 && (
                <Stack gap="sm">
                  <Text variant="overline" tone="secondary">
                    ВАЖНО
                  </Text>
                  {vm.card.importantAlerts.map((alert) => (
                    <div key={alert} className="gm-seller-card__alert" role="status">
                      ⚠️ {alert}
                    </div>
                  ))}
                </Stack>
              )}

              <SellerCardProducts products={vm.products} />

              <SellerCardReports reports={vm.card.reports} />

              <SellerCardRecommendations
                sellerName={vm.record.name}
                recommendations={vm.recommendations}
                onOpen={vm.onOpenRecommendation}
              />
            </Stack>
          </div>
        )}
      </Content>

      {vm.shareState && (
        <SnackbarContainer>
          <Snackbar tone={vm.shareState === 'error' ? 'error' : 'default'} data-testid="seller-card-share-snackbar">
            {vm.shareState === 'error'
              ? 'Не удалось скопировать ссылку'
              : 'Ссылка на продавца скопирована в буфер обмена'}
          </Snackbar>
        </SnackbarContainer>
      )}
    </div>
  );
}
