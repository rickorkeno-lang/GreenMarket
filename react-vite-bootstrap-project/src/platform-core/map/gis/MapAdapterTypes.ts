import type { MarketId, SellerId } from "@/platform-core/contracts/Action";
import type {
  CameraParams,
  GeoPoint,
  MapBounds,
  MarketMapRecord,
  RouteModel,
  SellerMapRecord,
} from "@/platform-core/map/viewmodels/MapViewModel";

export type CameraChangeReason = "move" | "zoom";

/** IMP-003.1 §3 / IMP-003.1.1 §2 / IMP-003.1.2 §3: контракт MapAdapter.
 *  MapScreenView знает только этот файл — ни один тип Leaflet/react-leaflet
 *  сюда не просачивается. Замена картографического движка = замена
 *  реализации ниже этого контракта, без изменения экрана.
 *
 *  `reason` в onCameraChange позволяет экрану диспатчить раздельные
 *  MoveMap/ZoomMap Runtime-события. `onVisibleBoundsChange` передаёт
 *  РЕАЛЬНЫЕ границы видимой области (не приближение через радиус) — экран
 *  запрашивает Repository именно по ним (IMP-003.1.2 §3 "Использовать
 *  текущие границы карты"). */
export interface MapAdapterProps {
  sellers: SellerMapRecord[];
  selectedSellerId: SellerId | null;
  /** Точки торговли в видимой области (задача «Маркеты»): пины рынков/лавок.
   *  Рисуются отдельным слоем (НЕ кластеризуются — точек мало, каждая важна). */
  markets: MarketMapRecord[];
  /** Выбранная точка торговли (открыт её попап) — пин подсвечивается. */
  selectedMarketId: MarketId | null;
  userLocation: GeoPoint | null;
  camera: CameraParams;
  /** Маршрут до выбранного продавца (MAP-020) — декодированная полилиния.
   *  null — маршрута нет (не запрашивался/убран). Реализация движка рисует
   *  его как ломаную от точки пользователя к продавцу. */
  route: RouteModel | null;
  /** MAP-027: Управляет видимостью встроенных в базовую карту точек (POI). */
  hideMapPois: boolean;
  onMapLoaded: () => void;
  onCameraChange: (camera: CameraParams, reason: CameraChangeReason) => void;
  onVisibleBoundsChange: (bounds: MapBounds) => void;
  onSellerSelect: (sellerId: SellerId) => void;
  /** Клик по пину точки торговли: открывает попап с продавцами точки. */
  onMarketSelect: (marketId: MarketId) => void;
  onMapBackgroundClick: () => void;
  /** Императивный доступ для FAB "центрировать карту" — не завязан на
   *  конкретный движок: реализация решает, что значит "центрировать". */
  centerRequestToken: number;
  /** Императивный запрос «показать весь маршрут» (MAP-020): инкрементируется
   *  всякий раз, когда на карте появился новый построенный маршрут. Реализация
   *  движка при смене токена подгоняет камеру так, чтобы весь маршрут был
   *  виден целиком (с запасом в один зум-уровень). 0 — маршрута нет/запрос
   *  ещё не поступал. */
  fitRouteRequestToken: number;
}
