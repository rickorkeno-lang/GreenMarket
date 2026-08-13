import type { ScreenDefinition } from "./ScreenDefinition";
import type { MapViewModel } from "@/platform-core/map/viewmodels/MapViewModel";
import { MapBuilder } from "@/platform-core/map/builders/MapBuilder";

/** Определение экрана «Main» — «Главный экран» Bottom Sheet ПОВЕРХ карты
 *  (ТЗ-024: стек — это стек контента панели; карта — корневая поверхность,
 *  вне стека, экрана Map как Navigation Entry нет). Список действий — ровно
 *  события Runtime из IMP-003.1 §9, плюс переходы из AR-003 (OPEN_SELLER
 *  переиспользован как "OpenSellerCard", OPEN_SELLER_LIST/OPEN_CATALOG —
 *  открытие контента панели / выход, BACK/CLOSE_SCREEN — общие для всех
 *  экранов). ChangeMapMode сознательно не включён — исключён AR-003 из
 *  Stage 1. Builder — тот же MapBuilder: Main собирает блоки секций/поиска
 *  в собственный Bottom Sheet экрана карты (MapRuntime.bottomSheet). */
export const MainScreen: ScreenDefinition<MapViewModel> = {
  builder: MapBuilder,
  availableActions: [
    "MAP_LOADED",
    "MOVE_MAP",
    "ZOOM_MAP",
    "CENTER_ON_USER",
    "SELECT_SELLER",
    "UNSELECT_SELLER",
    "OPEN_SELLER",
    "OPEN_SELLER_LIST",
    "OPEN_CATALOG",
    "OPEN_SEARCH",
    "BACK",
    "CLOSE_SCREEN",
  ] as const,
};
