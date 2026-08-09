import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import { MapScreenView } from '@/screens/map/MapScreenView';
import { SellerListScreenView } from '@/screens/seller-list/SellerListScreenView';
import { SellerCardScreenView } from '@/screens/seller-card/SellerCardScreenView';
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

const FULL_SCREEN_ROUTES = new Set(['/map', '/seller-list']);

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
 * primitives. Map (IMP-003.1), Seller List (AR-003: Map → Seller List) and
 * Seller Card (ТЗ-025: detail page) are full-screen routes with their own
 * Header/back button — they deliberately skip the shared TopNav/Page chrome
 * used by the remaining placeholders.
 */
export function NavigationContainer() {
  const location = useLocation();
  const isFullScreenRoute =
    FULL_SCREEN_ROUTES.has(location.pathname) || location.pathname.startsWith('/seller/');

  return (
    <>
      {!isFullScreenRoute && <TopNav />}
      {isFullScreenRoute ? (
        <Routes>
          <Route path="/map" element={<MapScreenView />} />
          <Route path="/seller-list" element={<SellerListScreenView />} />
          <Route path="/seller/:sellerId" element={<SellerCardScreenView />} />
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
