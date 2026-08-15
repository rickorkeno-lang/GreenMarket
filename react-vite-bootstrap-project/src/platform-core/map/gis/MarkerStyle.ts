import type { CategoryId } from "@/platform-core/contracts/DomainTypes";
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

/** Состояние продавца, влияющее на цвет/акцент точки. "unknown" — статус
 *  доступности не известен (isAvailable = undefined по Upd-8): нейтральная
 *  полая точка, НЕ «недоступен» — неизвестный статус не превращается в
 *  ложный факт (см. sellerMarkerState). */
export type SellerMarkerState = "selected" | "available" | "unknown" | "disabled";

/** Сопоставление доменных флагов (выбран / доступен) с состоянием маркера.
 *  Выбор приоритетнее доступности: выбранная точка всегда акцентная, даже
 *  если продавец сейчас закрыт.
 *
 *  Upd-8 (nullable backend-данные): isAvailable — не boolean, а boolean |
 *  undefined | null, и все три значения различимы. undefined/null (бэкенд не
 *  отдал статус) НЕ приравнивается к false: такой продавец получает
 *  нейтральное состояние "unknown" (полая точка), а не "disabled"
 *  («недоступен») — неизвестный статус не превращается в ложный факт. */
export function sellerMarkerState(
  selected: boolean,
  available: boolean | undefined | null,
): SellerMarkerState {
  if (selected) return "selected";
  if (available == null) return "unknown";
  return available ? "available" : "disabled";
}

/* ============================================================================
 * Визуальное кодирование категорий шопов — архитектурная заготовка.
 *
 * ЗАЧЕМ: категория — часть МАРКЕРА, а не только фильтра. Это разные задачи:
 *   фильтр отвечает на вопрос «покажи мне мясо» (что отображать на карте),
 *   маркер — «что здесь находится?» (идентификация места на карте).
 * Они дополняют друг друга, поэтому категория приходит в маркер отдельным
 * потоком данных (SellerMapRecord.categories → resolveSellerMarkerVisual), а
 * не через состояние выбранного фильтра. Без этого маркер «говорит» только о
 * доступности/выборе и не знает, к какому типу относится шоп.
 *
 * ЧТО ЭТО: не «нарисовать много иконок», а масштабируемая система отображения
 * типа: КАТЕГОРИЯ → ВИЗУАЛЬНЫЙ МАРКЕР. Точки расширения:
 *   1. Реестр CATEGORY_MARKER_VISUALS закрепляет за категорией свой визуал
 *      (в будущем — загружать из backend). Сейчас реестр пуст, и любая
 *      категория получает заглушку { kind: "circle" } — обычный кружок, как у
 *      всех шопов до введения системы.
 *   2. Тип CategoryMarkerVisual — сейчас единственный вид "circle". Будущие
 *      виды (например, { kind: "icon"; iconKey: string }) добавляются в тип и
 *      получают свою геометрию/разметку здесь же, в чистой фабрике: ветка в
 *      sellerIconMetrics (размеры/якорь) и ветка в buildSellerMarkerHtml
 *      (разметка). Оба места помечены «точка расширения».
 *   3. Маркер у продавца ОДИН, а категорий может быть несколько. Если за
 *      категорией закреплено несколько иконок, в будущем иконку выбирает сам
 *      продавец при настройке аккаунта (будущее поле записи, напр.
 *      SellerMapRecord.markerIconId) — resolveSellerMarkerVisual учитывает это
 *      с приоритетом над дефолтом категории (см. комментарий функции).
 *
 * МАРКЕТЫ (рынки/лавки, MarketMapRecord) — НЕ затрагиваются: у них собственный
 * визуальный язык (булавка, buildMarketMarkerHtml) и свой источник данных.
 * ========================================================================== */

/** Визуал маркера продавца/категории. Сейчас единственный вид — "circle"
 *  (заглушка, обычный кружок). Будущие виды добавляются в объединение (см.
 *  секцию «Визуальное кодирование категорий»). */
export type CategoryMarkerVisual = { kind: "circle" };

/** Дефолтный визуал — обычный кружок, текущий вид всех шопов. */
export const DEFAULT_CATEGORY_MARKER_VISUAL: CategoryMarkerVisual = {
  kind: "circle",
};

/** Реестр «категория → визуальный маркер» — точка расширения системы. Ключ —
 *  CategoryId (брендированная строка, категории динамические, а не
 *  перечисление). Сейчас пуст: каждая категория получает дефолтный кружок.
 *  Будущее: запись вида { meat: { kind: "icon", iconKey: "steak" } } или
 *  загрузка маппинга из backend. */
const CATEGORY_MARKER_VISUALS: Readonly<Record<string, CategoryMarkerVisual>> = {};

/** Визуал, закреплённый за категорией. Неизвестная категория или категория
 *  без записи в реестре — дефолтный кружок (заглушка). */
export function categoryMarkerVisual(categoryId: CategoryId): CategoryMarkerVisual {
  return CATEGORY_MARKER_VISUALS[categoryId] ?? DEFAULT_CATEGORY_MARKER_VISUAL;
}

/** Визуал маркера ПРОДАВЦА: у продавца несколько категорий, а маркер один —
 *  система выбирает один визуал. Правило: первая категория с не-дефолтным
 *  визуалом; если таких нет (или категорий нет) — дефолтный кружок. Пока все
 *  категории дают кружок, результат всегда дефолтный.
 *
 *  Будущее: когда за категорией закреплено несколько иконок, приоритет у
 *  иконки, выбранной продавцом при настройке аккаунта (будущее поле
 *  SellerMapRecord.markerIconId): она перекрывает дефолт категории. */
export function resolveSellerMarkerVisual(categories: CategoryId[]): CategoryMarkerVisual {
  for (const categoryId of categories) {
    const visual = categoryMarkerVisual(categoryId);
    if (visual.kind !== "circle") return visual;
  }
  return DEFAULT_CATEGORY_MARKER_VISUAL;
}

/* ============================================================================
 * Оформление маркера по СТАТУСУ продавца — вторая ось визуального кодирования
 * (первая — категория, CategoryMarkerVisual). Оси независимы и применяются
 * совместно: МАРКЕР = ИКОНКА КАТЕГОРИИ («что здесь?») + ОФОРМЛЕНИЕ СТАТУСА
 * (открыт / закрыт / неизвестен).
 *
 * Поток данных: SellerMapRecord.isAvailable → sellerMarkerTreatment →
 * treatment → sellerIconMetrics / buildSellerMarkerHtml (и в ключ кэша DivIcon,
 * см. LeafletAdapter). Статус приходит из ДАННЫХ (isAvailable), а не из
 * состояния выбора — поэтому ось строится от availability; выбор (selected) —
 * ортогональный акцент, он не «съедает» статус.
 *
 * Точки расширения:
 *   1. Тип SellerMarkerTreatment — сейчас три вида: "plain" (открыт — просто
 *      иконка), "closed" (закрыт — поверх иконки в фиксированной позиции
 *      накладывается замочек, отдельная иконка-оверлей), "faded" (статус
 *      неизвестен — иконка теряет цвет). Виды добавляются в объединение и
 *      получают геометрию/разметку в sellerIconMetrics / buildSellerMarkerHtml
 *      (помечены «точка расширения»), как у категорийных визуалов.
 *   2. Замочек (closed): позиция оверлея задаётся константами
 *      LOCK_OVERLAY_SIZE / LOCK_OVERLAY_OFFSET (правый нижний угол контейнера).
 *      Для кружка-заглушки оверлей НЕ рисуется — нечего запирать; реальные
 *      иконки (kind "icon") отрисуют замочек в своей ветке разметки.
 *   3. Обесцвечивание (faded): для кружка-заглушки это уже существующий
 *      модификатор --unknown (полая нейтральная точка, Upd-8); для будущих
 *      иконок — CSS-фильтр grayscale на контейнере маркера.
 *
 * ЗАГЛУШКА: для всех трёх видов разметка/геометрия совпадает с текущей
 * (открыт → обычная точка, закрыт → --disabled, неизвестен → --unknown),
 * поэтому пока нет иконок и подробностей замочка — ничего не ломается.
 * ========================================================================== */

/** Оформление маркера по статусу продавца (вторая ось визуального
 *  кодирования, см. секцию выше): открыт → просто иконка; закрыт → поверх
 *  иконки накладывается замочек (в позиции LOCK_OVERLAY_*); неизвестно →
 *  иконка теряет цвет. */
export type SellerMarkerTreatment =
  | { kind: "plain" }
  | { kind: "closed" }
  | { kind: "faded" };

/** Дефолтное оформление — продавец открыт, просто иконка. */
export const DEFAULT_SELLER_MARKER_TREATMENT: SellerMarkerTreatment = { kind: "plain" };

/** Оформление маркера по СТАТУСУ продавца (isAvailable, см. Upd-8: boolean |
 *  undefined | null, где undefined/null — статус неизвестен). Выбор (selected)
 *  сюда не входит: это ортогональный акцент (--selected), а статус не должен
 *  «исчезать» из-за выбора — в будущем закрытый выбранный маркер покажет и
 *  акцент, и замочек. */
export function sellerMarkerTreatment(available: boolean | undefined | null): SellerMarkerTreatment {
  if (available == null) return { kind: "faded" };
  return available ? { kind: "plain" } : { kind: "closed" };
}

/** Размер оверлея «замочек» (закрыт, kind "closed") — архитектурная заготовка.
 *  Значения заглушечные, подберутся вместе с самим замочком; важна структура:
 *  геометрия оверлея живёт здесь (чистая фабрика), чтобы будущая иконка могла
 *  зарезервировать под него место, не ломая якорь маркера. */
export const LOCK_OVERLAY_SIZE = 12;

/** Смещение оверлея «замочек» от верхнего левого угла контейнера маркера —
 *  замочек кладётся в правый нижний угол иконки (архитектурная заготовка). */
export const LOCK_OVERLAY_OFFSET: readonly [number, number] = [14, 14];

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

export function sellerIconMetrics(
  state: SellerMarkerState,
  visual: CategoryMarkerVisual = DEFAULT_CATEGORY_MARKER_VISUAL,
  treatment: SellerMarkerTreatment = DEFAULT_SELLER_MARKER_TREATMENT,
): SellerIconMetrics {
  // Точка расширения (ось «категория»): геометрия зависит от вида визуала.
  // Сейчас единственный вид — кружок (заглушка), его метрики ниже.
  // Будущие виды (icon и т.п., см. CategoryMarkerVisual) получат здесь свои
  // контейнер/якорь/размер точки.
  switch (visual.kind) {
    case "circle":
      break;
  }
  // Точка расширения (ось «статус»): замочек (closed) может потребовать
  // контейнер чуть больше, чтобы не вылезать за край иконки (см.
  // LOCK_OVERLAY_SIZE / LOCK_OVERLAY_OFFSET). Сейчас оформление статуса на
  // геометрию не влияет (заглушка).
  switch (treatment.kind) {
    case "plain":
    case "closed":
    case "faded":
      break;
  }
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

/** Текстовое описание статуса продавца для aria-label маркера (MAP-033).
 *  Статус (открыт / закрыт / статус неизвестен) строится от оформления
 *  (treatment, ось «статус») и НЕ теряется из-за выбора: выбранный маркер
 *  получает «статус, выбран», а не просто «выбран» — выбор ортогональный
 *  акцент (--selected), а не замена статуса. */
function sellerMarkerStatusText(state: SellerMarkerState, treatment: SellerMarkerTreatment): string {
  let status: string;
  switch (treatment.kind) {
    case "plain":
      status = "открыт";
      break;
    case "closed":
      status = "закрыт";
      break;
    case "faded":
      status = "статус неизвестен";
      break;
  }
  return state === "selected" ? `${status}, выбран` : status;
}

/** Разметка DivIcon отдельного маркера продавца (MAP-067/MAP-026).
 *  Структура: подпись-капсула + точка. Подпись абсолютно позиционируется
 *  поверх точки в map.css (bottom: 100%), клики идут только на точку
 *  (label pointer-events: none). Модификатор СТАТУСА точки (--disabled/--unknown)
 *  выводится из оформления (treatment, ось «статус»), модификатор выбора
 *  (--selected) — из state: выбор — ортогональный акцент и важнее статусной
 *  окраски (выбранная точка всегда акцентная, даже если продавец закрыт; при
 *  этом в будущем замочек для закрытых сохранится в ветках иконок).
 *
 *  Доступность (MAP-033): точка — role="img" с aria-label «название, статус
 *  [, выбран]» (статус — от оформления, см. sellerMarkerStatusText; выбор
 *  добавляется поверх, не «съедая» статус), чтобы скринридер сообщал, что
 *  здесь находится. title остаётся тултипом для мыши. В будущем aria-label
 *  можно расширить категорией (categoryNames) по мере добавления
 *  категорийных иконок. */
export function buildSellerMarkerHtml(
  name: string,
  sellerId: SellerId,
  state: SellerMarkerState,
  metrics: SellerIconMetrics,
  visual: CategoryMarkerVisual = DEFAULT_CATEGORY_MARKER_VISUAL,
  treatment: SellerMarkerTreatment = DEFAULT_SELLER_MARKER_TREATMENT,
): string {
  const safeName = escapeHtml(name);
  const safeId = escapeHtml(sellerId);
  // Статусная окраска точки — от оформления (treatment), а не от state напрямую:
  // это единое место, где в будущем появится grayscale (faded) и замочек
  // (closed). Заглушка: closed → --disabled (как раньше), faded → --unknown.
  const dotState =
    state === "selected"
      ? " gm-map-marker__dot--selected"
      : treatment.kind === "closed"
        ? " gm-map-marker__dot--disabled"
        : treatment.kind === "faded"
          ? " gm-map-marker__dot--unknown"
          : "";
  const labelSelected = state === "selected" ? " gm-map-marker__label--selected" : "";
  // Точка расширения (ось «категория»): разметка зависит от вида визуала
  // (см. секцию «Визуальное кодирование категорий»). Сейчас единственный вид —
  // кружок (заглушка): подпись-капсула + точка, как у всех шопов до введения
  // системы. Будущие виды (icon и т.п.) строят здесь свою разметку (в т.ч.
  // оверлей «замочек» по LOCK_OVERLAY_SIZE / LOCK_OVERLAY_OFFSET для closed),
  // оставаясь в чистой фабрике.
  switch (visual.kind) {
    case "circle":
      return (
        `<span class="gm-map-marker__label${labelSelected}" title="${safeName}">${safeName}</span>` +
        `<span class="gm-map-marker__dot${dotState}" role="img" ` +
        `aria-label="${safeName}, ${sellerMarkerStatusText(state, treatment)}" ` +
        `data-testid="seller-marker" data-seller-id="${safeId}" ` +
        `title="${safeName}" ` +
        `style="width:${metrics.dotSize}px;height:${metrics.dotSize}px"></span>`
      );
  }
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

/** Русская плюрализация слова «продавец» — для aria-label кластеров и точек
 *  торговли (MAP-033): 1 продавец, 2–4 продавца, 5+ продавцов. */
function pluralizeSellers(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} продавец`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} продавца`;
  return `${count} продавцов`;
}

/** Разметка DivIcon кластера: бейдж с количеством + точка. Бейдж и точка
 *  позиционируются в map.css (абсолютные в контейнере .gm-map-cluster).
 *  Доступность (MAP-033): бейдж — role="img" с aria-label «N продавцов»;
 *  точка декоративная (aria-hidden), чтобы скринридер не озвучивал дубль. */
export function buildClusterMarkerHtml(count: number): string {
  return (
    `<span data-testid="seller-cluster" class="gm-map-cluster__count" role="img" ` +
    `aria-label="${pluralizeSellers(count)}">${count}</span>` +
    `<span class="gm-map-cluster__dot" aria-hidden="true"></span>`
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
 *  здесь только структура и классы.
 *  Доступность (MAP-033): булавка — role="img" с aria-label «название,
 *  N продавцов» (см. pluralizeSellers); видимый счётчик внутри булавки —
 *  aria-hidden, чтобы скринридер не озвучивал его дважды (роль img читается
 *  целиком по aria-label). */
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
    `<span class="gm-map-market__pin${selectedClass}" role="img" ` +
    `aria-label="${safeName}, ${pluralizeSellers(sellerCount)}" ` +
    `data-testid="market-marker" ` +
    `data-market-id="${safeId}" title="${safeName}">` +
    `<span class="gm-map-market__count" aria-hidden="true">${sellerCount}</span>` +
    `</span>`
  );
}
