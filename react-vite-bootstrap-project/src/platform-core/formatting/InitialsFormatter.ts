/**
 * Инициалы из имени: первые буквы первых двух слов, верхний регистр.
 * Единственный источник этого правила — раньше оно копировалось в трёх
 * экранах (seller-card, seller-list, рекомендации), см. ревью-замечание
 * «копирование логики при появлении второго экрана».
 */
export const InitialsFormatter = {
  format(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  },
};
