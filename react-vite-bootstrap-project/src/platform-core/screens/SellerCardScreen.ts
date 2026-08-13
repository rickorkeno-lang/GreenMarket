import type { ScreenDefinition } from "./ScreenDefinition";
import type { SellerCardViewModel } from "../viewmodels/SellerCardViewModel";
import { SellerCardBuilder } from "../builders/SellerCardBuilder";

/** Определение экрана «Карточка продавца» — только связывание ViewModel,
 *  Builder'а и списка поддерживаемых Action. Бизнес-логики здесь нет.
 *
 *  Список действий взят из фактически используемых в BottomSheetDeclarative.tsx
 *  для этого экрана (кнопки availableActions + действия строк, которые
 *  формирует SellerCardAdapter): START_ROUTE/TOGGLE_FAVORITE_SELLER/
 *  REPORT_MISSING_PRODUCT — кнопки; OPEN_PRODUCT/TOGGLE_OTHER_PRODUCTS/
 *  RETRY_SELLER_LOAD — действия из содержимого карточки; BACK/GO_TO_MAIN —
 *  универсальная навигация Bottom Sheet; OPEN_SELLER — переход на страницу
 *  другого продавца из блока «Похожие продавцы» (SellerCardScreenView).
 *  START_ROUTE (MAP-020, ТЗ-025 v1.1) — «Маршрут»: карточка диспатчит Action,
 *  маршрут строит MapProjection (Action → ROUTE_STARTED), а возврат на карту —
 *  навигационный эффект Action'а в GreenMarketRuntime#applyNavigation
 *  (ТЗ-024 §10: карта — корневая поверхность вне стека, START_ROUTE
 *  закрывает панель и возвращает Bottom Sheet к Main, за которым карта уже
 *  смонтирована), поэтому отдельный OPEN_MAP с этого экрана не нужен.
 *
 *  ТЗ-024 §10: карточка — контент Bottom Sheet поверх карты (MapSurface),
 *  а не страница: у неё нет URL, и она не размонтирует карту.
 *
 *  REPORT_PRICE_CHANGE и SHARE_SELLER есть в общем Action Catalog
 *  (contracts/Action.ts), но пока нигде не диспатчатся с этого экрана —
 *  намеренно не включены, чтобы список отражал реально поддерживаемое,
 *  а не потенциально возможное. */
export const SellerCardScreen: ScreenDefinition<SellerCardViewModel> = {
  builder: SellerCardBuilder,
  availableActions: [
    "START_ROUTE",
    "TOGGLE_FAVORITE_SELLER",
    "REPORT_MISSING_PRODUCT",
    "OPEN_PRODUCT",
    "TOGGLE_OTHER_PRODUCTS",
    "RETRY_SELLER_LOAD",
    "BACK",
    "GO_TO_MAIN",
    "OPEN_SELLER",
  ] as const,
};
