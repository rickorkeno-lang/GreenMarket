import { asProductId, type SellerId } from "@/platform-core/contracts/Action";
import type { CategoryId } from "@/platform-core/contracts/DomainTypes";
import type { ProductRecord } from "@/platform-core/contracts/DomainTypes";
import type { SellerProductRecord } from "@/platform-core/map/repository/SellerRepository";

/* ============================================================================
 * Mock-каталог товаров продавцов (страница продавца, seller-card).
 *
 * Продавцы в MockSellerRepository несли только атрибуты (название, рейтинг,
 * категории, часы работы) — товаров у них не было. ТЗ-025 требует на карточке
 * продавца список товаров с ценой/единицей/доступностью, поэтому здесь
 * определяется каталог: пул товаров на каждую категорию + детерминированный
 * построитель набора товаров конкретного продавца.
 *
 * Сам интерфейс SellerProductRecord живёт в контракте SellerRepository
 * (см. замечание ревью №14), здесь — только данные и построение.
 * ========================================================================== */

interface ProductSeed {
  name: string;
  price: number;
  unit: string;
  emoji: string;
  description: string;
  /** Ключевые слова для поиска по товару: синонимы и распространённые
   *  варианты написания («помидор» → томаты, «морква» → морковь). Опциональны:
   *  без тегов товар ищется по названию и системе «Возможно вы имели в виду». */
  tags?: string[];
}

/** Пул товаров по категориям. Категории совпадают с CATEGORIES в
 *  MockSellerRepository; наборы детерминированы (без Math.random).
 *  Ключи — строковые CategoryId (brand-тип здесь только на уровне типов). */
const PRODUCT_SEEDS: Record<string, ProductSeed[]> = {
  vegetables: [
    { name: "Морковь", price: 45, unit: "1 кг", emoji: "🥕", description: "Сладкая, с грядки", tags: ["морковка", "морква"] },
    { name: "Картофель молодой", price: 55, unit: "1 кг", emoji: "🥔", description: "Отборный, для варки и жарки", tags: ["картошка", "молодая картошка"] },
    { name: "Томаты", price: 180, unit: "1 кг", emoji: "🍅", description: "Мясистые, сочные", tags: ["помидор", "помидоры", "томат"] },
    { name: "Огурцы", price: 120, unit: "1 кг", emoji: "🥒", description: "Хрустящие, свежий урожай", tags: ["огурчик"] },
    { name: "Яблоки", price: 90, unit: "1 кг", emoji: "🍎", description: "Летние, ароматные", tags: ["яблочко", "яблоко"] },
    { name: "Свёкла", price: 40, unit: "1 кг", emoji: "🍠", description: "Для борща и салатов", tags: ["свекла"] },
  ],
  dairy: [
    { name: "Молоко", price: 85, unit: "1 л", emoji: "🥛", description: "Цельное, 3.5%", tags: ["молочко", "молоко цельное"] },
    { name: "Творог", price: 140, unit: "250 г", emoji: "🧀", description: "Домашний, нежный", tags: ["творожок"] },
    { name: "Сметана", price: 95, unit: "300 г", emoji: "🥣", description: "20%, густая" },
    { name: "Сыр молодой", price: 320, unit: "200 г", emoji: "🧀", description: "Собственного производства", tags: ["сыр"] },
    { name: "Кефир", price: 75, unit: "1 л", emoji: "🥛", description: "Свежий, 2.5%" },
  ],
  meat: [
    { name: "Говядина", price: 620, unit: "1 кг", emoji: "🥩", description: "Мраморная, охлаждённая", tags: ["говядинка"] },
    { name: "Курица", price: 260, unit: "1 кг", emoji: "🍗", description: "Тушка, охлаждённая", tags: ["курятина", "кура"] },
    { name: "Фарш говяжий", price: 480, unit: "500 г", emoji: "🥩", description: "Свежеприготовленный", tags: ["фарш"] },
    { name: "Колбаса копчёная", price: 540, unit: "400 г", emoji: "🌭", description: "Домашнего копчения", tags: ["колбаса"] },
  ],
  bakery: [
    { name: "Хлеб деревенский", price: 60, unit: "500 г", emoji: "🍞", description: "На закваске, из печи", tags: ["хлеб", "буханка"] },
    { name: "Багет", price: 45, unit: "300 г", emoji: "🥖", description: "Хрустящий, тёплый", tags: ["багеттик"] },
    { name: "Пирог с яблоком", price: 220, unit: "1 шт", emoji: "🥧", description: "Домашняя выпечка", tags: ["пирог"] },
    { name: "Булочка сдобная", price: 35, unit: "1 шт", emoji: "🥐", description: "Свежая, к чаю", tags: ["булочка", "сдоба"] },
  ],
  honey: [
    { name: "Мёд цветочный", price: 380, unit: "500 г", emoji: "🍯", description: "Майский, светлый", tags: ["мед", "мёд", "цветочный мед"] },
    { name: "Мёд липовый", price: 420, unit: "500 г", emoji: "🍯", description: "Ароматный, густой", tags: ["липовый мед", "мед"] },
    { name: "Варенье клубничное", price: 190, unit: "300 г", emoji: "🍓", description: "Домашнее", tags: ["варенье"] },
    { name: "Мёд с пергой", price: 450, unit: "350 г", emoji: "🍯", description: "Полезный, с ореховой ноткой", tags: ["перга"] },
  ],
  fish: [
    { name: "Форель", price: 850, unit: "1 кг", emoji: "🐟", description: "Свежая, выловленная", tags: ["форелька"] },
    { name: "Карп", price: 320, unit: "1 кг", emoji: "🐟", description: "Живой, из пруда" },
    { name: "Креветки", price: 640, unit: "500 г", emoji: "🦐", description: "Крупные, охлаждённые", tags: ["креветка"] },
    { name: "Скумбрия", price: 280, unit: "1 кг", emoji: "🐠", description: "Солёная, бочковая" },
  ],
  herbs: [
    { name: "Укроп", price: 40, unit: "1 пучок", emoji: "🌿", description: "Свежий, с грядки" },
    { name: "Петрушка", price: 40, unit: "1 пучок", emoji: "🌿", description: "Свежая" },
    { name: "Базилик", price: 55, unit: "1 пучок", emoji: "🌿", description: "Фиолетовый, ароматный", tags: ["базилик фиолетовый"] },
    { name: "Мята", price: 50, unit: "1 пучок", emoji: "🌱", description: "Для чая и лимонада" },
  ],
  nuts: [
    { name: "Грецкие орехи", price: 520, unit: "300 г", emoji: "🥜", description: "Очищенные, отборные", tags: ["орех", "орехи"] },
    { name: "Миндаль", price: 460, unit: "250 г", emoji: "🥜", description: "Сладкий, сырой" },
    { name: "Изюм", price: 190, unit: "300 г", emoji: "🍇", description: "Светлый, без косточек" },
    { name: "Курага", price: 240, unit: "300 г", emoji: "🍑", description: "Сочная, мягкая", tags: ["урюк"] },
  ],
};

/** Детерминированная доступность товара: та же схема, что у атрибутов
 *  продавцов (см. buildSellers в MockSellerRepository) — без Math.random,
 *  чтобы страница и тесты были воспроизводимы. */
function availabilityFor(sellerIndex: number, productIndex: number): ProductRecord["availability"] {
  const n = sellerIndex * 7 + productIndex;
  if (n % 9 === 0) return "missing";
  if (n % 5 === 0) return "replacement";
  return "available";
}

/** Сколько товаров продавец получает из каждой своей категории. */
const PRODUCTS_PER_CATEGORY = 4;

/** Набор товаров продавца: по PRODUCTS_PER_CATEGORY из каждой его категории,
 *  выбор детерминирован (сдвиг от индекса продавца и позиции категории). */
export function buildSellerProducts(
  sellerId: SellerId,
  categoryIds: CategoryId[],
  sellerIndex: number,
): SellerProductRecord[] {
  const products: SellerProductRecord[] = [];
  categoryIds.forEach((categoryId, categoryIndex) => {
    const seeds = PRODUCT_SEEDS[categoryId];
    if (!seeds) return;
    const start = (sellerIndex * 2 + categoryIndex * 3) % seeds.length;
    for (let k = 0; k < PRODUCTS_PER_CATEGORY; k += 1) {
      const seed = seeds[(start + k) % seeds.length];
      products.push({
        id: asProductId(`${sellerId}:${categoryId}:${k + 1}`),
        name: seed.name,
        price: seed.price,
        unit: seed.unit,
        categoryId,
        emoji: seed.emoji,
        description: seed.description,
        availability: availabilityFor(sellerIndex, products.length),
        tags: seed.tags ?? [],
      });
    }
  });
  return products;
}
