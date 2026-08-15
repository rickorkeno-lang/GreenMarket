/** IMP-003.1 §4: TileProvider — единственное место, где хранится URL тайлов
 *  и attribution. Запрещено хранить эти значения внутри компонентов или
 *  использовать напрямую в JSX — весь код обращается только сюда. */
export interface TileProviderConfig {
  urlTemplate: string;
  attribution: string;
  maxZoom: number;
  minZoom: number;
  /** Cache Policy — на Stage 1 полагаемся на HTTP-кеш браузера (стандартное
   *  поведение Leaflet TileLayer); отдельный слой кеширования не требуется
   *  по объёму Stage 1, но конфигурация уже централизована для будущего
   *  расширения (например, Service Worker cache) без изменения экрана. */
  crossOrigin: boolean;
  /** MAP-036: резервный провайдер тайлов на случай недоступности основного
   *  (переключение — LeafletAdapter по счётчику ошибок TileFallback).
   *  ОБЯЗАТЕЛЬНО другой хост, иначе фолбэк бессмыслен: при падении хостинга
   *  недоступны оба. Ключ не требуется ни одному из используемых провайдеров,
   *  только attribution. */
  fallback?: TileProviderConfig;
}

/** MAP-036: резервный провайдер для стандартной карты — Esri World Street Map.
 *  Без API-ключа (только attribution). Хост server.arcgisonline.com отличается
 *  от tile.openstreetmap.org, поэтому фолбэк реально спасает при падении OSM.
 *  Формат URL у Esri — {z}/{y}/{x} (порядок y/x наоборот против OSM), Leaflet
 *  подставляет именованные плейсхолдеры в любом порядке. Объявлен первым:
 *  OpenStreetMapTileProvider ссылается на него в `fallback` при инициализации
 *  модуля (TDZ у const-объявлений не допускает обратный порядок). */
export const EsriWorldStreetMapTileProvider: TileProviderConfig = {
  urlTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  attribution: "&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  maxZoom: 19,
  minZoom: 3,
  crossOrigin: true,
};

export const OpenStreetMapTileProvider: TileProviderConfig = {
  urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  minZoom: 3,
  crossOrigin: true,
  fallback: EsriWorldStreetMapTileProvider,
};

/** Провайдер "чистой карты" (MAP-027). Использует CartoDB Voyager.
 *  Отображает дороги, дома и природные зоны, но убирает большинство мелких POI
 *  (магазинов, ресторанов и т.д.), уменьшая визуальный шум. */
export const CleanMapTileProvider: TileProviderConfig = {
  urlTemplate: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  maxZoom: 19,
  minZoom: 3,
  crossOrigin: true,
  // Другой хост, чем у CartoDB: при падении basemaps.cartocdn.com подложка всё
  // ещё появится. POI при фолбэке вернутся (у OSM они есть) — это приемлемая
  // цена за то, что карта вообще остаётся на экране при отказе провайдера.
  fallback: OpenStreetMapTileProvider,
};
