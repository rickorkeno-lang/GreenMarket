import type { SellerId, ProductId } from "@/platform-core/contracts/Action";
import type { CategoryId } from "@/platform-core/contracts/DomainTypes";

/* ============================================================================
 * NavigationStack — типизированный стек экранов Customer UI.
 *
 * Контекст: в BottomSheetDeclarative.tsx уже существует локальный
 * `StackEntry`/`EngineState.stack` (см. GreenMarketEngine), но он охватывает
 * только 5 старых экранов (main/search/options/seller/product) и завязан на
 * конкретный React-компонент. Модульные экраны (catalog/, basket/,
 * favorites/, product_card/, purchase_options/, search/, seller_catalog/) с
 * собственными ScreenDefinition (см. screens/*.ts) ни в какой стек не
 * собраны — этот файл закрывает именно этот пробел, не трогая существующий
 * BottomSheetDeclarative.tsx.
 *
 * ScreenId — доменные имена экранов, соответствуют файлам screens/*.ts
 * один-в-один (ScreenRegistry.ts — единственное место сопоставления имени
 * ScreenDefinition-объекту). ============================================ */

export type ScreenId =
  | "Catalog"
  | "Search"
  | "ProductCard"
  | "Basket"
  | "Favorites"
  | "PurchaseOptions"
  | "SellerCard"
  | "SellerCatalog"
  /* ТЗ-024: навигационный стек — это стек контента Bottom Sheet (панели
   * поверх карты), а НЕ стек страниц. Карта — корневая поверхность и в стек
   * НЕ входит (§10 «Карта не входит в стек»): экран Map как Navigation Entry
   * удалён. Main — «Главный экран» панели: дефолтный контент Bottom Sheet
   * поверх карты (секции продавцов/поиск/история). SellerCard/SellerList/
   * ProductCard — тоже контент панели, а не страницы (у них нет URL). */
  | "Main"
  | "SellerList";

/** Параметры каждого экрана — минимально необходимые для построения его
 *  ViewModel (Adapter/Builder уже существуют и их сигнатуры не меняются).
 *  Экраны без параметров используют `Record<string, never>`, а не
 *  `undefined`, чтобы `entry.params` было безопасно деструктурировать без
 *  дополнительной проверки на каждом месте использования. */
export interface ScreenParamsMap {
  Catalog: Record<string, never>;
  Search: Record<string, never>;
  ProductCard: { sellerId: SellerId; productId: ProductId };
  Basket: Record<string, never>;
  Favorites: Record<string, never>;
  PurchaseOptions: Record<string, never>;
  SellerCard: { sellerId: SellerId };
  SellerCatalog: { sellerId: SellerId; categoryId?: CategoryId };
  Main: Record<string, never>;
  SellerList: Record<string, never>;
}

export type NavigationEntry = {
  [K in ScreenId]: { screen: K; params: ScreenParamsMap[K] };
}[ScreenId];

export interface NavigationState {
  readonly stack: readonly NavigationEntry[];
}

/** Корневой экран навигации Customer UI — Catalog (GM-UX-008 §3: один из
 *  трёх главных экранов Stage 1). Совпадает с root-экраном в
 *  GreenMarketEngine (`"main"`), но выражен через модульный ScreenId. */
export const ROOT_ENTRY: NavigationEntry = { screen: "Catalog", params: {} };

export function createNavigationState(root: NavigationEntry = ROOT_ENTRY): NavigationState {
  return { stack: [root] };
}

/** Текущий (верхний) экран стека. Стек никогда не бывает пустым — push/pop
 *  это гарантируют, поэтому возвращаемое значение не nullable. */
export function currentEntry(state: NavigationState): NavigationEntry {
  return state.stack[state.stack.length - 1];
}

/** Переход вперёд — новый экран поверх текущего стека. Чистая функция:
 *  не мутирует переданное состояние, как и остальные функции модуля (тот же
 *  принцип, что в reducer'е useGreenMarketEngine). */
export function push(state: NavigationState, entry: NavigationEntry): NavigationState {
  return { stack: [...state.stack, entry] };
}

/** Действие "BACK" (contracts/Action.ts) — назад на один экран. Если стек
 *  уже содержит только корневой экран, состояние не меняется (совпадает с
 *  поведением case "BACK" в GreenMarketEngine). */
export function pop(state: NavigationState): NavigationState {
  if (state.stack.length <= 1) return state;
  return { stack: state.stack.slice(0, -1) };
}

/** Действие "GO_TO_MAIN" — полный сброс стека к корневому экрану. */
export function reset(_state: NavigationState, root: NavigationEntry = ROOT_ENTRY): NavigationState {
  return { stack: [root] };
}

/** true, если текущий экран — корневой (используется, например, чтобы
 *  скрыть кнопку "назад" — сама эта проверка допустима в UI, т.к. это
 *  чистое отображение состояния навигации, а не бизнес-решение,
 *  см. ТЗ-022 требование 4). */
export function isAtRoot(state: NavigationState): boolean {
  return state.stack.length <= 1;
}
