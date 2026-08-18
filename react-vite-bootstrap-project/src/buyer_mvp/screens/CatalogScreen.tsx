import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Text, Loader, ErrorState, EmptyState, Button } from '@/design-system/components';
import { Grid, Stack, Row } from '@/layout';
import { fetchProducts, fetchGroups, CatalogApiError } from '../api';
import { SearchBar } from '../components/SearchBar';
import { ProductCard } from '../components/ProductCard';
import type { ProductGroup, ProductListItem, SortOrder } from '../types';
import { OpenStreetMapTileProvider } from '@/platform-core/map/gis/TileProvider';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; products: ProductListItem[]; page: number; limit: number; total: number };

/** Экран 2 (Buyer_MVP.md): список товаров, поиск, фильтр по категории. */
export function CatalogScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  // Чипы категорий грузятся независимо от списка: ошибка/пусто — просто
  // не рисуем ряд, список товаров при этом не блокируется.
  const [groups, setGroups] = useState<ProductGroup[] | null>(null);

  const search = searchParams.get('search') ?? '';
  const groupId = searchParams.get('group_id');
  const sort = (searchParams.get('sort') as SortOrder | null) ?? 'name';
  const page = Number(searchParams.get('page') ?? '1');

  function load() {
    setState({ status: 'loading' });
    fetchProducts({
      search: search || undefined,
      groupId: groupId ? Number(groupId) : undefined,
      sort,
      page,
    })
      .then((res) =>
        setState({ status: 'ready', products: res.products, page: res.page, limit: res.limit, total: res.total }),
      )
      .catch((err: unknown) => {
        const message = err instanceof CatalogApiError ? err.message : 'Не удалось загрузить товары.';
        setState({ status: 'error', message });
      });
  }

  useEffect(load, [search, groupId, sort, page]);

  useEffect(() => {
    fetchGroups()
      .then((res) => setGroups(res.groups))
      .catch(() => setGroups(null));
  }, []);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  }

  return (
    <Stack gap="lg">
      <Row align="center" justify="between">
        <Text variant="headline" as="h1">
          Каталог
        </Text>
        <Button variant="secondary" size="sm" onClick={() => navigate('/')}>
          На главную
        </Button>
      </Row>

      <SearchBar initialValue={search} onSearch={(value) => updateParam('search', value || null)} />

      <Row gap="sm">
        <Button variant={sort === 'name' ? 'primary' : 'secondary'} size="sm" onClick={() => updateParam('sort', 'name')}>
          По названию
        </Button>
        <Button variant={sort === 'price' ? 'primary' : 'secondary'} size="sm" onClick={() => updateParam('sort', 'price')}>
          По цене
        </Button>
      </Row>

      {groups !== null && groups.length > 0 && (
        <Row gap="sm" wrap role="navigation" aria-label="Категории">
          <Button
            size="sm"
            variant={groupId ? 'ghost' : 'primary'}
            onClick={() => updateParam('group_id', null)}
          >
            Все
          </Button>
          {[...groups].sort((a, b) => a.sort_order - b.sort_order).map((g) => (
            <Button
              key={g.id}
              size="sm"
              variant={groupId === String(g.id) ? 'primary' : 'ghost'}
              onClick={() => updateParam('group_id', String(g.id))}
            >
              {g.name} ({g.product_count})
            </Button>
          ))}
        </Row>
      )}

      {state.status === 'loading' && <Loader size="lg" label="Загрузка каталога" />}

      {state.status === 'error' && (
        <ErrorState title="Не удалось загрузить каталог" description={state.message} action={<Button onClick={load}>Повторить</Button>} />
      )}

      {state.status === 'ready' && state.products.length === 0 && (
        <EmptyState title="Ничего не найдено" description="Попробуйте изменить запрос или категорию" />
      )}

      {state.status === 'ready' && state.products.length > 0 && (
        <>
          <Grid gap="md">
            {state.products.map((p) => (
              <ProductCard key={p.id} product={p} onOpen={(id) => navigate(`/product/${id}`)} />
            ))}
          </Grid>

          <Row gap="sm" justify="center">
            <Button
              variant="secondary"
              size="sm"
              disabled={state.page <= 1}
              onClick={() => updateParam('page', String(state.page - 1))}
            >
              Назад
            </Button>
            <Text tone="secondary">
              Стр. {state.page} из {Math.max(1, Math.ceil(state.total / state.limit))}
            </Text>
            <Button
              variant="secondary"
              size="sm"
              disabled={state.page * state.limit >= state.total}
              onClick={() => updateParam('page', String(state.page + 1))}
            >
              Вперёд
            </Button>
          </Row>
        </>
      )}

      <div
        style={{
          marginTop: 'auto',
          paddingTop: 'var(--space-lg)',
          paddingBottom: '8px',
          textAlign: 'center',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
          marginBottom: '-8px',
        }}
        dangerouslySetInnerHTML={{ __html: OpenStreetMapTileProvider.attribution }}
      />
    </Stack>
  );
}
