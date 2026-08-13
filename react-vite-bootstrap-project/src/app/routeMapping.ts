import type { NavigationEntry, ScreenId } from "@/platform-core/navigation-runtime-layer/navigation/NavigationStack";

/**
 * Чистое отображение URL (pathname) ↔ NavigationEntry — используется
 * RuntimeRouteSync (мост GreenMarketRuntime ↔ react-router). Вынесено в
 * отдельный модуль, т.к. это чистые функции: их удобно тестировать, и файл
 * с React-компонентом остаётся «только компоненты» (react-refresh).
 *
 * ТЗ-024 §9–10: SellerCard/SellerList/ProductCard — контент Bottom Sheet
 * ПОВЕРХ карты-поверхности, а не страницы, поэтому у них НЕТ URL:
 * pathFromEntry для них возвращает null, и адресная строка остаётся /map
 * (Main — «Главный экран» панели). Deep-link на /seller/:id и /seller-list
 * больше не поддерживается — таких страниц не существует.
 */
const PATH_TO_SCREEN: Record<string, ScreenId> = {
  '/': 'Catalog',
  '/catalog': 'Catalog',
  '/map': 'Main',
};

const SCREEN_TO_PATH: Partial<Record<ScreenId, string>> = {
  Catalog: '/catalog',
  Main: '/map',
};

export function entryFromPath(pathname: string): NavigationEntry | null {
  const screen = PATH_TO_SCREEN[pathname];
  if (!screen) return null;
  return { screen, params: {} } as NavigationEntry;
}

export function pathFromEntry(entry: NavigationEntry): string | null {
  return SCREEN_TO_PATH[entry.screen] ?? null;
}

/** Экраны, которые рендерятся ПОВЕРХ карты-поверхности (ТЗ-024 §10): пока верх
 *  стека среди них — карта смонтирована (она за панелью), и построенный
 *  маршрут гасить не нужно. Используется RuntimeRouteSync (clearRoute при
 *  окончательном уходе с карты) — раньше ориентиром был экран «Map», которого
 *  в стеке больше нет. */
const MAP_SURFACE_SCREENS: ReadonlySet<ScreenId> = new Set([
  'Main',
  'SellerList',
  'SellerCard',
  'ProductCard',
  'Search',
]);

export function isMapSurfaceScreen(screen: ScreenId): boolean {
  return MAP_SURFACE_SCREENS.has(screen);
}
