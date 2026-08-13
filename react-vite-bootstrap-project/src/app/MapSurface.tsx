import { type ReactNode } from 'react';
import { currentEntry } from '@/platform-core/navigation-runtime-layer/navigation/NavigationStack';
import { useGreenMarketRuntime } from '@/platform-core/navigation-runtime-layer/hooks/useGreenMarketRuntime';
import { MapScreenView } from '@/screens/map/MapScreenView';
import { SellerCardScreenView } from '@/screens/seller-card/SellerCardScreenView';
import { SellerListScreenView } from '@/screens/seller-list/SellerListScreenView';

/**
 * Карта-поверхность (ТЗ-024 §10: «Карта не входит в стек»). Рендерится по
 * URL /map и НЕ размонтируется при открытии контента панели: MapScreenView —
 * постоянная поверхность, а SellerCard/SellerList — контент Bottom Sheet
 * (стек навигации), который монтируется ПОВЕРХ карты как оверлей. Смена
 * «Главного экрана» (Main) на карточку/список — это изменение верхнего экрана
 * стека без смены страницы и без пересоздания карты.
 *
 * Оверлей позиционируется через position:fixed на всю высоту экрана: у
 * карточки/списка собственный Header и скролл контента (как у экрана раньше),
 * а контент панели высокий, поэтому визуально он и так занимает весь экран.
 */
export function MapSurface() {
  const { state } = useGreenMarketRuntime();
  const top = currentEntry(state.navigation);

  let overlay: ReactNode = null;
  if (top.screen === 'SellerCard') {
    overlay = (
      <div data-testid="map-overlay" style={overlayStyle}>
        <SellerCardScreenView sellerId={top.params.sellerId} />
      </div>
    );
  } else if (top.screen === 'SellerList') {
    overlay = (
      <div data-testid="map-overlay" style={overlayStyle}>
        <SellerListScreenView />
      </div>
    );
  }

  return <MapScreenView>{overlay}</MapScreenView>;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 'var(--z-modal)',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--color-surface-base)',
};
