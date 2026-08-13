import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import { MapSurface } from '@/app/MapSurface';
import { Header, Page, Row } from '@/layout';
import { Text } from '@/design-system/components';
import '@/buyer_mvp/buyer_mvp.css';
import { HomeScreen } from '@/buyer_mvp/screens/HomeScreen';
import { CatalogScreen } from '@/buyer_mvp/screens/CatalogScreen';
import { ProductScreen } from '@/buyer_mvp/screens/ProductScreen';

const navItems = [
  { to: '/catalog', label: 'Каталог' },
  { to: '/map', label: 'Карта' },
  { to: '/cart', label: 'Корзина' },
  { to: '/profile', label: 'Профиль' },
];

const FULL_SCREEN_ROUTES = new Set(['/map']);

function TopNav() {
  return (
    <Header>
      <Page style={{ padding: 0 }}>
        <Row gap="lg" align="center" style={{ height: '100%' }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                textDecoration: 'none',
                opacity: isActive ? 1 : 0.7,
              })}
            >
              <Text variant="bodyStrong" as="span">
                {item.label}
              </Text>
            </NavLink>
          ))}
        </Row>
      </Page>
    </Header>
  );
}

/**
 * Stage 1 routing scaffold, composed from the Design System's Layout
 * primitives. Map (IMP-003.1) — корневая поверхность: полноэкранный route
 * /map, который рендерит MapSurface (карта + контент Bottom Sheet поверх неё:
 * Seller Card / Seller List, ТЗ-024 §10). Контент панели — НЕ страницы: у
 * них нет собственных маршрутов, адресная строка остаётся /map, а карта не
 * размонтируется. Остальные страницы — каталог/корзина/профиль — под шапкой
 * с навигацией по разделам.
 */
export function NavigationContainer() {
  const location = useLocation();
  const isFullScreenRoute = FULL_SCREEN_ROUTES.has(location.pathname);

  return (
    <>
      {!isFullScreenRoute && <TopNav />}
      {isFullScreenRoute ? (
        <Routes>
          <Route path="/map" element={<MapSurface />} />
        </Routes>
      ) : (
        <Page>
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/catalog" element={<CatalogScreen />} />
            <Route path="/product/:productId" element={<ProductScreen />} />
            <Route path="/cart" element={<PlaceholderScreen name="Корзина" />} />
            <Route path="/profile" element={<PlaceholderScreen name="Профиль" />} />
            <Route path="*" element={<PlaceholderScreen name="Страница не найдена" />} />
          </Routes>
        </Page>
      )}
    </>
  );
}
