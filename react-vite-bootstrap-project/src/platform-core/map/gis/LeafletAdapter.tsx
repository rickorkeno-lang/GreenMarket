import { useCallback, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { MapAdapterProps } from "@/platform-core/map/gis/MapAdapterTypes";
import { defaultMapConfig } from "@/platform-core/map/gis/MapConfig";
import "leaflet/dist/leaflet.css";

/** IMP-003.1 §3/§4: единственный файл во всём репозитории, которому
 *  разрешено импортировать "leaflet"/"react-leaflet" напрямую. MapScreen
 *  (см. map/gis/MapAdapter.tsx) и остальной экран об этом файле не знают.
 *
 *  IMP-003.1.1 §1: Pan, колесо мыши, двойной клик и ограничение масштаба —
 *  штатное поведение react-leaflet MapContainer; здесь они не отключаются
 *  (дефолты dragging/doubleClickZoom = true) и explicit-конфигурируются
 *  через MapConfig, а не магическими значениями в компоненте. */

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sellerDivIcon(
  name: string,
  selected: boolean,
  available: boolean,
  sellerId: string,
  zoom: number,
): L.DivIcon {
  // Доступные продавцы — светло-зелёные со свечением, чтобы выделяться на фоне
  // посторонних заведений карты (GM-UX-001). Цвет ореола взят из токена через
  // color-mix, поэтому следует теме (light/dark) без отдельного токена.
  //
  // Свечение растёт при приближении карты (большой zoom): чем ближе смотрим,
  // тем крупнее ореол; на отдалении он почти исчезает, чтобы разрозненные
  // точки не сливались в одно пятно. База: кольцо 4px / размытие 16px на
  // дефолтном zoom 13, масштаб от 0.3 до 4.
  //
  // Множитель GLOW_BOOST_BY_ZOOM применяется ПОСЛЕ базового зажима scale
  // (и без него не больше 4): «в 2 раза больше, чем сейчас» на zoom 19 —
  // буквально 2 × текущее значение, а не 2 × сырую формулу без зажима.
  const boost = GLOW_BOOST_BY_ZOOM[zoom] ?? 1;
  const scale = Math.max(0.3, Math.min(4, 1 + (zoom - 13) * 0.6)) * boost;
  const ring = Math.round(4 * scale);
  const blur = Math.round(16 * scale);
  const spread = Math.round(4 * scale);
  const bg = !available
    ? "var(--color-disabled-content)"
    : selected
      ? "var(--color-brand-accent)"
      : "var(--color-brand-primary-light)";
  // Недоступные продавцы не должны теряться на фоне карты — у них тоже есть
  // мягкий нейтральный ореол, но скромнее зелёного, чтобы иерархия читалась.
  const glow = selected
    ? "0 1px 4px rgba(0,0,0,0.35)"
    : available
      ? `0 1px 4px rgba(0,0,0,0.35), 0 0 0 ${ring}px color-mix(in srgb, var(--color-brand-primary-light) 45%, transparent), 0 0 ${blur}px ${spread}px color-mix(in srgb, var(--color-brand-primary-light) 55%, transparent)`
      : `0 1px 4px rgba(0,0,0,0.35), 0 0 0 ${Math.round(2 * scale)}px color-mix(in srgb, var(--color-disabled-content) 50%, transparent), 0 0 ${Math.round(9 * scale)}px ${Math.round(2 * scale)}px color-mix(in srgb, var(--color-disabled-content) 40%, transparent)`;
  return L.divIcon({
    className: "gm-map-marker",
    html: `<span class="gm-map-marker__label">${escapeHtml(name)}</span><span data-testid="seller-marker" data-seller-id="${sellerId}" style="display:block;width:${selected ? 20 : 14}px;height:${selected ? 20 : 14}px;border-radius:999px;background:${bg};border:2px solid white;box-shadow:${glow};"></span>`,
    iconSize: [selected ? 24 : 18, selected ? 24 : 18],
    iconAnchor: [selected ? 12 : 9, selected ? 12 : 9],
  });
}

function clusterDivIcon(cluster: L.MarkerCluster): L.DivIcon {
  // Кластер = та же «точка продавца», но над ней «слегка выше» висит бейдж
  // с количеством продавцов (GM-UX-001). Стили .gm-map-cluster* живут в
  // src/screens/map/map.css и используют токены темы (цвета следуют
  // light/dark без отдельного токена).
  const count = cluster.getChildCount();
  return L.divIcon({
    className: "gm-map-cluster",
    html: `<span data-testid="seller-cluster" class="gm-map-cluster__count">${count}</span><span class="gm-map-cluster__dot"></span>`,
    iconSize: [28, 34],
    iconAnchor: [14, 25],
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

/** MAP-068: подписи названий над точками не должны накладываться друг на
 *  друга. Каждый пересчёт (конец движения/зума, появление/исчезновение
 *  маркеров при кластеризации или spiderfy) проходит в два шага:
 *  1) показать все подписи (скрытая с display:none имеет нулевой bounding
 *     box и не участвует в пересечениях, пока класс не снят);
 *  2) жадный проход по подписям в порядке приоритета — выбранный продавец,
 *     затем ближайшая к центру экрана, затем порядок DOM. Порядок каталога
 *     Repository намеренно НЕ является сигналом приоритета (замечание ревью):
 *     при конфликте двух подписей выигрывает осмысленная, а не случайная
 *     (первая в DOM). Проигравшая получает класс .gm-map-marker__label--hidden
 *     и исчезает. При приближении подписи разъезжаются, конфликт пропадает и
 *     скрытая снова появляется. */
function LabelCollisionBridge({
  selectedSellerId,
}: {
  selectedSellerId: MapAdapterProps["selectedSellerId"];
}) {
  const map = useMap();

  const recompute = useCallback(() => {
    const container = map.getContainer();
    const labels = Array.from(
      container.querySelectorAll<HTMLElement>(".gm-map-marker__label"),
    );
    for (const label of labels) label.classList.remove("gm-map-marker__label--hidden");

    // Приоритет: выбранный продавец → ближайшая к центру экрана → порядок DOM
    // (стабильный tiebreaker, чтобы результат был детерминирован).
    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.left + containerRect.width / 2;
    const centerY = containerRect.top + containerRect.height / 2;
    const ordered = labels
      .map((el, index) => {
        const sellerId =
          el.parentElement?.querySelector("[data-seller-id]")?.getAttribute("data-seller-id") ?? null;
        const rect = el.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - centerX;
        const dy = rect.top + rect.height / 2 - centerY;
        return { el, selected: sellerId !== null && sellerId === selectedSellerId, distSq: dx * dx + dy * dy, index };
      })
      .sort((a, b) => Number(b.selected) - Number(a.selected) || a.distSq - b.distSq || a.index - b.index);

    const hidden = new Set<HTMLElement>();
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i];
      if (hidden.has(a.el)) continue;
      const ra = a.el.getBoundingClientRect();
      for (let j = i + 1; j < ordered.length; j++) {
        const b = ordered[j];
        if (hidden.has(b.el)) continue;
        const rb = b.el.getBoundingClientRect();
        const intersects =
          ra.left < rb.right && ra.right > rb.left && ra.top < rb.bottom && ra.bottom > rb.top;
        if (intersects) hidden.add(b.el);
      }
    }
    for (const label of labels) {
      label.classList.toggle("gm-map-marker__label--hidden", hidden.has(label));
    }
  }, [map, selectedSellerId]);

  useEffect(() => {
    recompute();
    map.on("moveend zoomend", recompute);
    // Подписи появляются/исчезают вместе с DOM маркеров (кластеризация,
    // spiderfy, пересоздание иконок при зуме) — там событий moveend/zoomend
    // может не быть, MutationObserver ловит изменения состава маркеров.
    const observer = new MutationObserver(() => requestAnimationFrame(recompute));
    observer.observe(map.getContainer(), { subtree: true, childList: true });
    return () => {
      map.off("moveend zoomend", recompute);
      observer.disconnect();
    };
  }, [map, recompute]);

  return null;
}

export function LeafletAdapter({
  sellers,
  selectedSellerId,
  userLocation,
  camera,
  onMapLoaded,
  onCameraChange,
  onVisibleBoundsChange,
  onSellerSelect,
  onMapBackgroundClick,
  centerRequestToken,
}: MapAdapterProps) {
  return (
    // data-testid on a wrapper div (rather than on MapContainer itself, whose typed
    // props don't include arbitrary data-* attributes) — IMP-003.1 §3: this remains
    // the only file that touches "leaflet"/"react-leaflet" directly.
    <div data-testid="leaflet-map" style={{ width: "100%", height: "100%" }}>
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
        <LabelCollisionBridge selectedSellerId={selectedSellerId} />

        {userLocation && (
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={7}
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
         *  можно было выбрать. */}
        <MarkerClusterGroup
          maxClusterRadius={20}
          showCoverageOnHover={false}
          spiderfyOnMaxZoom={true}
          zoomToBoundsOnClick={true}
          iconCreateFunction={clusterDivIcon}
        >
          {sellers.map((seller) => (
            <Marker
              key={seller.sellerId}
              position={[seller.location.lat, seller.location.lng]}
              icon={sellerDivIcon(seller.name, seller.sellerId === selectedSellerId, seller.isAvailable, seller.sellerId, camera.zoom)}
              eventHandlers={{ click: () => onSellerSelect(seller.sellerId) }}
            />
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
