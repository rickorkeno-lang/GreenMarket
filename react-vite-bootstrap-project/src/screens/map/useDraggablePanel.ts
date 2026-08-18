import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const MAX_OBSTACLE_PASSES = 6;
const DEFAULT_OFFSET = { x: 0, y: 0 };

function getStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function loadPosition(key: string): { x: number; y: number } | null {
  try {
    const raw = getStorage()?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
    return null;
  } catch {
    return null;
  }
}

function savePosition(key: string, pos: { x: number; y: number }) {
  getStorage()?.setItem(key, JSON.stringify(pos));
}

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function measureObstacles(selectors: readonly string[]): DOMRect[] {
  return selectors
    .map(sel => document.querySelector<HTMLElement>(sel))
    .filter((el): el is HTMLElement => el !== null && el.offsetHeight > 0)
    .map(el => el.getBoundingClientRect());
}

export interface UseDraggablePanelOptions {
  storageKey: string;
  obstacleSelectors: readonly string[];
  /** 'bottom-right' = fab panel anchor, 'bottom-left' = legend anchor */
  anchor: 'bottom-left' | 'bottom-right';
  onReturnRequest?: (show: boolean) => void;
  /** Автосворачивание через N мс неактивности (pointer-события сбрасывают таймер). */
  autoCollapseMs?: number;
}

export interface UseDraggablePanelReturn {
  offset: { x: number; y: number };
  dragging: boolean;
  expanded: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  panelRef: React.RefObject<HTMLDivElement>;
  resetPosition: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
}

export function useDraggablePanel({
  storageKey,
  obstacleSelectors,
  anchor,
  onReturnRequest,
  autoCollapseMs,
}: UseDraggablePanelOptions): UseDraggablePanelReturn {
  const [expanded, setExpanded] = useState(false);
  const [offset, setOffset] = useState<{ x: number; y: number }>(
    () => loadPosition(storageKey) ?? { ...DEFAULT_OFFSET },
  );
  const [dragging, setDragging] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null!);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const draggingRef = useRef(false);
  const panelSizeRef = useRef({ w: 0, h: 0 });
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  const resetPosition = useCallback(() => {
    savePosition(storageKey, DEFAULT_OFFSET);
    setOffset({ ...DEFAULT_OFFSET });
  }, [storageKey]);

  // ── Auto-collapse: свернуть панель через autoCollapseMs неактивности ──
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current !== null) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const startCollapseTimer = useCallback(() => {
    clearCollapseTimer();
    if (!autoCollapseMs) return;
    collapseTimerRef.current = setTimeout(() => {
      collapseTimerRef.current = null;
      setExpanded(false);
    }, autoCollapseMs);
  }, [autoCollapseMs, clearCollapseTimer]);

  useEffect(() => {
    if (expanded && autoCollapseMs) {
      startCollapseTimer();
    } else {
      clearCollapseTimer();
    }
    return clearCollapseTimer;
  }, [expanded, autoCollapseMs, startCollapseTimer, clearCollapseTimer]);

  // Сброс таймера при любом pointer-событии на панели
  useEffect(() => {
    if (!expanded || !autoCollapseMs) return;
    const el = panelRef.current;
    if (!el) return;
    const reset = () => startCollapseTimer();
    el.addEventListener('pointerdown', reset, { passive: true });
    el.addEventListener('pointermove', reset, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', reset);
      el.removeEventListener('pointermove', reset);
    };
  }, [expanded, autoCollapseMs, startCollapseTimer]);

  /** Измеряет визуальные размеры: если внутри есть [data-measure], берём
   *  его offsetWidth/Height (не включает padding хитбокса), иначе — сам элемент. */
  const measureSize = useCallback((): { w: number; h: number } => {
    const el = panelRef.current;
    if (!el) return { w: 56, h: 56 };
    const m = el.querySelector<HTMLElement>('[data-measure]');
    return { w: m ? m.offsetWidth : el.offsetWidth, h: m ? m.offsetHeight : el.offsetHeight };
  }, []);

  const resolvePosition = useCallback(
    (rawX: number, rawY: number, bodyW: number, bodyH: number) => {
      const el = panelRef.current;
      if (!el) return { x: rawX, y: rawY };

      const mapEl = el.closest('.gm-map-screen');
      if (!mapEl) return { x: rawX, y: rawY };

      const mapRect = mapEl.getBoundingClientRect();

      /* Полные размеры элемента (включая padding хитбокса) —
       * используются для collision rect, чтобы совпадать
       * с getBoundingClientRect() obstacles. */
      const fullW = el.offsetWidth;
      const fullH = el.offsetHeight;

      /* Паддинг между outer-контейнером и __body — вычисляем
       * из разницы полных и body-размеров (симметричный). */
      const padX = (fullW - bodyW) / 2;
      const padY = (fullH - bodyH) / 2;

      /* CSS-позиции по умолчанию (без transform):
       *  bottom-left: left = 16px (--space-lg),  bottom = 32px (--space-xxl)
       *  bottom-right: right = 16px,              bottom = 32px
       * baseLeft / baseTop — левый верхний угол ЭЛЕМЕНТА (включая padding)
       * в viewport-координатах. */
      let baseLeft: number;

      if (anchor === 'bottom-left') {
        baseLeft = mapRect.left + 16;
      } else {
        baseLeft = mapRect.right - 16 - fullW;
      }

      const baseTop = mapRect.bottom - 32 - fullH;

      /* Clamp: body должен оставаться внутри карты.
       * body left  = baseLeft + padX + x
       * body right = baseLeft + padX + bodyW + x
       * body top   = baseTop  + padY + y
       * body bottom= baseTop  + padY + bodyH + y                      */
      let minX: number;
      let maxX: number;

      if (anchor === 'bottom-left') {
        minX = 0;
        maxX = mapRect.width - 16 - padX - bodyW;
      } else {
        minX = -(mapRect.width - 16 - padX - bodyW);
        maxX = 0;
      }

      const minY = -(mapRect.height - 32 - padY - bodyH);
      const maxY = 0;

      const clampX = (v: number) => Math.max(minX, Math.min(maxX, v));
      const clampY = (v: number) => Math.max(minY, Math.min(maxY, v));

      let x = clampX(rawX);
      let y = clampY(rawY);

      for (let pass = 0; pass < MAX_OBSTACLE_PASSES; pass++) {
        const obstacles = measureObstacles(obstacleSelectors);
        let changed = false;

        for (const obs of obstacles) {
          const pr = {
            left: baseLeft + x,
            top: baseTop + y,
            right: baseLeft + fullW + x,
            bottom: baseTop + fullH + y,
          };

          if (!rectsOverlap(pr, obs)) continue;

          const pushes = [
            { dx: -(pr.right - obs.left), dy: 0 },
            { dx: obs.right - pr.left, dy: 0 },
            { dx: 0, dy: -(pr.bottom - obs.top) },
            { dx: 0, dy: obs.bottom - pr.top },
          ];

          let bestDist = Infinity;
          let bestX = x;
          let bestY = y;
          let pushed = false;

          for (const c of pushes) {
            const nx = clampX(x + c.dx);
            const ny = clampY(y + c.dy);
            const nr = {
              left: baseLeft + nx,
              top: baseTop + ny,
              right: baseLeft + fullW + nx,
              bottom: baseTop + fullH + ny,
            };
            if (!rectsOverlap(nr, obs)) {
              const dist = (nx - x) * (nx - x) + (ny - y) * (ny - y);
              if (dist < bestDist) {
                bestDist = dist;
                bestX = nx;
                bestY = ny;
              }
              pushed = true;
            }
          }

          if (pushed) {
            x = bestX;
            y = bestY;
            changed = true;
          }
        }

        if (!changed) break;
      }

      return { x, y };
    },
    [anchor, obstacleSelectors],
  );

  // Resolve on mount (localStorage position may overlap obstacles)
  const didMountRef = useRef(false);
  useLayoutEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;

    const { w: pw, h: ph } = measureSize();
    const pos = offsetRef.current;
    const resolved = resolvePosition(pos.x, pos.y, pw, ph);
    if (resolved.x !== pos.x || resolved.y !== pos.y) {
      savePosition(storageKey, resolved);
      setOffset(resolved);
    }
  }, [resolvePosition, storageKey, measureSize]);

  // Re-resolve after expand/collapse (panel dimensions change)
  const prevExpandedRef = useRef(expanded);
  useLayoutEffect(() => {
    if (prevExpandedRef.current === expanded) return;
    prevExpandedRef.current = expanded;

    const { w: pw, h: ph } = measureSize();
    const pos = offsetRef.current;
    const resolved = resolvePosition(pos.x, pos.y, pw, ph);
    if (resolved.x !== pos.x || resolved.y !== pos.y) {
      savePosition(storageKey, resolved);
      setOffset(resolved);
    }
  }, [expanded, resolvePosition, storageKey, measureSize]);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('.gm-map-fab, .gm-map-fab-panel__toggle, .gm-map-legend__toggle, .gm-map-legend__collapse-btn')) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = true;

      panelSizeRef.current = measureSize();

      dragStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startOffsetX: offset.x,
        startOffsetY: offset.y,
      };
    },
    [offset, measureSize],
  );

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStateRef.current) return;
      if (!draggingRef.current) {
        draggingRef.current = true;
        setDragging(true);
      }
      const ds = dragStateRef.current;
      const rawX = ds.startOffsetX + (e.clientX - ds.startX);
      const rawY = ds.startOffsetY + (e.clientY - ds.startY);
      const { w, h } = panelSizeRef.current;
      const clamped = resolvePosition(rawX, rawY, w, h);
      setOffset(clamped);
    },
    [resolvePosition],
  );

  const onDragEnd = useCallback(() => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    draggingRef.current = false;
    setDragging(false);
    savePosition(storageKey, offsetRef.current);
    const pos = offsetRef.current;
    const atDefault = pos.x === DEFAULT_OFFSET.x && pos.y === DEFAULT_OFFSET.y;
    onReturnRequest?.(!atDefault);
  }, [onReturnRequest, storageKey]);

  return {
    offset,
    dragging,
    expanded,
    setExpanded,
    panelRef,
    resetPosition,
    onDragStart,
    onDragMove,
    onDragEnd,
  };
}
