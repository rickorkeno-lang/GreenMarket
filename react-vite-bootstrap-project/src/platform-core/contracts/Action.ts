import type { CategoryId } from "./DomainTypes";

/* ============================================================================
 * ОБЩИЕ ИДЕНТИФИКАТОРЫ ПРЕДМЕТНОЙ ОБЛАСТИ
 * Строковые id намеренно brand-типизированы (branded types), чтобы TS не
 * позволял случайно передать productId туда, где ожидается sellerId, и т.п.
 * ========================================================================== */
export type SellerId = string & { readonly __brand: "SellerId" };
export type ProductId = string & { readonly __brand: "ProductId" };
export type OptionId = string & { readonly __brand: "OptionId" };
export const asSellerId = (id: string): SellerId => id as SellerId;
export const asProductId = (id: string): ProductId => id as ProductId;
export const asOptionId = (id: string): OptionId => id as OptionId;

export type SheetHeight = "Hidden" | "Collapsed" | "Half" | "Expanded";

/* ============================================================================
 * ACTION CATALOG (типизированный) — намерение пользователя, Bottom Sheet → Engine.
 * Discriminated union: TS требует, чтобы switch по action.type в редьюсере был
 * исчерпывающим (см. assertNever в BottomSheetDeclarative.tsx) — забытый case
 * подсвечивается на этапе компиляции, а не после релиза.
 *
 * Доменный контракт, не привязан к конкретному экрану: любой будущий экран
 * Customer UI dispatch'ит те же Action и импортирует их отсюда, а не из
 * BottomSheetDeclarative.tsx.
 * ========================================================================== */
export type Action =
  | { type: "OPEN_SEARCH" }
  | { type: "SET_SEARCH_QUERY"; payload: { query: string } }
  | { type: "PICK_PURCHASE" }
  | { type: "SELECT_PURCHASE_OPTION"; payload: { optionId: OptionId } }
  | { type: "OPEN_SELLER"; payload: { sellerId: SellerId } }
  | { type: "OPEN_PRODUCT"; payload: { sellerId: SellerId; productId: ProductId } }
  | { type: "ADD_PRODUCT"; payload: { sellerId: SellerId; productId: ProductId } }
  | { type: "REPLACE_PRODUCT"; payload: { sellerId: SellerId; productId: ProductId } }
  | { type: "START_ROUTE" }
  | { type: "TOGGLE_FAVORITE_SELLER"; payload: { sellerId: SellerId } }
  | { type: "BACK" }
  | { type: "GO_TO_MAIN" }
  | { type: "SET_SHEET_HEIGHT"; payload: { height: SheetHeight } }
  | { type: "TOGGLE_OTHER_PRODUCTS"; payload: { sellerId: SellerId } }
  | { type: "REPORT_MISSING_PRODUCT"; payload: { sellerId: SellerId } }
  | { type: "REPORT_PRICE_CHANGE"; payload: { sellerId: SellerId } }
  | { type: "SHARE_SELLER"; payload: { sellerId: SellerId } }
  | { type: "RETRY_SELLER_LOAD"; payload: { sellerId: SellerId } }
  | { type: "ADD_TO_BASKET"; payload: { sellerId: SellerId; productId: ProductId } }
  | { type: "REMOVE_FROM_BASKET"; payload: { sellerId: SellerId; productId: ProductId } }
  | { type: "SHOW_ON_MAP"; payload: { sellerId: SellerId; productId: ProductId } }
  | { type: "CHANGE_QUANTITY"; payload: { sellerId: SellerId; productId: ProductId; quantity: number } }
  | { type: "CLOSE_SCREEN" }
  | { type: "SEARCH"; payload: { query: string } }
  | { type: "RETRY_SEARCH" }
  | { type: "SELECT_CATEGORY"; payload: { sellerId: SellerId; categoryId: CategoryId } }
  | { type: "REFRESH_CATALOG"; payload: { sellerId: SellerId } }
  | { type: "REFRESH_BASKET" }
  | { type: "START_PURCHASE" }
  | { type: "REMOVE_FROM_FAVORITES"; payload: { sellerId: SellerId; productId: ProductId } }
  | { type: "REFRESH_FAVORITES" }
  /* --------------------------------------------------------------------
   * IMP-003.1 / AR-003 (экран Map). ChangeMapMode сознательно НЕ добавлен —
   * AR-003 явно исключает его из Stage 1 (переносится на этап с несколькими
   * режимами отображения карты). OPEN_MAP добавлен как единственный способ
   * попасть на Map из Catalog (диаграмма навигации AR-003); OPEN_SELLER уже
   * существует в каталоге и переиспользуется как "OpenSellerCard".
   * -------------------------------------------------------------------- */
  | { type: "OPEN_MAP" }
  | { type: "MAP_LOADED" }
  | { type: "MOVE_MAP"; payload: { center: { lat: number; lng: number }; zoom: number } }
  | { type: "ZOOM_MAP"; payload: { zoom: number } }
  | { type: "CENTER_ON_USER" }
  | { type: "SELECT_SELLER"; payload: { sellerId: SellerId } }
  | { type: "UNSELECT_SELLER" }
  | { type: "OPEN_SELLER_LIST" }
  | { type: "OPEN_CATALOG" }
  /* --------------------------------------------------------------------
   * «Поиск продавцов» (MAP-053/MAP-018): действия шага выбора точки поиска
   * в окне Bottom Sheet. Возникают как ContentBlock-действия строк «Моё
   * местоположение» / «Положение на карте» и обрабатываются экраном Map
   * (MapScreenView.handleBlockAction) — глобальный Runtime их не трогает.
   * -------------------------------------------------------------------- */
  | { type: "SEARCH_ORIGIN_MY_LOCATION" }
  | { type: "SEARCH_ORIGIN_MAP_CENTER" }
  /* --------------------------------------------------------------------
   * Маршрут до продавца на карте (MAP-020) НЕ является ContentBlock-действием:
   * кнопок маршрута в карточке продавца нет (см. MapSheetAdapter), а
   * построение/удаление маршрута живёт в MapRuntime — «Маршрут» на странице
   * продавца вызывает MapRuntime#requestRoute, «Убрать маршрут» в углу карты —
   * MapRuntime#clearRoute. */
  ;

export type ActionType = Action["type"];
