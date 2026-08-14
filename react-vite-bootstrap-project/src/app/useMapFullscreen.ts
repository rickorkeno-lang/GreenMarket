import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export interface MapFullscreenApi {
  /** Ссылка на полноэкранную поверхность (обёртка MapSurface). */
  surfaceRef: RefObject<HTMLDivElement>;
  /** Реальное состояние Fullscreen API (синхронизируется через fullscreenchange,
   *  включая выход по Esc и средствами браузера). */
  isFullscreen: boolean;
  /** Fullscreen API поддерживается браузером (document.fullscreenEnabled). */
  fullscreenSupported: boolean;
  toggleFullscreen: () => void;
}

/**
 * MAP-031: вход/выход из полноэкранного режима браузера (Fullscreen API).
 *
 * Полноэкранный режим применяется к ОБЁРТКЕ MapSurface (переданной в
 * surfaceRef), а не к самому Leaflet-контейнеру: вместе с картой в полноэкранном
 * режиме остаются Bottom Sheet, Seller Card, FAB и прочие map overlays — по
 * спецификации Fullscreen element служит containing block для своих
 * position:fixed потомков, так что overlays пересчитываются относительно
 * полноэкранной поверхности.
 *
 * Переключение НЕ трогает состояние карты (camera, markers, filters, selected,
 * route, открытые overlays): requestFullscreen/exitFullscreen не перемонтируют
 * DOM и не сбрасывают ни состояние MapRuntime, ни локальное состояние
 * MapScreenView. Выход из fullscreen (кнопка/Esc/средства браузера) возвращает
 * поверхность к обычному размеру без пересоздания карты.
 *
 * Состояние кнопки — производное от document.fullscreenElement через событие
 * fullscreenchange, поэтому кнопка всегда отражает фактическое состояние
 * браузера, а не намерение.
 */
export function useMapFullscreen(): MapFullscreenApi {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [fullscreenSupported] = useState(
    () => typeof document !== 'undefined' && document.fullscreenEnabled,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!fullscreenSupported) return;
    if (document.fullscreenElement) {
      // Выход: по кнопке (Esc/средства браузера обрабатываются автоматически —
      // состояние обновит fullscreenchange).
      document.exitFullscreen().catch(() => {});
    } else if (surfaceRef.current) {
      surfaceRef.current.requestFullscreen().catch(() => {});
    }
  }, [fullscreenSupported]);

  return { surfaceRef, isFullscreen, fullscreenSupported, toggleFullscreen };
}
