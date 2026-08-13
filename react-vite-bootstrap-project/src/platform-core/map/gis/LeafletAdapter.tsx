import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import { MapContainer, TileLayer, Marker, CircleMarker, Polyline, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { MapAdapterProps } from "@/platform-core/map/gis/MapAdapterTypes";
import { defaultMapConfig } from "@/platform-core/map/gis/MapConfig";
import type { MarketId, SellerId } from "@/platform-core/contracts/Action";
import {
  buildClusterMarkerHtml,
  buildMarketMarkerHtml,
  buildSellerMarkerHtml,
  CLUSTER_ICON_ANCHOR,
  CLUSTER_ICON_SIZE,
  dotScale,
  glowScale,
  MARKET_ICON_ANCHOR,
  MARKET_ICON_SIZE,
  sellerIconMetrics,
  sellerMarkerState,
} from "@/platform-core/map/gis/MarkerStyle";
import "leaflet/dist/leaflet.css";

/** IMP-003.1 §3/§4: единственный файл во всём репозитории, которому
 *  разрешено импортировать "leaflet"/"react-leaflet" напрямую. MapScreenView
 *  (см. map/gis/MapAdapter.tsx) и остальной экран об этом файле не знают.
 *
 *  IMP-003.1.1 §1: Pan, колесо мыши, двойной клик и ограничение масштаба —
 *  штатное поведение react-leaflet MapContainer; здесь они не отключаются
 *  (дефолты dragging/doubleClickZoom = true) и explicit-конфигурируются
 *  через MapConfig, а не магическими значениями в компоненте. */

/** Кэш DivIcon маркеров: ключ = sellerId:state. Геометрия и разметка иконки
 *  НЕ зависят от zoom (все zoom-эффекты — CSS-переменные на контейнере карты),
 *  поэтому иконку достаточно создать один раз на состояние. Стабильная ссылка
 *  важна: react-leaflet при каждой отрисовке сверяет icon по identity и, если
 *  он не менялся, НЕ дёргает marker.setIcon — у MarkerClusterGroup не сбиваются
 *  внутренние bounds, маркеры не пропадают/не «прыгают» при зуммах, подписи
 *  не пересоздаются вместе с иконкой и не мигают. */
const sellerIconCache = new Map<string, L.DivIcon>();

/** Кэш DivIcon маркеров точек торговли (задача «Маркеты»): ключ = marketId:state.
 *  Как у продавцов — геометрия от zoom не зависит, иконку пересоздавать незачем
 *  (стабильная ссылка не дёргает marker.setIcon при ре-рендерах). */
const marketIconCache = new Map<string, L.DivIcon>();

function marketDivIcon(name: string, marketId: MarketId, sellerCount: number, selected: boolean): L.DivIcon {
  const key = `${marketId}:${selected}`;
  const cached = marketIconCache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "gm-map-market",
    html: buildMarketMarkerHtml(name, marketId, sellerCount, selected),
    iconSize: [...MARKET_ICON_SIZE],
    iconAnchor: [...MARKET_ICON_ANCHOR],
  });
  marketIconCache.set(key, icon);
  return icon;
}

function sellerDivIcon(
  name: string,
  selected: boolean,
  available: boolean,
  sellerId: SellerId,
): L.DivIcon {
  // Структура/геометрия маркера строятся в чистом модуле MarkerStyle (без
  // импорта leaflet — юнит-тестируем); здесь только обёртка в L.divIcon.
  // Стили состояния/зума (цвета, кольца, рост точки и свечения) живут в
  // src/screens/map/map.css через CSS-переменные --gm-dot-scale/--gm-glow-scale.
  const state = sellerMarkerState(selected, available);
  const key = `${sellerId}:${state}`;
  const cached = sellerIconCache.get(key);
  if (cached) return cached;
  const metrics = sellerIconMetrics(state);
  const icon = L.divIcon({
    className: "gm-map-marker",
    html: buildSellerMarkerHtml(name, sellerId, state, metrics),
    iconSize: metrics.size,
    iconAnchor: metrics.anchor,
  });
  sellerIconCache.set(key, icon);
  return icon;
}

function clusterDivIcon(cluster: L.MarkerCluster): L.DivIcon {
  // Кластер = та же «точка продавца», но над ней «слегка выше» висит бейдж
  // с количеством продавцов (GM-UX-001). Стили .gm-map-cluster* живут в
  // src/screens/map/map.css и используют токены темы (цвета следуют
  // light/dark без отдельного токена).
  return L.divIcon({
    className: "gm-map-cluster",
    html: buildClusterMarkerHtml(cluster.getChildCount()),
    iconSize: [...CLUSTER_ICON_SIZE],
    iconAnchor: [...CLUSTER_ICON_ANCHOR],
  });
}

function MapEventsBridge({
  onCameraChange,
  onVisibleBoundsChange,
  onMapLoaded,
  onMapBackgroundClick,
}: Pick<MapAdapterProps, "onCameraChange" | "onVisibleBoundsChange" | "onMapLoaded" | "onMapBackgroundClick">) {
  const reportBounds = (leafletMap: L.Map) => {
    const b = leafletMap.getBounds();
    onVisibleBoundsChange({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
  };

  const map = useMapEvents({
    load: () => onMapLoaded(),
    // IMP-003.1.1 §2: MoveMap и ZoomMap — раздельные Runtime-события, а не
    // один общий эффект на любое изменение камеры (Pan не должен выглядеть
    // как ZoomMap и наоборот).
    moveend: () => {
      const c = map.getCenter();
      onCameraChange({ center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() }, "move");
      reportBounds(map);
    },
    zoomend: () => {
      const c = map.getCenter();
      onCameraChange({ center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() }, "zoom");
      reportBounds(map);
    },
    click: () => onMapBackgroundClick(),
  });
  // react-leaflet's `load` event doesn't always fire post-mount reliably across versions —
  // fire once on mount as a safety net (IMP-003.1 §9: MAP_LOADED must be dispatched;
  // IMP-003.1.2 §3: initial bounds must reach the Repository before any pan/zoom).
  const firedRef = useRef(false);
  useEffect(() => {
    if (!firedRef.current) {
      firedRef.current = true;
      onMapLoaded();
      reportBounds(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- намеренно один раз при монтировании
  }, [onMapLoaded]);
  return null;
}

function CenterRequestBridge({ token, camera }: { token: number; camera: MapAdapterProps["camera"] }) {
  const map = useMap();
  const lastToken = useRef(token);
  useEffect(() => {
    if (token !== lastToken.current) {
      lastToken.current = token;
      map.flyTo([camera.center.lat, camera.center.lng], camera.zoom, { duration: 0.6 });
    }
  }, [token, camera, map]);
  return null;
}

/** MAP-020: подгонка камеры под весь маршрут. При смене fitRouteRequestToken
 *  (на карте появился новый маршрут) вычисляем границы ломаной и показываем
 *  её целиком с запасом в один зум-уровень (maxZoom = zoom точного вписывания
 *  минус 1): маршрут виден от точки старта до продавца, без необходимости
 *  скроллить карту. Токен — ровно как centerRequestToken: императивный, не
 *  зависит от движка. */
function FitRouteBridge({ token, route }: { token: number; route: MapAdapterProps["route"] }) {
  const map = useMap();
  const lastToken = useRef(-1);
  useEffect(() => {
    if (token === lastToken.current) return;
    lastToken.current = token;
    if (token <= 0) return;
    if (!route || route.geometry.length < 2) return;
    const bounds = L.latLngBounds(route.geometry.map((p) => [p.lat, p.lng] as [number, number]));
    const fitZoom = map.getBoundsZoom(bounds);
    map.fitBounds(bounds, {
      padding: [48, 48],
      maxZoom: Math.max(map.getMinZoom(), fitZoom - 1),
      animate: true,
      duration: 0.8,
    });
  }, [token, route, map]);
  return null;
}

/** MAP-068 + MAP-026: подписи названий над точками не должны накладываться ни
 *  друг на друга, ни на точки соседних маркеров, ни на бейджи кластеров.
 *  Пересчёт проходит по геометрии без «физического» показа:
 *  1) подписи никогда не показываются заранее — у скрытых (--hidden) через
 *     visibility:hidden bounding box всегда валиден, поэтому пересечения
 *     считаются математически по прямоугольникам текущей геометрии;
 *  2) пары подписей: если две подписи пересекаются, обе получают класс
 *     .gm-map-marker__label--hidden и не показываются (MAP-069). Победителя
 *     нет — пересчёты ничего не «переворачивают», подписи не мигают; при
 *     приближении подписи разъезжаются, конфликт пропадает и обе появляются
 *     снова. Подпись выбранного продавца — единственное исключение: она не
 *     скрывается ничем и сама прячет пересекающиеся с ней чужие подписи.
 *  Подпись выбранного продавца не скрывается ничем (пользовательский фокус
 *  важнее аккуратности кадра); собственная точка подписи исключается из
 *  препятствий — она лежит ниже подписи и в норме с ней не пересекается.
 *
 *  Чтобы подписи НЕ мигали (три отдельных решения):
 *  - У подписи нет fade-анимации (см. map.css): элементы пересоздаются при
 *    выходе маркеров из кластеров на зуме, и каждая анимация играла бы заново.
 *  - hidden-класс переключается visibility (не display:none), поэтому решение
 *    принимается в одном проходе без промежуточного показа всех.
 *  - Пересчёт выполняется ОДНИМ прогоном, когда карта затихла: debounce =
 *    LABEL_IDLE_MS после последнего события (zoomend, мутация marker-pane),
 *    и пачка мутаций при распаде кластеров просто сбрасывает таймер — пересчёт
 *    всегда видит финальную геометрию. Плюс гистерезис: ранее скрытые подписи
 *    не показываются, пока карта не устаканилась (нет «появилась и погасла»).
 *    При пане (moveend) пересчёта нет вовсе — все подписи сдвигаются вместе с
 *    картой, пересечения не меняются, и скрытый набор остаётся корректным
 *    (иначе приоритет «ближе к центру» менял бы видимый набор на каждом пане).
 *    Наблюдение за DOM ограничено marker-pane — поток тайлов
 *    (leaflet-tile-pane) не будит пересчёт. */

/** MAP-068: окно «тишины» карты, после которого разрешён пересчёт подписей.
 *  Распад кластеров на зуме сыпет пачкой мутаций marker-pane в течение сотен
 *  миллисекунд; пересчёт по концу затишья видит финальную геометрию и не
 *  «переворачивает» победителя пары перекрывающихся подписей (подпись не
 *  появляется и тут же не гаснет). */
const LABEL_IDLE_MS = 300;
const LABEL_HIDDEN_CLASS = "gm-map-marker__label--hidden";
/** MAP-070: hover-раскрытие скрытых подписей разрешено только когда карта
 *  «устаканилась» (прошло >= MAP_IDLE_DELAY_MS с последнего конца жеста).
 *  Иначе при драге/зуме маркеры проходят под курсором, :hover срабатывает, и
 *  скрытые подписи (обе в перекрывающейся паре — MAP-069) вспыхивают и гаснут
 *  «при любом движении карты». Класс вешается на контейнер карты; правило в
 *  map.css выбирает его предком: .gm-map--idle .gm-map-marker:hover .... */
const MAP_IDLE_CLASS = "gm-map--idle";
const MAP_IDLE_DELAY_MS = 450;

function LabelCollisionBridge({
  selectedSellerId,
}: {
  selectedSellerId: MapAdapterProps["selectedSellerId"];
}) {
  const map = useMap();

  // Когда произошло последнее триггерное событие (мутация marker-pane, конец
  // зума). Пересчёт вычитывает это для гистерезиса: пока карта не устаканилась,
  // ранее скрытые подписи не показываются (иначе — «появилась и тут же погасла»).
  const lastActivityRef = useRef(performance.now());

  const recompute = useCallback(() => {
    const container = map.getContainer();
    const labels = Array.from(
      container.querySelectorAll<HTMLElement>(".gm-map-marker__label"),
    );

    // MAP-026: препятствия для подписей — точки других маркеров и элементы
    // кластеров (точка + бейдж количества). Собственная точка исключается.
    // Скрытые подписи (visibility:hidden) НЕ показываются заранее — их bounding
    // box валиден всегда, пересечения считаются по геометрии прямоугольников.
    const obstacles = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".gm-map-marker__dot, .gm-map-cluster__dot, .gm-map-cluster__count",
      ),
    ).map((el) => ({ el, rect: el.getBoundingClientRect() }));

    // MAP-069: приоритет не нужен — если две подписи пересекаются, прячем ОБЕ
    // (победителя нет, пересчётам нечего «переворачивать» — мигать нечему).
    // Единственное исключение — подпись выбранного продавца: она всегда видима.
    const ordered = labels.map((el) => {
      const marker = el.parentElement?.closest<HTMLElement>(".gm-map-marker") ?? null;
      const sellerId =
        marker?.querySelector("[data-seller-id]")?.getAttribute("data-seller-id") ?? null;
      return {
        el,
        marker,
        selected: sellerId !== null && sellerId === selectedSellerId,
        rect: el.getBoundingClientRect(),
      };
    });
    const overlaps = (a: { rect: DOMRect }, b: { rect: DOMRect }) =>
      a.rect.left < b.rect.right &&
      a.rect.right > b.rect.left &&
      a.rect.top < b.rect.bottom &&
      a.rect.bottom > b.rect.top;

    const hidden = new Set<HTMLElement>();
    // Пары подписей (кроме выбранного продавца): пересечение прячет ОБЕ подписи.
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i];
      if (a.selected) continue;
      for (let j = i + 1; j < ordered.length; j++) {
        const b = ordered[j];
        if (b.selected) continue;
        if (overlaps(a, b)) {
          hidden.add(a.el);
          hidden.add(b.el);
        }
      }
    }
    // Подпись выбранного продавца всегда видима; пересекающиеся с ней прячутся.
    for (const a of ordered) {
      if (!a.selected) continue;
      for (const b of ordered) {
        if (b.selected) continue;
        if (overlaps(a, b)) hidden.add(b.el);
      }
    }
    // Подписи против точек/бейджей. Собственная точка исключается.
    for (const a of ordered) {
      if (a.selected) continue;
      if (hidden.has(a.el)) continue;
      for (const ob of obstacles) {
        if (hidden.has(a.el)) break;
        if (a.marker && a.marker.contains(ob.el)) continue;
        if (overlaps(a, ob)) hidden.add(a.el);
      }
    }
    // Гистерезис: позволяем ПОКАЗЫВАТЬ ранее скрытые подписи только когда карта
    // устаканилась (последнее событие было >= LABEL_IDLE_MS назад). Иначе пара
    // близких пересчётов на переходной и финальной геометрии «переворачивает»
    // победителя пары: подпись появляется и тут же гаснет.
    const idle = performance.now() - lastActivityRef.current >= LABEL_IDLE_MS;
    for (const label of labels) {
      if (hidden.has(label)) {
        label.classList.add(LABEL_HIDDEN_CLASS);
      } else if (idle || !label.classList.contains(LABEL_HIDDEN_CLASS)) {
        label.classList.remove(LABEL_HIDDEN_CLASS);
      }
    }
  }, [map, selectedSellerId]);

  // Пересчёт отложенный: ОДИН прогон через LABEL_IDLE_MS после ПОСЛЕДНЕГО
  // триггерного события (mount, zoomend, мутация marker-pane вне жеста). Пачка
  // мутаций при распаде кластеров на зуме сбрасывает таймер, и пересчёт идёт
  // только когда карта затихла — по финальной геометрии, одним прогоном.
  const recomputeTimer = useRef<number | null>(null);
  const scheduleRecompute = useCallback(() => {
    lastActivityRef.current = performance.now();
    if (recomputeTimer.current !== null) window.clearTimeout(recomputeTimer.current);
    recomputeTimer.current = window.setTimeout(() => {
      recomputeTimer.current = null;
      recompute();
    }, LABEL_IDLE_MS);
  }, [recompute]);

  // MAP-071: начало жеста (zoomstart/movestart) помечает активность и СБРАСЫВАЕТ
  // отложенный пересчёт предыдущего жеста. Иначе debounce через LABEL_IDLE_MS
  // после предыдущего zoomend срабатывал на ПРОМЕЖУТОЧНОЙ геометрии следующего
  // тика колеса (rects в масштабе transition, idle=true — zoomstart не обновлял
  // lastActivityRef), и гистерезис отпускал скрытые подписи: при зуме колесом
  // каждая пара мигала по разу на тик («2-3 блинка»).
  const onGestureStart = useCallback(() => {
    lastActivityRef.current = performance.now();
    if (recomputeTimer.current !== null) {
      window.clearTimeout(recomputeTimer.current);
      recomputeTimer.current = null;
    }
  }, []);
  const onZoomEnd = useCallback(() => {
    scheduleRecompute();
    // MAP-068: на zoomend markercluster пересоздаёт иконки маркеров (доказано
    // харнессом: все подписи — новые DOM-элементы, видимые разом). Без мгновенного
    // скрытия пересечений они бы мигали до дебаунса (300мс): «появились и исчезли».
    // rAF выполняется после всех обработчиков zoomend (включая пересборку кластеров)
    // и ДО отрисовки кадра — пользователь видит сразу финальное состояние.
    window.requestAnimationFrame(() => recompute());
  }, [scheduleRecompute, recompute]);

  useEffect(() => {
    scheduleRecompute();
    map.on("zoomstart", onGestureStart);
    map.on("movestart", onGestureStart);
    map.on("zoomend", onZoomEnd);
    // Подписи появляются/исчезают вместе с DOM маркеров (кластеризация, spiderfy,
    // пересоздание иконок markercluster на зуме и ре-рендер react после смены
    // camera) — мутации ТОЛЬКО marker-pane, а не всего контейнера: поток тайлов
    // (leaflet-tile-pane) не должен будить пересчёт.
    // visibility-состояние НЕ переживает пересоздание элементов: новые подписи
    // вставляются видимыми, и пересечения надо прятать сразу — MutationObserver
    // отрабатывает в микротаске после вставки, ДО отрисовки кадра, поэтому
    // «появилась и погасла» не видно. Пересчёт здесь мгновенный, без debounce:
    // гистерезис (idle-gate в recompute) не даёт ПОКАЗЫВАТЬ ранее скрытые подписи,
    // пока карта не устаканилась, — промежуточный пересчёт на анимированной
    // геометрии только прячет, а не «переворачивает» победителя пары. Финальное
    // «открытие» разъехавшихся подписей делает отложенный пересчёт из onZoomEnd.
    // При пане (moveend) отдельного пересчёта нет: подписи сдвигаются вместе с
    // картой, пересечения не меняются, скрытый набор остаётся корректным.
    const pane =
      map.getPane("markerPane") ?? map.getContainer().querySelector<HTMLElement>(".leaflet-marker-pane");
    const observerTarget = pane ?? map.getContainer();
    const observer = new MutationObserver(() => {
      recompute();
    });
    observer.observe(observerTarget, { subtree: true, childList: true });
    return () => {
      if (recomputeTimer.current !== null) window.clearTimeout(recomputeTimer.current);
      map.off("zoomstart", onGestureStart);
      map.off("movestart", onGestureStart);
      map.off("zoomend", onZoomEnd);
      observer.disconnect();
    };
  }, [map, scheduleRecompute, onGestureStart, onZoomEnd, recompute]);

  // MAP-070: скрытая подпись показывается при hover только на «устаканившейся»
  // карте (контейнер несёт класс gm-map--idle). Пока идёт жест (движение/зум),
  // класс снят: маркеры скользят под курсором, но их скрытые подписи не
  // вспыхивают. Класс возвращается через MAP_IDLE_DELAY_MS после конца жеста —
  // позже debounce-пересчёта подписей (LABEL_IDLE_MS), чтобы hover не раскрывал
  // подпись, которую пересчёт ещё может скрыть.
  useEffect(() => {
    const container = map.getContainer();
    let idleTimer: number | null = null;
    const markBusy = () => {
      container.classList.remove(MAP_IDLE_CLASS);
      if (idleTimer !== null) window.clearTimeout(idleTimer);
    };
    const scheduleIdle = () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        idleTimer = null;
        container.classList.add(MAP_IDLE_CLASS);
      }, MAP_IDLE_DELAY_MS);
    };
    container.classList.add(MAP_IDLE_CLASS);
    map.on("movestart", markBusy);
    map.on("zoomstart", markBusy);
    map.on("moveend", scheduleIdle);
    map.on("zoomend", scheduleIdle);
    return () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      map.off("movestart", markBusy);
      map.off("zoomstart", markBusy);
      map.off("moveend", scheduleIdle);
      map.off("zoomend", scheduleIdle);
      container.classList.remove(MAP_IDLE_CLASS);
    };
  }, [map]);

  return null;
}

export function LeafletAdapter({
  sellers,
  selectedSellerId,
  markets,
  selectedMarketId,
  userLocation,
  route,
  camera,
  onMapLoaded,
  onCameraChange,
  onVisibleBoundsChange,
  onSellerSelect,
  onMarketSelect,
  onMapBackgroundClick,
  centerRequestToken,
  fitRouteRequestToken,
}: MapAdapterProps) {
  // Позиции ломаной маршрута (MAP-020): [lat, lng] в порядке «пользователь →
  // продавец». Маршрут рисуется под маркерами (LayerOrder — сначала в JSX).
  const routePositions = route
    ? route.geometry.map((point) => [point.lat, point.lng] as [number, number])
    : [];
  // Zoom-зависимые масштабы точки и свечения — CSS-переменные на контейнере:
  // маркеры масштабируются через transform/box-shadow чистым CSS и НЕ
  // пересоздают иконки при зуммах (геометрия иконки от zoom не зависит).
  const containerStyle = {
    width: "100%",
    height: "100%",
    "--gm-glow-scale": glowScale(camera.zoom).toFixed(3),
    "--gm-dot-scale": dotScale(camera.zoom).toFixed(3),
  } as CSSProperties;
  return (
    // data-testid on a wrapper div (rather than on MapContainer itself, whose typed
    // props don't include arbitrary data-* attributes) — IMP-003.1 §3: this remains
    // the only file that touches "leaflet"/"react-leaflet" directly.
    <div data-testid="leaflet-map" style={containerStyle}>
      <MapContainer
        center={[camera.center.lat, camera.center.lng]}
        zoom={camera.zoom}
        minZoom={defaultMapConfig.minZoom}
        maxZoom={defaultMapConfig.maxZoom}
        scrollWheelZoom={defaultMapConfig.enableScrollWheelZoom}
        doubleClickZoom={defaultMapConfig.enableDoubleClickZoom}
        dragging
        touchZoom
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
        attributionControl={true}
      >
        <TileLayer
          url={defaultMapConfig.tileProvider.urlTemplate}
          attribution={defaultMapConfig.tileProvider.attribution}
          maxZoom={defaultMapConfig.tileProvider.maxZoom}
          maxNativeZoom={defaultMapConfig.tileProvider.maxZoom}
          minZoom={defaultMapConfig.tileProvider.minZoom}
        />
        <MapEventsBridge
          onCameraChange={onCameraChange}
          onVisibleBoundsChange={onVisibleBoundsChange}
          onMapLoaded={onMapLoaded}
          onMapBackgroundClick={onMapBackgroundClick}
        />
        <CenterRequestBridge token={centerRequestToken} camera={camera} />
        <FitRouteBridge token={fitRouteRequestToken} route={route} />
        <LabelCollisionBridge selectedSellerId={selectedSellerId} />

        {userLocation && (
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={7}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#2E6C8E", fillOpacity: 1 }}
          />
        )}

        {/* Маршрут до выбранного продавца (MAP-020): белая подложка (контраст с
         *  любыми тайлами) + цветная ломаная поверх. Классы и токены — в map.css.
         *  Точка старта маршрута рисуется только если геолокации нет (в тестовой
         *  среде видно, откуда строится маршрут); иначе её роль играет маркер
         *  пользователя выше. */}
        {routePositions.length > 1 && (
          <>
            <Polyline positions={routePositions} pathOptions={{ className: "gm-map-route gm-map-route--casing" }} />
            <Polyline positions={routePositions} pathOptions={{ className: "gm-map-route" }} />
          </>
        )}
        {routePositions.length > 1 && !userLocation && (
          <CircleMarker
            center={routePositions[0]}
            radius={5}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#2E6C8E", fillOpacity: 1 }}
          />
        )}

        {/* Кластеризация точек продавцов (GM-UX-001): на маленьком зуме близкие
         *  продавцы накладываются друг на друга — MarkerClusterGroup объединяет
         *  их в один кластер (иконка = точка + количество чуть выше), а по
         *  клику/приближении кластер распадается на отдельных продавцов.
         *  maxClusterRadius = 20px — кластеризация намеренно «неагрессивная»:
         *  объединяются только почти перекрывающиеся точки, чуть отдалённые
         *  продавцы остаются отдельными маркерами; spiderfyOnMaxZoom на
         *  предельном зуме разводит перекрывающиеся точки веером, чтобы каждую
         *  можно было выбрать.
         *  animate/animateAddingMarkers = false: иконки кластеров ставятся
         *  мгновенно, без «доезжающих»/«падающих» анимаций — точки
         *  стабилизируются сразу после жеста, не требуя времени на доводку. */}
        <MarkerClusterGroup
          maxClusterRadius={20}
          showCoverageOnHover={false}
          spiderfyOnMaxZoom={true}
          zoomToBoundsOnClick={true}
          animate={false}
          animateAddingMarkers={false}
          iconCreateFunction={clusterDivIcon}
        >
          {sellers.map((seller) => (
            <Marker
              key={seller.sellerId}
              position={[seller.location.lat, seller.location.lng]}
              icon={sellerDivIcon(seller.name, seller.sellerId === selectedSellerId, seller.isAvailable, seller.sellerId)}
              eventHandlers={{ click: () => onSellerSelect(seller.sellerId) }}
            />
          ))}
        </MarkerClusterGroup>

        {/* Точки торговли (задача «Маркеты»): отдельный слой ПОСЛЕ кластеров,
         *  чтобы пины рынков/лавок были поверх. НЕ кластеризуются (точек мало,
         *  каждая — самостоятельная точка интереса) и НЕ участвуют в
         *  LabelCollisionBridge (подписи подписей маркетов — .gm-map-market__label,
         *  отдельный класс, см. MarkerStyle). zIndexOffset поднимает пин над
         *  кластерами и спид-веером продавцов. Клик — onMarketSelect → попап
         *  точки (MapRuntime.loadMarketSellers). */}
        {markets.map((market) => (
          <Marker
            key={market.marketId}
            position={[market.location.lat, market.location.lng]}
            icon={marketDivIcon(market.name, market.marketId, market.sellerCount, market.marketId === selectedMarketId)}
            eventHandlers={{ click: () => onMarketSelect(market.marketId) }}
            zIndexOffset={400}
          />
        ))}
      </MapContainer>
    </div>
  );
}


