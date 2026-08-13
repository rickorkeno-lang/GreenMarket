// price/min_price/stock приходят строками (Decimal на бэке) — здесь единственное
// место, где Buyer MVP парсит их для отображения.

export function formatPrice(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
}

export function formatStock(stock: string, unit: string): string {
  const n = Number(stock);
  if (Number.isNaN(n)) return `${stock} ${unit}`;
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${unit}`;
}

export function formatOfferCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  let word = 'предложений';
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) word = 'предложение';
    else if (mod10 >= 2 && mod10 <= 4) word = 'предложения';
  }
  return `${count} ${word}`;
}

/**
 * Датировка завоза предложения. Строка «ГГГГ-ММ-ДД» из SellerOffer.supply_date;
 * сравнение с текущей датой — на стороне UI (сервер дату не размечает).
 * Прошедшая/сегодняшняя — состоявшийся завоз («Привезено 01.08»), будущая —
 * планируемая поставка («Ожидается 12.08»). Пустая/некорректная дата → null
 * (строка в карточке не выводится).
 */
export function formatSupplyDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    return null;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const label = date.getTime() <= today.getTime() ? 'Привезено' : 'Ожидается';
  return `${label} ${day}.${month}`;
}
