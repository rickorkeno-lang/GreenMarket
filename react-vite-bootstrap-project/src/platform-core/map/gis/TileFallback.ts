/** Порог ошибок тайлов подряд (без ни одной успешной загрузки) для переключения
 *  на резервного провайдера (MAP-036). 6 — бурст: при полном отказе провайдера
 *  ошибки летят пачками (по всем тайлам вьюпорта); одиночный 404 отдельного
 *  тайла при нормальной работе сбрасывается успешными загрузками соседей и
 *  порог не достигает. */
export const TILE_ERROR_THRESHOLD = 6;

/** Чистая логика решения «переключиться на резервного провайдера тайлов»
 *  (MAP-036), отделённая от React/Leaflet, чтобы её можно было покрыть
 *  юнит-тестами. Провайдер считается недоступным, только если ПОДРЯД (без
 *  единой успешной tileload) произошло TILE_ERROR_THRESHOLD ошибок; любая
 *  успешная загрузка сбрасывает счётчик. Переключение однонаправленное (armed):
 *  обратно на основной провайдер в рамках сессии не возвращаемся, чтобы не
 *  «мигать» при нестабильном соединении. */
export interface TileFallbackTracker {
  /** Ошибка загрузки тайла. Возвращает true, когда фолбэк нужно применить
   *  (порог достигнут и ещё не применялся); далее всегда false. */
  onTileError(): boolean;
  /** Успешная загрузка тайла: сбрасывает счётчик ошибок (провайдер жив). */
  onTileLoad(): void;
  /** Сброс (например, смена базового провайдера тайлов): фолбэк может
   *  сработать заново. */
  reset(): void;
  /** Фолбэк уже применён. */
  isArmed(): boolean;
}

export function createTileFallbackTracker(threshold: number = TILE_ERROR_THRESHOLD): TileFallbackTracker {
  let errorsSinceLastLoad = 0;
  let armed = false;
  return {
    onTileError(): boolean {
      if (armed) return false;
      errorsSinceLastLoad += 1;
      if (errorsSinceLastLoad >= threshold) {
        armed = true;
        return true;
      }
      return false;
    },
    onTileLoad(): void {
      if (!armed) errorsSinceLastLoad = 0;
    },
    reset(): void {
      errorsSinceLastLoad = 0;
      armed = false;
    },
    isArmed(): boolean {
      return armed;
    },
  };
}
