import type { CategoryOption } from "@/platform-core/map/repository/SellerRepository";
import type { SellerMapRecord } from "@/platform-core/map/viewmodels/MapViewModel";

/** Конфигурация фильтра продавцов — единый источник для UI и применения.
 *  Новый метод фильтрации = новая запись в SellerFilterGroup (buildSellerFilters),
 *  новый чекбокс = новая опция в options. Ни reducer, ни компонент при этом
 *  не меняются: состояние (selectedFilters) и применение (applySellerFilters)
 *  полностью описаны этими конфигами. */

export interface SellerFilterOption {
  /** Уникальный в пределах группы id опции (например "open", "available" или categoryId). */
  id: string;
  label: string;
  /** Условие, которому должен удовлетворять продавец, если опция выбрана. */
  matches: (seller: SellerMapRecord) => boolean;
}

export interface SellerFilterGroup {
  id: string;
  label: string;
  /** "any" — достаточно совпадения с любой выбранной опцией (как категории);
   *  "all" — продавец должен удовлетворять всем выбранным опциям (как состояние). */
  combine: "any" | "all";
  /** Подпись опции «сбросить выбор группы» (например «Все»). Отсутствует, если
   *  у группы нет такой опции. */
  allLabel?: string;
  options: SellerFilterOption[];
}

/** Группы фильтров, собранные из текущих категорий каталога. Добавление нового
 *  метода/чекбокса — это правка этого списка, без изменения архитектуры. */
export function buildSellerFilters(categories: CategoryOption[]): SellerFilterGroup[] {
  return [
    {
      id: "category",
      label: "Категория",
      combine: "any",
      allLabel: "Все",
      options: categories.map((c) => ({
        id: c.categoryId,
        label: c.name,
        matches: (s) => s.categories.includes(c.categoryId),
      })),
    },
    {
      id: "state",
      label: "Состояние",
      combine: "all",
      options: [
        /* «Только открытые» неявно исключает и недоступных: продавец, у
         * которого isAvailable = false, не может быть открыт — поэтому матчер
         * требует оба флага, а не только isOpenNow (защита от противоречивых
         * данных, когда открыт, но недоступен). */
        {
          id: "open",
          label: "Только открытые",
          matches: (s) => Boolean(s.isOpenNow && s.isAvailable),
        },
        { id: "available", label: "Только доступные", matches: (s) => Boolean(s.isAvailable) },
      ],
    },
  ];
}

/** Состояние фильтра: groupId → выбранные optionId. Группа с пустым набором
 *  не фильтрует. */
export type SellerFiltersState = Record<string, string[]>;

/** Применение всех групп: группы без выбранных опций пропускаются, внутри
 *  группы — логика combine, между группами — И (фильтры складываются). */
export function applySellerFilters(
  sellers: SellerMapRecord[],
  groups: SellerFilterGroup[],
  selected: SellerFiltersState,
): SellerMapRecord[] {
  let result = sellers;
  for (const group of groups) {
    const selectedIds = selected[group.id] ?? [];
    if (selectedIds.length === 0) continue;
    const matchers = group.options.filter((o) => selectedIds.includes(o.id)).map((o) => o.matches);
    if (matchers.length === 0) continue;
    result =
      group.combine === "any"
        ? result.filter((s) => matchers.some((m) => m(s)))
        : result.filter((s) => matchers.every((m) => m(s)));
  }
  return result;
}
