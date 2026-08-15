import type { SellerMapRecord } from "@/platform-core/map/viewmodels/MapViewModel";
import {
  SELLER_HISTORY_LIMIT,
  upsertSellerHistory,
  type SellerHistoryEntry,
} from "@/platform-core/map/history/SellerHistory";

/* ============================================================================
 * SellerHistoryStore — persistence истории просмотра продавцов.
 *
 * По образцу MapSessionStore: Store — только сериализация/десериализация
 * (localStorage, отдельный ключ от сеанса карты — история живёт дольше сеанса
 * и пишется со страницы продавца, а не из карты). История отделена от
 * MapSessionStore, потому что «сеанс карты» — это позиция/фильтр/панель, а
 * история — независимые пользовательские данные со своим жизненным циклом.
 *
 * Источником списка является сам store: MapRuntime (карта) и контроллер
 * страницы продавца читают его напрямую; версия в ключе защищает от
 * несовместимых форматов после изменения схемы.
 * ========================================================================== */

const STORAGE_KEY = "gm.map.seller-history.v2";

/** Доступ к localStorage без риска исключения в приватном режиме или
 *  окружении без DOM (npx tsx / Node): возвращает null, сохранение молча
 *  пропускается — история не критична для работоспособности. */
function getStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Лёгкая проверка снапшота продавца: полная валидация не нужна — это
 *  данные для отрисовки, важно лишь не сломать UI битыми полями. */
function isSellerSnapshot(value: unknown): value is SellerMapRecord {
  if (typeof value !== "object" || value === null) return false;
  const seller = value as Record<string, unknown>;
  return (
    typeof seller.sellerId === "string" &&
    typeof seller.name === "string" &&
    typeof seller.location === "object" &&
    seller.location !== null
  );
}

/** Нормализация прочитанной записи: отбрасываем битые записи, сортируем по
 *  убыванию времени просмотра (свежие сверху) и усекаем до лимита.
 *  Экспортируется для прямого юнит-тестирования (чистая функция). */
export function normalizeHistory(raw: unknown): SellerHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: SellerHistoryEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (!isSellerSnapshot(record.seller)) continue;
    // Битые записи без времени просмотра (viewedAt всегда > 0) отбрасываются.
    const viewedAt = record.viewedAt;
    if (typeof viewedAt !== "number" || !Number.isFinite(viewedAt) || viewedAt <= 0) continue;
    entries.push({ seller: record.seller, viewedAt });
  }
  entries.sort((a, b) => b.viewedAt - a.viewedAt);
  return entries.slice(0, SELLER_HISTORY_LIMIT);
}

export const SellerHistoryStore = {
  /** Текущий список истории, свежие просмотры сверху. Всегда читает
   *  localStorage заново — кеша нет (как в MapSessionStore), поэтому запись
   *  со страницы продавца видна карте сразу после возврата на неё. */
  load(): SellerHistoryEntry[] {
    const storage = getStorage();
    if (!storage) return [];
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? normalizeHistory(JSON.parse(raw)) : [];
    } catch {
      return [];
    }
  },

  /** Запись просмотра продавца: upsert в начало списка (см.
   *  upsertSellerHistory), запись целиком в localStorage. При недоступном
   *  хранилище молча пропускается. */
  record(seller: SellerMapRecord): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      const next = upsertSellerHistory(this.load(), seller);
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Хранилище переполнено/заблокировано — пропускаем.
    }
  },
};
