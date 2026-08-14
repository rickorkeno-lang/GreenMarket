/** Сравнение двух nullable-расстояний (Upd-8: модель nullable backend-данных).
 *
 *  Правило: известное расстояние МЕНЬШЕ неизвестного; два неизвестных равны
 *  между собой. Следствие для сортировок по расстоянию: продавцы с
 *  distanceMeters = undefined уходят в КОНЕЦ списка — и не могут оказаться
 *  первыми «как будто рядом» (до исправления `?? 0` превращало неизвестное
 *  расстояние в 0 м и поднимало такого продавца наверх).
 *
 *  null трактуется как «неизвестно» (сравнение через == null) — та же
 *  конвенция, что у остального кода для nullable backend-полей (SellerStatus,
 *  MapSheetAdapter).
 */
export function compareDistanceMeters(
  a: number | undefined | null,
  b: number | undefined | null,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}
