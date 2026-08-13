import type { CategoryId } from "./DomainTypes";

/* ============================================================================
 * ОБЩИЕ ИДЕНТИФИКАТОРЫ ПРЕДМЕТНОЙ ОБЛАСТИ
 * Строковые id намеренно brand-типизированы (branded types), чтобы TS не
 * позволял случайно передать productId туда, где ожидается sellerId, и т.п.
 * ========================================================================== */
export type SellerId = string & { readonly __brand: "SellerId" };
export type ProductId = string & { readonly __brand: "ProductId" };
export type OptionId = string & { readonly __brand: "OptionId" };
/** Идентификатор точки торговли (рынок/лавка) — «market-N». Отдельный brand от
 *  SellerId: маркет — это место, к которому привязаны продавцы (см. задачу
 *  «Маркеты», GET /api/v1/catalog/markets), а не сам продавец. */
export type MarketId = string & { readonly __brand: "MarketId" };
export const asSellerId = (id: string): SellerId => id as SellerId;
export const asProductId = (id: string): ProductId => id as ProductId;
export const asOptionId = (id: string): OptionId => id as OptionId;
export const asMarketId = (id: string): MarketId => id as MarketId;

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
  | { type: "START_ROUTE"; payload: { sellerId: SellerId } }
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
   * Маркеты (задача «Маркеты», GET /api/v1/catalog/markets): действия попапа
   * точки торговли в Bottom Sheet карты. START_MARKET_ROUTE — «Построить
   * маршрут» до точки (MapRuntime#requestRoute с target { kind: "market" }),
   * RETRY_MARKET_SELLERS — «Повторить» при ошибке загрузки продавцов точки.
   * Оба обрабатываются экраном Map (MapScreenView.handleBlockAction), как
   * SEARCH_ORIGIN_*: глобальный Runtime про них не знает (навигации нет).
   * -------------------------------------------------------------------- */
  | { type: "START_MARKET_ROUTE"; payload: { marketId: MarketId } }
  | { type: "RETRY_MARKET_SELLERS"; payload: { marketId: MarketId } }
  /* --------------------------------------------------------------------
   * Маршрут до продавца на карте (MAP-020). «Маршрут» на странице продавца
   * диспатчит START_ROUTE { sellerId } (ТЗ-025: карточка не управляет картой
   * напрямую — Action → ActionHandlers → BusinessEvent ROUTE_STARTED →
   * MapProjection → MapRuntime#requestRoute; навигационный эффект «на карту»
   * в GreenMarketRuntime#applyNavigation). «Убрать маршрут» в углу карты —
   * MapRuntime#clearRoute. */
  ;

export type ActionType = Action["type"];
