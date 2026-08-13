import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Text, Loader, ErrorState, Button } from '@/design-system/components';
import { Stack, Row } from '@/layout';
import { fetchProduct, CatalogApiError } from '../api';
import { OfferCard } from '../components/OfferCard';
import type { ProductDetail } from '../types';

type LoadState = { status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ready'; product: ProductDetail };

/** Экран 3 (Buyer_MVP.md): карточка товара, список предложений продавцов. */
export function ProductScreen() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  function load() {
    const id = Number(productId);
    if (!productId || Number.isNaN(id)) {
      setState({ status: 'error', message: 'Некорректный идентификатор товара.', notFound: true });
      return;
    }
    setState({ status: 'loading' });
    fetchProduct(id)
      .then((product) => setState({ status: 'ready', product }))
      .catch((err: unknown) => {
        const notFound = err instanceof CatalogApiError && err.status === 404;
        const message =
          err instanceof CatalogApiError ? err.message : 'Не удалось загрузить карточку товара.';
        setState({ status: 'error', message, notFound });
      });
  }

  useEffect(load, [productId]);

  return (
    <Stack gap="lg">
      <Row align="center" justify="between">
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
          Назад
        </Button>
      </Row>

      {state.status === 'loading' && <Loader size="lg" label="Загрузка товара" />}

      {state.status === 'error' && (
        <ErrorState
          title={state.notFound ? 'Товар не найден' : 'Не удалось загрузить товар'}
          description={state.message}
          action={!state.notFound ? <Button onClick={load}>Повторить</Button> : undefined}
        />
      )}

      {state.status === 'ready' && (
        <>
          <Text variant="headline" as="h1">
            {state.product.name}
          </Text>
          {state.product.group_name && (
            <Text variant="caption" tone="secondary">
              Категория: {state.product.group_name}
            </Text>
          )}
          {state.product.description && (
            <Text variant="body" tone="secondary">
              {state.product.description}
            </Text>
          )}

          <Text variant="title" as="h2">
            Предложения продавцов ({state.product.offers.length})
          </Text>

          {state.product.offers.length === 0 ? (
            <Text tone="secondary">Сейчас нет доступных предложений.</Text>
          ) : (
            <Stack gap="md">
              {state.product.offers.map((offer) => (
                <OfferCard key={offer.seller_product_id} offer={offer} />
              ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
