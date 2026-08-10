import type { SellerMapRecord } from "@/platform-core/map/viewmodels/MapViewModel";

/* ============================================================================
 * История просмотра продавцов (seller-card → история на карте).
 *
 * Запись истории — снапшот продавца на момент просмотра + метка времени.
 * Снапшот намеренный (как у карточки сеанса в MapSessionStore): история — это
 * срез «что было просмотрено», актуальные данные (рейтинг, расстояние, часы
 * работы) показывает страница продавца при открытии из истории.
 * ========================================================================== */

export interface SellerHistoryEntry {
  seller: SellerMapRecord;
  viewedAt: number;
}

/** Максимум записей истории (последние просмотренные продавцы). */
export const SELLER_HISTORY_LIMIT = 20;

/** Добавление просмотра: существующая запись перемещается наверх с новым
 *  временем, новая — в начало; список усекается до SELLER_HISTORY_LIMIT.
 *  Чистая функция — её используют persistence (SellerHistoryStore) и тесты,
 *  порядок записей здесь единственный источник правды. */
export function upsertSellerHistory(
  history: SellerHistoryEntry[],
  seller: SellerMapRecord,
  viewedAt: number = Date.now(),
): SellerHistoryEntry[] {
  const without = history.filter((entry) => entry.seller.sellerId !== seller.sellerId);
  return [{ seller, viewedAt }, ...without].slice(0, SELLER_HISTORY_LIMIT);
}
