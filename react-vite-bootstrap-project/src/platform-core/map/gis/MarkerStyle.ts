import type { MarketId, SellerId } from "@/platform-core/contracts/Action";

/* ============================================================================
 * MarkerStyle — MAP-026. Чистая фабрика HTML/геометрии маркеров продавцов.
 *
 * Модуль НЕ импортирует "leaflet": вся работа здесь — построение строки
 * разметки DivIcon и числовых метрик (размер контейнера, якорь, масштабы),
 * поэтому его можно юнит-тестировать в Node (npx tsx ...). LeafletAdapter
 * остаётся единственным файлом, который импортирует "leaflet": он оборачивает
 * результат MarkerStyle в L.divIcon.
 *
 * Разделение ответственности:
 *   MarkerStyle        — «как выглядит маркер» (структура HTML + размеры,
 *                        зависящие от масштаба; классы/стили — в map.css);
 *   map.css            — «как маркер оформлен» (токены темы, hover, анимации);
 *   LeafletAdapter     — «как маркер попадает на карту» (L.divIcon, кластеры).
 *
 * Классы разметки (.gm-map-marker*, .gm-map-cluster*) — общий контракт между
 * этой фабрикой и стилями src/screens/map/map.css; данные для тестов
 * (data-testid/data-seller-id) сохраняются неизменными.
 * ========================================================================== */

/** Состояние продавца, влияющее на цвет/акцент точки. */
export type SellerMarkerState = "selected" | "available" | "disabled";

/** Сопоставление доменных флагов (выбран / доступен) с состоянием маркера.
 *  Выбор приоритетнее доступности: выбранная точка всегда акцентная, даже
 *  если продавец сейчас закрыт. */
export function sellerMarkerState(selected: boolean, available: boolean): SellerMarkerState {
  if (selected) return "selected";
  return available ? "available" : "disabled";
}

/** Дополнительное усиление ореола на крупных масштабах (GM-UX-001): на
 *  zoom 16–19 свечение растёт быстрее базовой формулы (множитель 1 на всех
 *  остальных масштабах — без изменений). Чем ближе к предельному zoom 19
 *  (максимум тайлов OSM), тем заметнее ореол, чтобы точки не терялись. */
const GLOW_BOOST_BY_ZOOM: Record<number, number> = {
  16: 1.25,
  17: 1.5,
  18: 1.75,
  19: 2,
};

/** Масштаб свечения точки на разных уровнях зума (GM-UX-001): база 1 на
 *  дефолтном zoom 13, плавный рост при приближении (до ×4), почти исчезает
 *  при отдалении (0.3), чтобы разрозненные точки не сливались в пятно.
 *  Boost на zoom 16–19 применяется ПОСЛЕ базового зажима (не больше 4) и без
 *  него не больше исходной формулы. Значение попадает в CSS-переменную
 *  --gm-glow-scale, а кольца/размытие вычисляются в map.css через calc(). */
export function glowScale(zoom: number): number {
  const boost = GLOW_BOOST_BY_ZOOM[zoom] ?? 1;
  return Math.max(0.3, Math.min(4, 1 + (zoom - 13) * 0.6)) * boost;
}

/** Плавный рост РАЗМЕРА точки при приближении: от ×1.0 на zoom ≤ 13 до ×1.3
 *  на maxZoom. Управляется отдельно от свечения: точка остаётся близкой к
 *  базовому размеру на отдалении (чтобы не мельчать), а на предельном зуме
 *  становится заметно крупнее — вместе с усиленным ореолом. */
export function dotScale(zoom: number): number {
  return Math.max(1, Math.min(1.3, 1 + (zoom - 13) * 0.04));
}

/** Базовый диаметр точки (px) в зависимости от состояния. */
export function dotSizeForState(state: SellerMarkerState): number {
  return state === "selected" ? 20 : 14;
}

/** Поле вокруг точки в контейнере DivIcon (px с каждой стороны) — удобная
 *  зона клика/hover: маленькая точка (14px) не должна требовать снайперского
 *  попадания. Не слишком большое, чтобы не перекрывать клики соседних
 *  маркеров (при maxClusterRadius = 20px непрокластеризованные точки редко
 *  ближе 20px друг к другу). */
const DOT_HIT_PADDING = 6;

/** Метрики контейнера DivIcon маркера продавца. size/iconSize — размер
 *  контейнера, anchor/iconAnchor — точка привязки к координате (центр точки),
 *  dotSize — видимый диаметр точки (в JSX встаёт как inline width/height).
 *
 *  Геометрия НЕ зависит от zoom (ранее dotSize менялся с масштабом):
 *  zoom-зависимая визуализация (рост точки и свечения при приближении)
 *  переехала в CSS-переменные --gm-dot-scale/--gm-glow-scale, которые
 *  LeafletAdapter выставляет на контейнере карты. Почему это важно:
 *   - якорь контейнера всегда в точности совпадает с визуальным центром
 *     точки (контейнер чётный → деление пополам без округления), поэтому
 *     маркер «стоит» ровно на своих lat/lng на любом масштабе — маршрут
 *     всегда приходит точно в точку;
 *   - разметка/метрики иконки больше не меняются при зуммах, иконка
 *     кэшируется (см. LeafletAdapter.sellerDivIcon) и не пересоздаётся при
 *     каждом движении камеры — у MarkerClusterGroup не сбиваются внутренние
 *     bounds, маркеры не пропадают и не «прыгают», подписи не мигают. */
export interface SellerIconMetrics {
  size: [number, number];
  anchor: [number, number];
  dotSize: number;
}

export function sellerIconMetrics(state: SellerMarkerState): SellerIconMetrics {
  const dotSize = dotSizeForState(state);
  const container = dotSize + DOT_HIT_PADDING * 2;
  const half = container / 2;
  return { size: [container, container], anchor: [half, half], dotSize };
}

/** HTML-экранирование значений, попадающих в разметку DivIcon (имена и id
 *  продавцов приходят из Repository). Указание №58: подпись создаётся только
 *  здесь и всегда экранируется — капсула безопасна при любых символах. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Разметка DivIcon отдельного маркера продавца (MAP-067/MAP-026).
 *  Структура: подпись-капсула + точка. Подпись абсолютно позиционируется
 *  поверх точки в map.css (bottom: 100%), клики идут только на точку
 *  (label pointer-events: none). Модификаторы состояния (--selected/--disabled)
 *  стилизуются в map.css через токены темы. */
export function buildSellerMarkerHtml(
  name: string,
  sellerId: SellerId,
  state: SellerMarkerState,
  metrics: SellerIconMetrics,
): string {
  const safeName = escapeHtml(name);
  const safeId = escapeHtml(sellerId);
  const dotState =
    state === "selected"
      ? " gm-map-marker__dot--selected"
      : state === "disabled"
        ? " gm-map-marker__dot--disabled"
        : "";
  const labelSelected = state === "selected" ? " gm-map-marker__label--selected" : "";
  return (
    `<span class="gm-map-marker__label${labelSelected}" title="${safeName}">${safeName}</span>` +
    `<span class="gm-map-marker__dot${dotState}" data-testid="seller-marker" data-seller-id="${safeId}" ` +
    `title="${safeName}" ` +
    `style="width:${metrics.dotSize}px;height:${metrics.dotSize}px"></span>`
  );
}

/** Метрики контейнера DivIcon кластера (GM-UX-001). Кластер = точка продавца
 *  (внизу контейнера, у координаты) + бейдж с количеством чуть выше (вверху
 *  контейнера). Якорь — центр ТОЧКИ (не всего контейнера): точка 16px прижата
 *  к низу контейнера 38px, её центр на 8px от низа → 38 − 8 = 30 от верха.
 *  Только при таком якоре кластер «стоит» ровно на географической позиции,
 *  как отдельный маркер (в противном случае кластер смещён вверх и «дрожит»
 *  при пересчёте позиций). */
export const CLUSTER_ICON_SIZE: readonly [number, number] = [30, 38];
export const CLUSTER_ICON_ANCHOR: readonly [number, number] = [15, 30];

/** Разметка DivIcon кластера: бейдж с количеством + точка. Бейдж и точка
 *  позиционируются в map.css (абсолютные в контейнере .gm-map-cluster). */
export function buildClusterMarkerHtml(count: number): string {
  return (
    `<span data-testid="seller-cluster" class="gm-map-cluster__count">${count}</span>` +
    `<span class="gm-map-cluster__dot"></span>`
  );
}

/* ============================================================================
 * Маркер точки торговли (задача «Маркеты»). Отдельный визуальный язык от
 * точек продавцов: рынок/лавка — это МЕСТО (пин-«булавка»), а не точка.
 * Счётчик продавцов в булавке — аналог бейджа кластера, но это данные
 * API, а не текущий зум. Как и у продавцов, структура/геометрия строятся
 * здесь (чистый модуль), оформление — в map.css, в LeafletAdapter только
 * L.divIcon. Класс подписи .gm-map-market__label намеренно ОТЛИЧЕН от
 * .gm-map-marker__label: подписи точек торговли не участвуют в коллизионном
 * разрешении LabelCollisionBridge (точек мало, они далеко друг от друга),
 * а в паре с маркерами продавцов приоритет у подписи маркета.
 * ========================================================================== */

/** Метрики контейнера DivIcon маркера точки торговли. Булавка — квадрат
 *  34px, повёрнутый на 45° (круглый верх, остриё внизу): его габаритный
 *  бокс — 34·√2 ≈ 48px. Якорь — остриё булавки, т.е. точка контакта с
 *  координатой места. */
export const MARKET_ICON_SIZE: readonly [number, number] = [48, 48];
export const MARKET_ICON_ANCHOR: readonly [number, number] = [24, 48];

export interface MarketIconMetrics {
  size: [number, number];
  anchor: [number, number];
}

export function marketIconMetrics(): MarketIconMetrics {
  return { size: [...MARKET_ICON_SIZE], anchor: [...MARKET_ICON_ANCHOR] };
}

/** Разметка DivIcon маркера точки торговли: подпись-капсула (как у продавцов,
 *  но выше — над булавкой) + булавка со счётчиком продавцов. Модификатор
 *  --selected — выбранная точка (открыт её попап). Клики идут только на
 *  булавку (label pointer-events: none, как у продавцов). Размер/якорь
 *  контейнера задаются в LeafletAdapter из MARKET_ICON_SIZE/MARKET_ICON_ANCHOR —
 *  здесь только структура и классы. */
export function buildMarketMarkerHtml(
  name: string,
  marketId: MarketId,
  sellerCount: number,
  selected: boolean,
): string {
  const safeName = escapeHtml(name);
  const safeId = escapeHtml(marketId);
  const selectedClass = selected ? " gm-map-market__pin--selected" : "";
  return (
    `<span class="gm-map-market__label" title="${safeName}">${safeName}</span>` +
    `<span class="gm-map-market__pin${selectedClass}" data-testid="market-marker" ` +
    `data-market-id="${safeId}" title="${safeName}">` +
    `<span class="gm-map-market__count">${sellerCount}</span>` +
    `</span>`
  );
}
