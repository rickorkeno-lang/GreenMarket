import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { useDraggablePanel } from './useDraggablePanel';
import './map.css';

const STORAGE_KEY = 'gm.fab-panel.position';

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
    autoCollapseMs: 8_000,
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
          data-testid="fab-panel-toggle"
        >
          {expanded ? (
            <span className="gm-map-fab-panel__chevron" />
          ) : (
            <span className="gm-map-fab-panel__chevron gm-map-fab-panel__chevron--up" />
          )}
        </button>

        {expanded && children}
        <div
          className="gm-map-fab-panel__handle"
          data-testid="fab-panel-handle"
        />
      </div>
    </div>
  );
});
