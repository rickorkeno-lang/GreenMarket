import { useCallback } from "react";
import type { BusinessEvent } from "@/platform-core/contracts/BusinessEvent";
import { useBusinessEvents } from "@/platform-core/navigation-runtime-layer/hooks/useGreenMarketRuntime";
import { sellerRepository } from "@/platform-core/map/repository/repository";
import { MapRuntime } from "@/platform-core/map/runtime/MapRuntime";

/* ============================================================================
 * MapProjection (ТЗ-025 v1.1): единственный слой, переводящий BusinessEvent
 * в вызовы MapRuntime. Карточка продавца НЕ знает MapRuntime напрямую — она
 * диспатчит START_ROUTE, ActionHandlers эмитит ROUTE_STARTED, а этот проектор
 * строит маршрут. Продавец разрешается через SellerRepository (тот же единый
 * источник данных, что читает карточка): маршрут строится до правильной точки
 * даже если продавца нет в видимой области карты.
 * ========================================================================== */
export function useMapProjection(): void {
  const handleBusinessEvent = useCallback((event: BusinessEvent) => {
    if (event.type !== "ROUTE_STARTED") return;
    const sellerId = event.payload.sellerId;
    if (!sellerId) return;
    // Маршрут создан со страницы продавца: окно «перейти на страницу продавца»
    // (Bottom Sheet с карточкой) на карте больше не нужно. Закрываем его
    // синхронно, ДО возврата на карту, — иначе при монтировании Map успел бы
    // показать карточку до прихода асинхронного маршрута. Маршрут от выбора не
    // зависит (см. MapRuntime#requestRoute), поэтому снятие выбора его не ломает.
    MapRuntime.dispatch({ type: "UNSELECT_SELLER" });
    void sellerRepository.getSeller(sellerId).then((seller) => {
      if (seller) MapRuntime.requestRoute({ kind: "seller", sellerId }, seller);
    });
  }, []);

  useBusinessEvents(handleBusinessEvent);
}
