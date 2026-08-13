import { Card, Text, Divider } from '@/design-system/components';
import { PhotoStrip } from './PhotoStrip';
import { formatPrice, formatStock, formatSupplyDate } from '../format';
import type { SellerOffer } from '../types';

interface OfferCardProps {
  offer: SellerOffer;
}

/** Экран 3 (Карточка товара): продавец, цена, единица, остаток, фото (все, лентой),
 *  страна происхождения и дата завоза (колонки книги продавца, если заполнены), описание. */
export function OfferCard({ offer }: OfferCardProps) {
  const supplyDate = formatSupplyDate(offer.supply_date);

  return (
    <Card className="gm-buyer-offer-card">
      <PhotoStrip photos={offer.photos} label={offer.seller_name} />
      <Text variant="bodyStrong" as="h3">
        {offer.seller_name}
      </Text>
      <Text variant="title" as="p">
        {formatPrice(offer.price)}{' '}
        <Text as="span" variant="caption" tone="secondary">
          / {offer.unit}
        </Text>
      </Text>
      <Text variant="caption" tone="secondary">
        Остаток: {formatStock(offer.stock, offer.unit)}
      </Text>
      {offer.origin_country && (
        <Text variant="caption" tone="secondary">
          Страна происхождения: {offer.origin_country}
        </Text>
      )}
      {supplyDate && (
        <Text variant="caption" tone="secondary">
          {supplyDate}
        </Text>
      )}
      {offer.description && (
        <>
          <Divider />
          <Text variant="body" tone="secondary">
            {offer.description}
          </Text>
        </>
      )}
    </Card>
  );
}
