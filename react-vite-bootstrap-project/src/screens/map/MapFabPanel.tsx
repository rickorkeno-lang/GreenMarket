import { forwardRef, useCallback, useId, useImperativeHandle, useState, type ReactNode } from 'react';
import { useDraggablePanel } from './useDraggablePanel';
import './map.css';

const STORAGE_KEY = 'gm.fab-panel.position';
const TOOLTIP_DELAY_MS = 400;

const OBSTACLE_SELECTORS = [
  '.gm-header',
  '.gm-map-legend',
  '[data-testid="current-area-label"]',
  '.gm-map-search-row',
] as const;

export interface MapFabPanelHandle {
  resetPosition: () => void;
}

export interface MapFabPanelProps {
  children: ReactNode;
  onReturnRequest?: (show: boolean) => void;
}

export const MapFabPanel = forwardRef<MapFabPanelHandle, MapFabPanelProps>(function MapFabPanel(
  { children, onReturnRequest },
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
    anchor: 'bottom-right',
    onReturnRequest,
  });

  const tooltipId = useId();
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipTimerRef = useState(() => ({ current: null as number | null }))[0];

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
        'gm-map-fab-panel',
        expanded ? 'gm-map-fab-panel--expanded' : '',
        dragging ? 'gm-map-fab-panel--dragging' : '',
      ].filter(Boolean).join(' ')}
      style={{ ...offsetStyle, transition: panelTransition }}
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      data-testid="fab-panel"
    >
      <div className="gm-map-fab-panel__body" data-measure>
        <button
          type="button"
          className="gm-map-fab-panel__toggle"
          onClick={() => setExpanded(prev => !prev)}
          aria-label={expanded ? 'Свернуть панель инструментов' : 'Открыть панель инструментов'}
          aria-describedby={tooltipVisible ? tooltipId : undefined}
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          onFocus={showTooltip}
          onBlur={hideTooltip}
          data-testid="fab-panel-toggle"
        >
          {expanded ? (
            <span className="gm-map-fab-panel__chevron" />
          ) : (
            <span className="gm-map-fab-panel__chevron gm-map-fab-panel__chevron--up" />
          )}
        </button>
        {tooltipVisible && (
          <span id={tooltipId} role="tooltip" className="gm-map-fab-panel__tooltip">
            {expanded ? 'Свернуть панель' : 'Открыть панель'}
          </span>
        )}

        {expanded && children}
        <div
          className="gm-map-fab-panel__handle"
          data-testid="fab-panel-handle"
        />
      </div>
    </div>
  );
});
