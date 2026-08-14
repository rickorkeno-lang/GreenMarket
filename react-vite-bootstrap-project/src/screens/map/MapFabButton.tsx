import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, IconButton } from '@/design-system/components';
import './map.css';

// MAP-027: Уменьшено на ~40% с 667 мс для более быстрого появления текста
export const MAP_FAB_TOOLTIP_DELAY_MS = 400;

export interface MapFabButtonProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  testId?: string;
}

/**
 * Круглая плавающая кнопка над картой (FAB). Показывает тултип слева после
 * короткой задержки при наведении/фокусе — так же, как кнопка геолокации.
 */
export function MapFabButton({ label, icon, onClick, testId }: MapFabButtonProps) {
  const tooltipId = useId();
  const timerRef = useRef<number | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const showTooltip = () => {
    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(
      () => setTooltipVisible(true),
      MAP_FAB_TOOLTIP_DELAY_MS,
    );
  };

  const hideTooltip = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setTooltipVisible(false);
  };

  return (
    <div className="gm-map-fab">
      <IconButton
        label={label}
        onClick={onClick}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        aria-describedby={tooltipVisible ? tooltipId : undefined}
        data-testid={testId}
      >
        <Icon>{icon}</Icon>
      </IconButton>
      {tooltipVisible && (
        <span id={tooltipId} role="tooltip" className="gm-map-fab__tooltip">
          {label}
        </span>
      )}
    </div>
  );
}
