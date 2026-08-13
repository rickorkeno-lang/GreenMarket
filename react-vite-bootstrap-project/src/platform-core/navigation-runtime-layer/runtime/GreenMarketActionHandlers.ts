import type { ActionHandlers } from "./GreenMarketRuntime";

/* ============================================================================
 * Реальный обработчик бизнес-действий (ТЗ-022 требование 8). Подключается в
 * GreenMarketRuntimeProvider (см. src/app/App.tsx) вместо заглушки
 * createNoopActionHandlers: без него Action не превращаются в BusinessEvent —
 * и MapProjection не получает ROUTE_STARTED, поэтому маршрут со страницы
 * продавца никогда не строился (навигация на карту работала, а маршрут нет).
 *
 * Каждый Action из Action Catalog, имеющий бизнес-эффект, отображается здесь
 * на BusinessEvent. Действия без бизнес-события (чистая навигация) не трогаются.
 * ========================================================================== */
export function createGreenMarketActionHandlers(): ActionHandlers {
  return {
    handle(action) {
      switch (action.type) {
        case "START_ROUTE":
          return [{ type: "ROUTE_STARTED", payload: { sellerId: action.payload.sellerId } }];
        default:
          return undefined;
      }
    },
  };
}
