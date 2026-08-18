import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useState } from 'react';
import { useDraggablePanel } from './useDraggablePanel';
import './map.css';

const STORAGE_KEY = 'gm.legend.position';
const TOOLTIP_DELAY_MS = 400;

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
    onReturnRequest,
  });

  const tooltipId = useId();
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipTimerRef = useState(() => ({ current: null as number | null }))[0];

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current !== null) window.clearTimeout(tooltipTimerRef.current);
    };
  }, [tooltipTimerRef]);

  useImperativeHandle(ref, () => ({ resetPosition }), [resetPosition]);

  const showTooltip = useCallback(() => {
    if (tooltipTimerRef.current !== null) return;
    tooltipTimerRef.current = window.setTimeout(
      () => setTooltipVisible(true),
      TOOLTIP_DELAY_MS,
    );
  }, [tooltipTimerRef]);

  const hideTooltip = useCallback(() => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltipVisible(false);
  }, [tooltipTimerRef]);

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
          aria-describedby={tooltipVisible ? tooltipId : undefined}
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          onFocus={showTooltip}
          onBlur={hideTooltip}
          data-testid="legend-toggle"
        >
          <span className="gm-map-legend__flag" aria-hidden="true">🏁</span>
        </button>
      )}
      {tooltipVisible && !expanded && (
        <span id={tooltipId} role="tooltip" className="gm-map-legend__tooltip">
          Легенда
        </span>
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
