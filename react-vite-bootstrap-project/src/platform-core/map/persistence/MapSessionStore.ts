import { defaultMapConfig } from "@/platform-core/map/gis/MapConfig";
import type { SellerId } from "@/platform-core/contracts/Action";
import type { GeoPoint, SellerMapRecord } from "@/platform-core/map/viewmodels/MapViewModel";
import type { SellerFiltersState } from "@/platform-core/map/filters/SellerFilters";
import {
  SELLER_SEARCH_RADIUS_MAX_METERS,
  SELLER_SEARCH_RADIUS_MIN_METERS,
} from "@/platform-core/map/repository/SellerRepository";

/** Сохранённый между сеансами «сеанс карты» (см. MapSessionStore): позиция
 *  карты, фильтр, тексты полей ввода, мастер «Поиск продавцов» и открытая
 *  панель Bottom Sheet. Версия в ключе localStorage защищает от несовместимых
 *  форматов после изменения схемы — старая запись просто не читается.
 *
 *  Панели Bottom Sheet:
 *   - sellerSummary — карточка выбранного продавца; seller хранит снапшот
 *     данных карточки, чтобы она отрисовалась, даже если продавец вне
 *     видимой области карты (репозиторий её после перезагрузки не вернёт);
 *   - sellerSearchOrigin / sellerSearchResults — шаги мастера «Поиск
 *     продавцов»; точка и радиус лежат в sellerSearch, результаты при
 *     восстановлении перезапрашиваются (сырые данные не храним). */
export interface MapSessionSnapshot {
  /** Позиция карты: центр (WGS84) и масштаб. */
  viewport: { center: GeoPoint; zoom: number };
  /** Выбранные опции фильтра (groupId → optionId[]). */
  selectedFilters: SellerFiltersState;
  /** Текст строки поиска в шапке карты. */
  searchQuery: string;
  /** Текст поля радиуса мастера «Поиск продавцов» (что реально ввёл
   *  пользователь, включая «5,5»/недописанное значение). Каноническое число
   *  живёт в sellerSearch.radiusMeters; сюда дублируется для точного
   *  восстановления поля. */
  searchRadiusKm: string;
  /** Мастер «Поиск продавцов»: точка, подпись точки и последний радиус. */
  sellerSearch: {
    origin: GeoPoint | null;
    originLabel: string | null;
    radiusMeters: number;
  };
  /** Открытая панель Bottom Sheet (null — панель закрыта). */
  bottomSheet:
  | { type: "sellerSummary"; sellerId: SellerId; seller: SellerMapRecord | null }
  | { type: "sellerSearchOrigin" }
  | { type: "sellerSearchResults" }
  | null;
  /** MAP-027: Состояние переключателя скрытия POI (сохраняем выбор между сеансами). */
  hideMapPois: boolean;
}

const STORAGE_KEY = "gm.map.session.v1";

/** Периодическое сохранение сеанса (best-effort): MapScreenView подписан на
 *  изменения runtime и вызывает saveThrottled — пишем не чаще раза в интервал,
 *  а не на каждый moveend/SELLERS_LOADED. Троттлинг с trailing-записью:
 *  последний недописанный снапшот сохраняется по окончании интервала, чтобы
 *  закрытие вкладки внутри интервала не оставило в localStorage устаревшее
 *  состояние. Это страховка на случай, если сохранение при закрытии
 *  страницы/уходе с экрана не успеет выполниться; основное сохранение — там же
 *  (см. MapScreenView). */
const THROTTLE_SAVE_INTERVAL_MS = 2_000;

let lastThrottledSaveAt = 0;
/** Последний снапшот, не записанный из-за троттлинга (trailing-запись). Без
 *  него при закрытии вкладки внутри интервала в localStorage остался бы
 *  снапшот начала интервала (замечание ревью «теряется последнее изменение»). */
let pendingThrottledSnapshot: MapSessionSnapshot | null = null;
let pendingThrottledTimer: ReturnType<typeof setTimeout> | null = null;

/** СТОРОНА СОСТОЯНИЯ (замечание №1): Store — только сериализация/десериализация
 *  сеанса. Источником текущего состояния является MapRuntime (singleton,
 *  IMP-003.1.2 §8) — MapSessionStore НЕ хранит и НЕ кеширует снапшот (замечание
 *  №2): устаревший кеш отдал бы битые данные, если localStorage изменила другая
 *  вкладка или другой механизм persistence. load() всегда читает localStorage
 *  заново — getItem дешёв, а load() вызывается лишь при старте сеанса (runtime
 *  при создании + инициализация полей ввода экрана), оба читателя видят одну и
 *  ту же текущую запись. */

/** Доступ к localStorage без риска исключения в приватном режиме или
 *  окружении без DOM (npx tsx / Node): возвращает null, и сохранение молча
 *  пропускается — состояние карты не критично для работоспособности. */
function getStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Точка WGS84 с проверкой конечности и ужиманием координат в валидные
 *  пределы. null — не точка. */
function normalizePoint(value: unknown): GeoPoint | null {
  if (typeof value !== "object" || value === null) return null;
  const point = value as Record<string, unknown>;
  if (!isValidNumber(point.lat) || !isValidNumber(point.lng)) return null;
  return { lat: clamp(point.lat, -90, 90), lng: clamp(point.lng, -180, 180) };
}

/** Лёгкая проверка снапшота карточки продавца: полная валидация не нужна —
 *  это данные для отрисовки, важно лишь не сломать UI битыми полями. */
function isSellerSnapshot(value: unknown): value is SellerMapRecord {
  if (typeof value !== "object" || value === null) return false;
  const seller = value as Record<string, unknown>;
  return (
    typeof seller.sellerId === "string" &&
    typeof seller.name === "string" &&
    normalizePoint(seller.location) !== null
  );
}

/** Чистит фильтр от мусора: остаются только groupId → string[] (непустые). */
function normalizeFilters(value: unknown): SellerFiltersState {
  if (typeof value !== "object" || value === null) return {};
  const result: SellerFiltersState = {};
  for (const [groupId, optionIds] of Object.entries(value)) {
    if (Array.isArray(optionIds)) {
      const valid = optionIds.filter((id): id is string => typeof id === "string");
      if (valid.length > 0) result[groupId] = valid;
    }
  }
  return result;
}

/** Панель Bottom Sheet: неизвестный тип → null (панель закрыта). */
function normalizeBottomSheet(value: unknown): MapSessionSnapshot["bottomSheet"] {
  if (typeof value !== "object" || value === null) return null;
  const sheet = value as Record<string, unknown>;
  if (sheet.type === "sellerSummary") {
    const sellerId = typeof sheet.sellerId === "string" ? (sheet.sellerId as SellerId) : null;
    const seller = isSellerSnapshot(sheet.seller) ? sheet.seller : null;
    if (!sellerId) return null;
    return { type: "sellerSummary", sellerId, seller };
  }
  if (sheet.type === "sellerSearchOrigin") return { type: "sellerSearchOrigin" };
  if (sheet.type === "sellerSearchResults") return { type: "sellerSearchResults" };
  return null;
}

/** Проверка и нормализация прочитанной записи: битые/вырожденные значения
 *  отбрасываются или ужимаются в валидные пределы (координаты WGS84, zoom из
 *  MapConfig, радиус в разумном диапазоне). Если запись в целом не похожа на
 *  снапшот — null (экран стартует из начальных значений).
 *
 *  Экспортируется для прямого юнит-тестирования (чистая функция, не зависит
 *  от кеша load()). */
export function normalizeSnapshot(raw: unknown): MapSessionSnapshot | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const viewport = record.viewport as Record<string, unknown> | undefined;
  const center = normalizePoint(viewport?.center);
  if (!center || !isValidNumber(viewport?.zoom)) return null;
  const sellerSearch = (record.sellerSearch ?? {}) as Record<string, unknown>;
  return {
    viewport: {
      center,
      zoom: clamp(viewport.zoom, defaultMapConfig.minZoom, defaultMapConfig.maxZoom),
    },
    selectedFilters: normalizeFilters(record.selectedFilters),
    searchQuery: typeof record.searchQuery === "string" ? record.searchQuery.slice(0, 300) : "",
    searchRadiusKm:
      typeof record.searchRadiusKm === "string"
        ? record.searchRadiusKm.slice(0, 20)
        : typeof sellerSearch.radiusMeters === "number" && Number.isFinite(sellerSearch.radiusMeters)
          ? String(sellerSearch.radiusMeters / 1000)
          : "5",
    sellerSearch: {
      origin: normalizePoint(sellerSearch.origin),
      originLabel: typeof sellerSearch.originLabel === "string" ? sellerSearch.originLabel.slice(0, 200) : null,
      radiusMeters: isValidNumber(sellerSearch.radiusMeters)
        ? clamp(sellerSearch.radiusMeters, SELLER_SEARCH_RADIUS_MIN_METERS, SELLER_SEARCH_RADIUS_MAX_METERS)
        : 5_000,
    },
    bottomSheet: normalizeBottomSheet(record.bottomSheet),
    hideMapPois: typeof record.hideMapPois === "boolean" ? record.hideMapPois : false,
  };
}

export const MapSessionStore = {
  /** Восстановление сохранённого сеанса карты. null — записи нет или она
   *  повреждена (экран стартует из начальных значений). Всегда читает
   *  localStorage заново — кеша нет (см. комментарий выше), поэтому внешние
   *  изменения записи (другая вкладка, другой механизм persistence) видны
   *  сразу, а не по прошествии сеанса. */
  load(): MapSessionSnapshot | null {
    const storage = getStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? normalizeSnapshot(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },

  /** Полная запись текущего сеанса. Основной канал — закрытие страницы
   *  (pagehide/beforeunload) и уход с экрана карты; при недоступном
   *  хранилище молча пропускается. */
  save(snapshot: MapSessionSnapshot): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Хранилище переполнено/заблокировано — пропускаем.
    }
  },

  /** Периодическое сохранение во время сеанса (см. THROTTLE_SAVE_INTERVAL_MS):
   *  поддерживает снапшот актуальным, даже если закрытие страницы не
   *  наступит, не дёргая localStorage на каждый moveend. Вызывается из
   *  подписки на изменения runtime в MapScreenView.
   *
   *  Троттлинг с trailing-записью: ведущий вызов пишет сразу, вызовы внутри
   *  интервала запоминают последний снапшот, который пишется по окончании
   *  интервала. Иначе быстрое перемещение карты внутри окна теряло последнее
   *  состояние (в localStorage остался бы снапшот начала окна). */
  saveThrottled(snapshot: MapSessionSnapshot): void {
    pendingThrottledSnapshot = snapshot;
    if (pendingThrottledTimer !== null) return;
    const now = Date.now();
    const elapsed = now - lastThrottledSaveAt;
    if (elapsed >= THROTTLE_SAVE_INTERVAL_MS) {
      lastThrottledSaveAt = now;
      pendingThrottledSnapshot = null;
      this.save(snapshot);
      return;
    }
    pendingThrottledTimer = setTimeout(() => {
      pendingThrottledTimer = null;
      if (pendingThrottledSnapshot) {
        lastThrottledSaveAt = Date.now();
        this.save(pendingThrottledSnapshot);
        pendingThrottledSnapshot = null;
      }
    }, THROTTLE_SAVE_INTERVAL_MS - elapsed);
  },
};
