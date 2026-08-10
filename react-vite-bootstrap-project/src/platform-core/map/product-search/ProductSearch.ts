import { type SellerMapRecord } from "@/platform-core/map/viewmodels/MapViewModel";

/* ============================================================================
 * Поиск продавцов по товарам (продуктовый поиск, MAP-XXX).
 *
 * Доменный модуль: чистые функции над «кандидатами» (название товара + теги)
 * без знания о репозитории и UI. Используется и картой, и списком продавцов,
 * и MockSellerRepository.
 *
 * Три идеи:
 *   1. Теги — ключевые слова/синонимы товара: «помидоры» ищется и по тегу
 *      «томат», «морковь» — по «морква». Прямое совпадение = название или тег
 *      содержит запрос (или запрос содержит тег целиком).
 *   2. Автодополнение названия товара: пока у запроса есть прямые совпадения,
 *      подсказки предлагают дописать название; выбор названия подставляет его
 *      в поле и показывает продавцов с ценой на этот товар.
 *   3. «Возможно вы имели в виду»: прямых совпадений нет — берётся товар с
 *      максимальным процентом схожести (Левенштейн по названию и тегам), но
 *      только если он превышает порог PRODUCT_SIMILARITY_THRESHOLD_PERCENT
 *      (85). Тогда сразу предлагаются продавцы этого товара.
 * ========================================================================== */

/** Режим строки поиска: по названию продавца или по товару. */
export type SearchMode = "name" | "product";

/** Порог «Возможно вы имели в виду»: система срабатывает только если товар
 *  со схожестью выше этого процента существует (требование задачи, >85). */
export const PRODUCT_SIMILARITY_THRESHOLD_PERCENT = 85;

/** Кандидат поиска — минимальные данные товара, с которыми работают чистые
 *  функции ниже. Строится из каталога товаров (MockSellerRepository). */
export interface ProductSearchCandidate {
  /** Каноническое название товара для отображения («Морковь»). */
  name: string;
  /** Название, нормализованное для поиска (нижний регистр, «ё»→«е»). */
  normalizedName: string;
  /** Нормализованные теги (ключевые слова/синонимы) товара. */
  tags: string[];
}

/** Предложение автодополнения названия товара (строка дропдауна «названия»). */
export interface ProductNameSuggestion {
  name: string;
  emoji: string;
  /** У скольких продавцов этот товар есть — сортировка/подпись подсказки. */
  sellerCount: number;
  /** Минимальная цена среди продавцов (подпись «от … ₽»). */
  minPrice: number;
}

/** Продавец с ценой на искомый товар (строка дропдауна/списка «продавцы»). */
export interface ProductSellerMatch {
  seller: SellerMapRecord;
  productName: string;
  price: number;
  unit: string;
  emoji: string;
}

/** Итог товарного поиска: какой товар выбран и продавцы с ценой на него. */
export interface ProductSearchResult {
  /** Товар, найденный напрямую (по названию/тегу). null — прямых нет. */
  matchedProduct: string | null;
  /** Товар по «Возможно вы имели в виду» (схожесть >85%), когда прямых нет. */
  suggestedProduct: string | null;
  sellers: ProductSellerMatch[];
}

/** Нормализация для поиска: нижний регистр и «ё»→«е» — «мёд» и «мед»
 *  считаются одинаковыми (тот же приём, что в MockSellerRepository). */
export function normalizeProductSearch(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

/** Расстояние Левенштейна — основа процента схожести строк. */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length];
}

/** Процент схожести двух строк: (1 - Левенштейн / maxLen) × 100.
 *  Строки нормализуются, точное совпадение = 100. */
export function stringSimilarityPercent(a: string, b: string): number {
  const left = normalizeProductSearch(a);
  const right = normalizeProductSearch(b);
  if (left === right) return 100;
  if (left.length === 0 || right.length === 0) return 0;
  const maxLength = Math.max(left.length, right.length);
  return Math.round(((maxLength - levenshteinDistance(left, right)) / maxLength) * 100);
}

/** Схожесть запроса с кандидатом: максимум по названию и всем тегам —
 *  «помідор» близок и к названию «Помидоры», и к тегу «помидор». */
export function productCandidateSimilarity(query: string, candidate: ProductSearchCandidate): number {
  const q = normalizeProductSearch(query);
  const base = stringSimilarityPercent(q, candidate.normalizedName);
  return candidate.tags.reduce((best, tag) => Math.max(best, stringSimilarityPercent(q, tag)), base);
}

/** Ранг прямого совпадения (меньше = лучше): точное равенство названию,
 *  затем префикс названия, полный тег, подстрока названия, подстрока тега. */
function directMatchRank(candidate: ProductSearchCandidate, q: string): number {
  if (candidate.normalizedName === q) return 0;
  if (candidate.normalizedName.startsWith(q)) return 1;
  if (candidate.tags.some((tag) => tag === q)) return 2;
  if (candidate.normalizedName.includes(q)) return 3;
  if (candidate.tags.some((tag) => tag.includes(q) || q.includes(tag))) return 4;
  return 5;
}

/** Прямые совпадения запроса с кандидатами (по названию или тегам), отсорти
 *  рованные по релевантности (ранг → стабильно по названию). Пустой запрос
 *  возвращает []. Это «автодополнение названия товара»: пока есть прямые
 *  совпадения, подсказки предлагают дописать название. */
export function findDirectProductMatches(
  query: string,
  candidates: ProductSearchCandidate[],
): ProductSearchCandidate[] {
  const q = normalizeProductSearch(query);
  if (!q) return [];
  return candidates
    .filter(
      (candidate) =>
        candidate.normalizedName.includes(q) || candidate.tags.some((tag) => tag.includes(q) || q.includes(tag)),
    )
    .sort((a, b) => {
      const rankDiff = directMatchRank(a, q) - directMatchRank(b, q);
      return rankDiff !== 0 ? rankDiff : a.normalizedName < b.normalizedName ? -1 : 1;
    });
}

/** «Возможно вы имели в виду»: кандидат с максимальной схожестью, если она
 *  выше порога. Возвращает null, когда подходящего товара нет. */
export function findMostSimilarProduct(
  query: string,
  candidates: ProductSearchCandidate[],
  thresholdPercent: number = PRODUCT_SIMILARITY_THRESHOLD_PERCENT,
): ProductSearchCandidate | null {
  const q = normalizeProductSearch(query);
  if (!q) return null;
  let best: ProductSearchCandidate | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = productCandidateSimilarity(q, candidate);
    if (score >= thresholdPercent && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
