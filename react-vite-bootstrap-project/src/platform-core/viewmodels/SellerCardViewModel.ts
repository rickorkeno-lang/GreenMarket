import type { AvailableAction, PhotoItem } from "../contracts/ContentBlock";
import type { SellerId } from "../contracts/Action";
import type { ProductRecord } from "../contracts/DomainTypes";

/* ----------------------------------------------------------------------------
 * АРХИТЕКТУРНОЕ РЕШЕНИЕ (2026-07-10): Вариант А.
 *
 * Раньше здесь было предупреждение о рассинхроне между полями ТЗ-025 §12
 * (SellerCardViewModel: seller/coverage/importantAlerts/basketProducts/
 * otherProducts/trustInfo/availableActions/photos/reports) и общим ContentBlock[].
 *
 * Решение: Backend/Platform Core отдаёт именно SellerCardViewModel — доменную
 * модель на языке ТЗ-025, без знания о рендеринге. Bottom Sheet остаётся общим
 * декларативным рендерером ContentBlock[] (переиспользуемым для будущих
 * экранов). Между ними — явный типизированный Adapter (по сути и есть
 * SellerCardBuilder из ТЗ-027 §5), см. adapters/SellerCardAdapter.ts.
 * Backend никогда не формирует ContentBlock напрямую и не знает об этом типе.
 * -------------------------------------------------------------------------- */

/** Доменный контракт по ТЗ-025 §12 + доработки v1.1 — то, что реально отдаёт
 *  Backend/Platform Core. Ничего из этого не знает про рендеринг. */
export interface SellerCardViewModel {
  /** rating/distance — необязательны: бэкенд может не отдать оценку/расстояние
   *  (замечание №2 — карточка не выдумывает факты, их отсутствие явно в типе). */
  seller: { id: SellerId; name: string; rating?: number; distance?: string };
  coverage: { have: number; total: number; fullyCovered: boolean };
  importantAlerts: string[];
  /** ТЗ-025 v1.1 §6: порядок фиксирован — доступные → замены → отсутствующие.
   *  Сортировка — ответственность Backend/Adapter, не React. */
  basketProducts: ProductRecord[];
  otherProducts: ProductRecord[];
  /** Строка о доверии («Продавец проверен площадкой…»); undefined — информации
   *  нет (у продавца с бэкенда, чей профиль не содержит проверок). */
  trustInfo?: string;
  /** ТЗ-025 v1.1 §7: уровень доверия и актуальность данных о продавце. */
  trustLevel?: "high" | "medium" | "low";
  lastConfirmedAt?: string;
  dataMayBeStale: boolean;
  /** ТЗ-025 v1.1 §10: фотографии — независимая lazy-загружаемая лента. */
  photos: PhotoItem[];
  availableActions: AvailableAction[];
  /** ТЗ-025 v1.1 §9: автор и уровень доверия сообщения. */
  reports: { id: string; title: string; date: string; author?: string; trustLevel?: "high" | "medium" | "low" }[];
  isFavorite: boolean;
  otherProductsExpanded: boolean;
  loadState: "loading" | "error" | "ready";
}
