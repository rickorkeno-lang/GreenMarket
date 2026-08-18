import { forwardRef, useImperativeHandle } from 'react';
import { useDraggablePanel } from './useDraggablePanel';
import './map.css';

const STORAGE_KEY = 'gm.legend.position';

const OBSTACLE_SELECTORS = [
  '.gm-header',
  '.gm-map-fab-panel',
  '[data-testid="current-area-label"]',
  '.gm-map-search-row',
  '.gm-map-route-clear',
] as const;

export interface MapLegendHandle {
  resetPosition: () => void;
}

export interface MapLegendProps {
  onReturnRequest?: (show: boolean) => void;
}

export const MapLegend = forwardRef<MapLegendHandle, MapLegendProps>(function MapLegend(
  { onReturnRequest },
  ref,
) {
  const {
    offset,
    dragging,
    expanded,
    setExpanded,
    panelRef,
    resetPosition,
    onDragStart,
    onDragMove,
    onDragEnd,
  } = useDraggablePanel({
    storageKey: STORAGE_KEY,
    obstacleSelectors: OBSTACLE_SELECTORS,
    anchor: 'bottom-left',
    autoCollapseMs: 12_000,
    onReturnRequest,
  });

  useImperativeHandle(ref, () => ({ resetPosition }), [resetPosition]);

  const isDefaultPos = offset.x === 0 && offset.y === 0;

  const offsetStyle: React.CSSProperties = isDefaultPos
    ? {}
    : { transform: `translate(${offset.x}px, ${offset.y}px)` };

  const panelTransition = dragging ? 'transform 0ms' : undefined;

  return (
    <div
      ref={panelRef}
      className={[
        'gm-map-legend',
        expanded ? 'gm-map-legend--expanded' : '',
        dragging ? 'gm-map-legend--dragging' : '',
      ].filter(Boolean).join(' ')}
      style={{ ...offsetStyle, transition: panelTransition }}
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      data-testid="map-legend"
    >
      <div className="gm-map-legend__body" data-measure>
      {!expanded && (
        <button
          type="button"
          className="gm-map-legend__toggle"
          onClick={() => setExpanded(true)}
          aria-label="Развернуть легенду"
          data-testid="legend-toggle"
        >
          <span className="gm-map-legend__flag" aria-hidden="true">🏁</span>
        </button>
      )}

      {expanded && (
        <>
          <div className="gm-map-legend__item">
            <span className="gm-map-legend__swatch gm-map-legend__swatch--open" aria-hidden="true" />
            <span>Открыто сейчас</span>
          </div>
          <div className="gm-map-legend__item">
            <span className="gm-map-legend__swatch gm-map-legend__swatch--closed" aria-hidden="true" />
            <span>Закрыто сейчас</span>
          </div>
          <div className="gm-map-legend__item">
            <span className="gm-map-legend__swatch gm-map-legend__swatch--unknown" aria-hidden="true" />
            <span>Статус неизвестен</span>
          </div>
          <button
            type="button"
            className="gm-map-legend__collapse-btn"
            onClick={() => setExpanded(false)}
            data-testid="legend-collapse"
          >
            свернуть
          </button>
        </>
      )}
      <div
        className="gm-map-legend__handle"
        data-testid="legend-handle"
      />
      </div>
    </div>
  );
});
