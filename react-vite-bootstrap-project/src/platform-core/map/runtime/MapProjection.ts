import { useCallback } from "react";
import type { BusinessEvent } from "@/platform-core/contracts/BusinessEvent";
import { useBusinessEvents } from "@/platform-core/navigation-runtime-layer/hooks/useGreenMarketRuntime";
import { sellerRepository } from "@/platform-core/map/repository/repository";
import { MapRuntime } from "@/platform-core/map/runtime/MapRuntime";

/* ============================================================================
 * MapProjection (ТЗ-025 v1.1): единственный слой, переводящий BusinessEvent
 * в вызовы MapRuntime. Карточка продавца НЕ знает MapRuntime напрямую — она
 * диспатчит START_ROUTE, ActionHandlers эмитит ROUTE_STARTED, а этот проектор
 * строит маршрут.
 * ========================================================================== */

/** 
 * Чистая логика проекции (отделена от React для интеграционного тестирования).
 * Закрывает попап продавца и запускает построение маршрута через MapRuntime.
 */
export function handleMapProjectionEvent(
  event: BusinessEvent,
  mapRuntime = MapRuntime,
  repository = sellerRepository
): void {
  if (event.type !== "ROUTE_STARTED") return;
  const sellerId = event.payload.sellerId;
  if (!sellerId) return;

  // Маршрут создан со страницы продавца: окно «перейти на страницу продавца»
  // (Bottom Sheet с карточкой) на карте больше не нужно. Закрываем его
  // синхронно, ДО возврата на карту, — иначе при монтировании Map успел бы
  // показать карточку до прихода асинхронного маршрута.
  mapRuntime.dispatch({ type: "UNSELECT_SELLER" });

  // Продавец разрешается через SellerRepository (тот же единый
  // источник данных, что читает карточка): маршрут строится до правильной точки.
  // Продавец без координат (location === null, замечание №2) маршрут не строит —
  // requestRoute сам отбросит отсутствующую точку назначения. Ошибка сети не
  // роняет приложение (unhandled rejection): маршрут просто не строится, карта
  // остаётся в прежнем состоянии — без ложного маршрута.
  void repository
    .getSeller(sellerId)
    .then((seller) => {
      if (seller) mapRuntime.requestRoute({ kind: "seller", sellerId }, seller);
    })
    .catch(() => {});
}

/** React-обертка для подключения проекции к дереву приложения на уровне App Shell */
export function useMapProjection(): void {
  const handleBusinessEvent = useCallback((event: BusinessEvent) => {
    handleMapProjectionEvent(event);
  }, []);

  useBusinessEvents(handleBusinessEvent);
}
