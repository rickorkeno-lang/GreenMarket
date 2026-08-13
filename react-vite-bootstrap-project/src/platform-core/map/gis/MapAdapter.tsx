import type { MapAdapterProps } from "@/platform-core/map/gis/MapAdapterTypes";
import { LeafletAdapter } from "@/platform-core/map/gis/LeafletAdapter";

/** IMP-003.1 §3: MapScreenView → MapAdapter → LeafletAdapter → Leaflet → OSM.
 *  Сегодня единственная реализация — LeafletAdapter; замена движка карты
 *  означает замену одной строки ниже, без изменения экрана или ViewModel. */
export function MapAdapter(props: MapAdapterProps) {
  return <LeafletAdapter {...props} />;
}

export type { MapAdapterProps } from "@/platform-core/map/gis/MapAdapterTypes";
