import { Stack } from '@/layout';
import { Avatar, Card, ListItem, Text } from '@/design-system/components';
import { InitialsFormatter } from '@/platform-core/formatting/InitialsFormatter';
import { RatingFormatter } from '@/platform-core/formatting/RatingFormatter';
import { DistanceFormatter } from '@/platform-core/formatting/DistanceFormatter';
import type { RecommendedSeller } from '@/platform-core/map/recommendations/SellerRecommendations';

/**
 * Секция «Похожие продавцы» страницы продавца. Презентационный список
 * рекомендаций; переход к продавцу — через колбэк из контроллера экрана.
 */
export interface SellerCardRecommendationsProps {
  sellerName: string;
  recommendations: RecommendedSeller[];
  onOpen: (recommendation: RecommendedSeller) => void;
}

export function SellerCardRecommendations({
  sellerName,
  recommendations,
  onOpen,
}: SellerCardRecommendationsProps) {
  if (recommendations.length === 0) return null;

  return (
    <Stack gap="md" data-testid="seller-card-recommendations">
      <Stack gap="xs">
        <Text variant="title" as="h2">
          Похожие продавцы
        </Text>
        <Text variant="caption" tone="secondary">
          В тех же категориях, что и {sellerName}
        </Text>
      </Stack>
      <Card>
        <Stack gap="xs">
          {recommendations.map((recommendation) => (
            <ListItem
              key={recommendation.seller.sellerId}
              onClick={() => onOpen(recommendation)}
              leading={
                <Avatar
                  initials={InitialsFormatter.format(recommendation.seller.name)}
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
  );
}
