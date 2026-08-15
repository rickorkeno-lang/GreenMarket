import { useEffect, useState } from 'react';

/** Мобильная вёрстка: узкие экраны — до tablet (768px) из дизайн-токенов
 *  (scales.ts). Шапки карты и списка «Все продавцы» на мобиле и десктопе
 *  структурно разные (поиск/фильтр в разных местах), поэтому по этой проверке
 *  рендерится та или иная разметка. matchMedia держит значение актуальным при
 *  повороте/ресайзе — весь экран при этом не перемонтируется. */
const MOBILE_QUERY = '(max-width: 767.98px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);
  return isMobile;
}
