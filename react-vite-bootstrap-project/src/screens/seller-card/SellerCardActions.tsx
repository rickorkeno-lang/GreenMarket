import { Row } from '@/layout';
import { Button, Icon } from '@/design-system/components';

/**
 * Ряд действий карточки «О продавце»: избранное, маршрут, поделиться.
 * Обработчики приходят из контроллера экрана — компонент чисто презентационный.
 */
export interface SellerCardActionsProps {
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onStartRoute: () => void;
  onShare: () => void;
}

export function SellerCardActions({ isFavorite, onToggleFavorite, onStartRoute, onShare }: SellerCardActionsProps) {
  return (
    <Row gap="md">
      <Button
        variant="secondary"
        leadingIcon={<Icon label="Избранное">{isFavorite ? '♥' : '♡'}</Icon>}
        onClick={onToggleFavorite}
        data-testid="seller-card-favorite"
      >
        {isFavorite ? 'В избранном' : 'В избранное'}
      </Button>
      <Button
        variant="secondary"
        leadingIcon={<Icon label="Маршрут">🧭</Icon>}
        onClick={onStartRoute}
        data-testid="seller-card-route"
      >
        Маршрут
      </Button>
      <Button
        variant="secondary"
        leadingIcon={<Icon label="Поделиться">↗</Icon>}
        onClick={onShare}
        data-testid="seller-card-share-button"
      >
        Поделиться
      </Button>
    </Row>
  );
}
