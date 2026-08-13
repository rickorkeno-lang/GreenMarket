import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@/design-system/ThemeProvider';
import { GreenMarketRuntimeProvider } from '@/platform-core/navigation-runtime-layer/hooks/useGreenMarketRuntime';
import { createGreenMarketActionHandlers } from '@/platform-core/navigation-runtime-layer/runtime/GreenMarketActionHandlers';
import { useMapProjection } from '@/platform-core/map/runtime/MapProjection';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { NavigationContainer } from '@/app/NavigationContainer';
import { RuntimeRouteSync } from '@/app/RuntimeRouteSync';
import { Screen } from '@/layout';

/** Слушатель BusinessEvents карты (ROUTE_STARTED → построение маршрута со
 *  страницы продавца). Живёт на уровне App Shell, а не экрана карты: событие
 *  приходит в момент навигации «карточка продавца → карта», когда
 *  MapScreenView может быть не смонтирован. */
function MapProjectionBridge() {
  useMapProjection();
  return null;
}

/**
 * App Shell: ThemeProvider -> GreenMarketRuntimeProvider (real Platform
 * Core Runtime, IMP-003) -> ErrorBoundary -> Router.
 * Screen provides the token-driven base background/layout for the whole app.
 *
 * Провайдеру передаются реальные ActionHandlers (createGreenMarketActionHandlers),
 * а не заглушка createNoopActionHandlers: без них START_ROUTE не превращается
 * в BusinessEvent ROUTE_STARTED и маршрут со страницы продавца не строится
 * (см. GreenMarketActionHandlers.ts).
 */
export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <GreenMarketRuntimeProvider handlers={createGreenMarketActionHandlers()}>
          <MapProjectionBridge />
          <BrowserRouter>
            <RuntimeRouteSync />
            <Screen>
              <NavigationContainer />
            </Screen>
          </BrowserRouter>
        </GreenMarketRuntimeProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
