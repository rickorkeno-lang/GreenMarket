/* ============================================================================
 * OfflineCacheStore — persistence offline-кэша карты и продавцов (MAP-038).
 *
 * По образцу MapSessionStore/SellerHistoryStore: Store — только
 * сериализация/десериализация (localStorage, один версионированный ключ,
 * записи с временем сохранения). Содержимое — доменные записи репозитория
 * (MarketMapRecord/MarketSellerRecord/SellerMapRecord/SellerCardViewModel/
 * SellerProductRecord), сериализуемые как есть; фото — URL, а не блобы,
 * поэтому объём записи мал и 5 МБ localStorage не упирается.
 *
 * Кэш пишется при каждом успешном ответе бэкенда (write-through) и
 * читается только как fallback, когда сеть недоступна (см. CachedSellerRepository).
 * В отличие от MapSessionStore здесь кэш хранит данные, а не состояние сеанса,
 * поэтому API чуть другой (read/write/remove/clear по ключу).
 * ========================================================================== */

const STORAGE_KEY = 'gm.map.offline-cache.v1';

interface CacheEntry {
  savedAt: number;
  value: unknown;
}

type CacheRecord = Record<string, CacheEntry>;

/** Доступ к localStorage без риска исключения в приватном режиме или
 *  окружении без DOM (npx tsx / Node): возвращает null, запись молча
 *  пропускается — оффлайн-кэш не критичен для работы онлайн. */
function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Разбор и нормализация сырой записи: пропускаются битые/чужие ключи
 *  (нет времени сохранения или значения), остальное — как есть. Экспортируется
 *  для прямого юнит-тестирования (чистая функция, не зависит от localStorage). */
export function normalizeCacheRecord(raw: unknown): CacheRecord {
  if (typeof raw !== 'object' || raw === null) return {};
  const record = raw as Record<string, unknown>;
  const result: CacheRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== 'object' || value === null) continue;
    const entry = value as Record<string, unknown>;
    if (typeof entry.savedAt === 'number' && Number.isFinite(entry.savedAt) && 'value' in entry) {
      result[key] = { savedAt: entry.savedAt, value: entry.value };
    }
  }
  return result;
}

function readRecord(): CacheRecord {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return normalizeCacheRecord(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

function writeRecord(record: CacheRecord): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Хранилище переполнено/заблокировано — пропускаем.
  }
}

export const OfflineCacheStore = {
  /** Значение по ключу. null — записи нет (значения null не кэшируются —
   *  см. CachedSellerRepository#getSeller: «продавец не найден» не пишется). */
  read<T>(key: string): T | null {
    const entry = readRecord()[key];
    return entry ? (entry.value as T) : null;
  },

  /** Запись значения с текущим временем сохранения (для диагностики/будущего
   *  TTL; сейчас fallback отдаёт кэш при недоступности сети независимо от
   *  свежести — устаревшие реальные данные лучше пустого экрана ошибки). */
  write<T>(key: string, value: T): void {
    const record = readRecord();
    record[key] = { savedAt: Date.now(), value };
    writeRecord(record);
  },

  /** Удаление записи (инвалидация: 4xx с бэкенда, «продавец не найден»). */
  remove(key: string): void {
    const record = readRecord();
    if (!(key in record)) return;
    delete record[key];
    writeRecord(record);
  },

  /** Полная очистка кэша (тесты, сброс данных). */
  clear(): void {
    writeRecord({});
  },
};
