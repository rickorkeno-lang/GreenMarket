import { Row, Stack } from '@/layout';
import { Badge, Card, Divider, Text } from '@/design-system/components';
import type { SellerProductRecord } from '@/platform-core/map/repository/SellerRepository';

/** Бейдж доступности товара: «В наличии» / «Замена» / «Нет в наличии». */
function availabilityBadge(availability: SellerProductRecord['availability']) {
  if (availability === 'replacement') return <Badge tone="neutral">Замена</Badge>;
  if (availability === 'missing') return <Badge tone="danger">Нет в наличии</Badge>;
  return <Badge tone="success">В наличии</Badge>;
}

/**
 * Секция «Товары продавца» страницы продавца. Чисто презентационный блок:
 * сортировка по доступности выполняется в репозитории (getSellerProducts),
 * сюда приходит уже отсортированный список.
 */
export interface SellerCardProductsProps {
  products: SellerProductRecord[];
}

export function SellerCardProducts({ products }: SellerCardProductsProps) {
  if (products.length === 0) {
    return (
      <Stack gap="md">
        <Text variant="title" as="h2" data-testid="seller-card-products-title">
          Товары продавца
        </Text>
        <Text variant="caption" tone="secondary">
          У продавца пока нет товаров.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text variant="title" as="h2" data-testid="seller-card-products-title">
        Товары продавца
      </Text>
      <div className="gm-seller-card__products">
        {products.map((product) => (
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
    </Stack>
  );
}
