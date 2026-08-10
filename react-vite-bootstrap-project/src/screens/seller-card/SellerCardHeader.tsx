import { Header, Row } from '@/layout';
import { Icon, IconButton, Text } from '@/design-system/components';

/**
 * Шапка страницы продавца: кнопка «Назад» (только если экран открыт не как
 * корневой — иначе навигация отдаётся системному бэк-жесту), заголовок
 * «Продавец» и кнопка «Поделиться ссылкой».
 */
export interface SellerCardHeaderProps {
  /** true — экран открыт как корневой (без кнопки «Назад»). */
  atRoot: boolean;
  /** Запрет шаринга до готовности данных страницы. */
  pageReady: boolean;
  onBack: () => void;
  onShare: () => void;
}

export function SellerCardHeader({ atRoot, pageReady, onBack, onShare }: SellerCardHeaderProps) {
  return (
    <Header>
      <Row gap="md" align="center" justify="between" style={{ position: 'relative', width: '100%' }}>
        <Row gap="sm" align="center">
          {!atRoot && (
            <IconButton label="Назад" onClick={onBack} data-testid="seller-card-back">
              <Icon label="Назад">←</Icon>
            </IconButton>
          )}
          <Text variant="title" as="span">
            Продавец
          </Text>
        </Row>
        <IconButton
          label="Поделиться ссылкой на продавца"
          onClick={onShare}
          disabled={!pageReady}
          data-testid="seller-card-share"
        >
          <Icon label="Поделиться">↗</Icon>
        </IconButton>
      </Row>
    </Header>
  );
}
