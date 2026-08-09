import { asSellerId } from "@/platform-core/contracts/Action";
import type { NavigationEntry, ScreenId } from "@/platform-core/navigation-runtime-layer/navigation/NavigationStack";

/**
 * Чистое отображение URL (pathname) ↔ NavigationEntry — используется
 * RuntimeRouteSync (мост GreenMarketRuntime ↔ react-router). Вынесено в
 * отдельный модуль, т.к. это чистые функции: их удобно тестировать, и файл
 * с React-компонентом остаётся «только компоненты» (react-refresh).
 *
 * Важно: RuntimeRouteSync рендерится вне <Routes>, поэтому useParams()
 * недоступен — динамический сегмент /seller/:sellerId извлекается прямо из
 * pathname. Это же чинит deep-link: заход по /seller/seller-2 не должен
 * сбрасываться на /catalog.
 */
const PATH_TO_SCREEN: Record<string, ScreenId> = {
  '/': 'Catalog',
  '/catalog': 'Catalog',
  '/map': 'Map',
  '/seller-list': 'SellerList',
};

const SCREEN_TO_PATH: Partial<Record<ScreenId, string>> = {
  Catalog: '/catalog',
  Map: '/map',
  SellerList: '/seller-list',
};

export function entryFromPath(pathname: string): NavigationEntry | null {
  if (pathname.startsWith('/seller/')) {
    const sellerId = pathname.slice('/seller/'.length).replace(/\/+$/, '');
    if (!sellerId) return null;
    return { screen: 'SellerCard', params: { sellerId: asSellerId(sellerId) } };
  }
  const screen = PATH_TO_SCREEN[pathname];
  if (!screen) return null;
  return { screen, params: {} } as NavigationEntry;
}

export function pathFromEntry(entry: NavigationEntry): string | null {
  if (entry.screen === 'SellerCard') {
    return `/seller/${entry.params.sellerId}`;
  }
  return SCREEN_TO_PATH[entry.screen] ?? null;
}
