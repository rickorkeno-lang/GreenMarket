/* ============================================================================
 * LocationRepository — контракт для работы с геопозицией через бэкенд.
 *
 * Два основных сценария:
 * 1. Запись позиции текущего пользователя (POST /location) — при включённой
 *    геолокации периодически отправляем координаты на сервер.
 * 2. Чтение позиции другого пользователя (GET /location) — для отображения
 *    позиции курьера/исполнителя на карте активного заказа.
 *
 * Интерфейс отделён от конкретной реализации (API/mock/cache) по аналогии
 * с SellerRepository: вызывающий код не знает, идёт запрос к бэкенду
 * или данные берутся из кэша.
 * ========================================================================== */

/** Режим записи геопозиции (POST /location). */
export type LocationWriteMode = 'point' | 'history';

/** Параметры записи геопозиции. */
export interface LocationWriteRequest {
  latitude: number;
  longitude: number;
  /** Дополнительные данные (опционально). */
  data?: Record<string, unknown>;
  /** Режим: point — текущая позиция, history — в историю. По умолчанию point. */
  mode?: LocationWriteMode;
}

/** Запись геопозиции пользователя. */
export interface LocationWriteResult {
  success: boolean;
}

/** Параметры чтения геопозиции (GET /location). */
export interface LocationReadRequest {
  /** ID пользователя, чью позицию запрашиваем. */
  userId: string;
  /** Вернуть текущую позицию (point). По умолчанию true. */
  point?: boolean;
  /** Вернуть историю позиций. По умолчанию false. */
  history?: boolean;
  /** Сервис-источник (опционально, для фильтрации по сервису). */
  service?: string;
}

/** Запись геопозиции пользователя (ответ backend). */
export interface UserPosition {
  userId: string;
  latitude: number;
  longitude: number;
  /** Время обновления позиции (ISO 8601 или Unix timestamp). */
  updatedAt: string | number;
}

/** Ответ на чтение позиции. */
export interface LocationReadResult {
  /** Текущая позиция (если point = true). */
  point: UserPosition | null;
  /** История позиций (если history = true). */
  history: UserPosition[];
}

/** Контракт репозитория геопозиции. */
export interface LocationRepository {
  /** Записать позицию текущего пользователя. */
  writeLocation(request: LocationWriteRequest): Promise<LocationWriteResult>;

  /** Получить позицию пользователя по ID. */
  readLocation(request: LocationReadRequest): Promise<LocationReadResult>;
}
