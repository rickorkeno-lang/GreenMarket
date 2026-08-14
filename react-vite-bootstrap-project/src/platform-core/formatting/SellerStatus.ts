import type { SellerMapRecord } from "@/platform-core/map/viewmodels/MapViewModel";

/** Статус продавца для бейджа «О продавце»: бизнес-маппинг
 *  «недоступен / открыт сейчас / сейчас закрыт» живёт в общем форматтере,
 *  а не в контроллере или JSX (замечание ревью №13). */
export interface SellerStatusPresentation {
  text: string;
  tone: 'success' | 'neutral' | 'danger';
}

export function sellerStatus(record: SellerMapRecord): SellerStatusPresentation {
  // Замечание №2: если бэкенд не отдал статус доступности — честно «не указан»,
  // а не ложное «Недоступен» (отсутствие данных ≠ недоступность).
  if (record.isAvailable == null) return { text: "Статус не указан", tone: "neutral" };
  if (!record.isAvailable) return { text: "Недоступен", tone: "danger" };
  if (record.isOpenNow) return { text: "Открыт сейчас", tone: "success" };
  return { text: "Сейчас закрыт", tone: "neutral" };
}
