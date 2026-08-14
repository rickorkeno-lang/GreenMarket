import { type ReactNode } from 'react';
import { currentEntry } from '@/platform-core/navigation-runtime-layer/navigation/NavigationStack';
import { useGreenMarketRuntime } from '@/platform-core/navigation-runtime-layer/hooks/useGreenMarketRuntime';
import { MapScreenView } from '@/screens/map/MapScreenView';
import { SellerCardScreenView } from '@/screens/seller-card/SellerCardScreenView';
import { SellerListScreenView } from '@/screens/seller-list/SellerListScreenView';
import { useMapFullscreen } from '@/app/useMapFullscreen';

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
 *
 * MAP-031: полноэкранный режим (Fullscreen API) применяется к ОБЁРТКЕ этой
 * поверхности (ref из useMapFullscreen), а не к контейнеру Leaflet — чтобы
 * вместе с картой в fullscreen оставались Bottom Sheet, Seller Card, FAB и
 * другие overlays. Переключение не трогает состояние карты: requestFullscreen/
 * exitFullscreen не перемонтируют DOM, MapRuntime и локальное состояние
 * MapScreenView сохраняются.
 */
export function MapSurface() {
  const { state } = useGreenMarketRuntime();
  const top = currentEntry(state.navigation);
  const { surfaceRef, isFullscreen, fullscreenSupported, toggleFullscreen } = useMapFullscreen();

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

  return (
    <div ref={surfaceRef} className="gm-map-surface" data-testid="map-surface" style={{ height: '100vh' }}>
      <MapScreenView
        isFullscreen={isFullscreen}
        fullscreenSupported={fullscreenSupported}
        onToggleFullscreen={toggleFullscreen}
      >
        {overlay}
      </MapScreenView>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 'var(--z-modal)',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--color-surface-base)',
};
